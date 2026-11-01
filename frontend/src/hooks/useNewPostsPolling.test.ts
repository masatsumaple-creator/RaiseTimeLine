import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import type { Post } from '../api/types'
import { apiError, json, stubFetch } from '../test/fakeServer'
import { POLL_INTERVAL_MS, useNewPostsPolling } from './useNewPostsPolling'

function post(id: number): Post {
  return {
    id,
    body: `p${id}`,
    createdAt: '2026-01-01T00:00:00Z',
    editedAt: null,
    author: { id: 1, handle: 'alice', displayName: 'Alice' },
    likeCount: 0,
    likedByMe: false,
    commentCount: 0,
    images: [],
  }
}

const NONE = new Set<number>()

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

async function tick(ms = POLL_INTERVAL_MS) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  tokenStore.set('access-1')
  setHidden(false)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  tokenStore.clear()
  setHidden(false)
})

describe('定期的な確認', () => {
  it('間隔が経つまでは確認しない', async () => {
    const server = stubFetch({})

    renderHook(() => useNewPostsPolling('following', 10, NONE, true))
    await tick(POLL_INTERVAL_MS - 1)

    expect(server.calls).toHaveLength(0)
  })

  it('間隔ごとに、タブと基準の投稿 id で新着を確認する', async () => {
    const server = stubFetch({
      'GET /api/timeline/new?tab=following&sinceId=10': () => json(200, { count: 0, hasMore: false, items: [] }),
    })

    renderHook(() => useNewPostsPolling('following', 10, NONE, true))
    await tick()
    await tick()

    expect(server.count('GET /api/timeline/new?tab=following&sinceId=10')).toBe(2)
  })

  it('新着があれば、件数と投稿を返す', async () => {
    stubFetch({
      'GET /api/timeline/new?tab=all&sinceId=10': () => json(200, { count: 2, hasMore: false, items: [post(12), post(11)] }),
    })

    const { result } = renderHook(() => useNewPostsPolling('all', 10, NONE, true))
    await tick()

    expect(result.current.count).toBe(2)
    expect(result.current.items.map((p) => p.id)).toEqual([12, 11])
    expect(result.current.hasMore).toBe(false)
  })

  it('件数が上限を超えていれば hasMore が true', async () => {
    stubFetch({
      'GET /api/timeline/new?tab=all&sinceId=10': () => json(200, { count: 50, hasMore: true, items: [post(60)] }),
    })

    const { result } = renderHook(() => useNewPostsPolling('all', 10, NONE, true))
    await tick()

    expect(result.current.hasMore).toBe(true)
  })

  it('新着が 0 件なら何も返さない', async () => {
    stubFetch({
      'GET /api/timeline/new?tab=all&sinceId=10': () => json(200, { count: 0, hasMore: false, items: [] }),
    })

    const { result } = renderHook(() => useNewPostsPolling('all', 10, NONE, true))
    await tick()

    expect(result.current.count).toBe(0)
    expect(result.current.items).toEqual([])
  })

  it('一時的な通信失敗は黙って次回に回す', async () => {
    let calls = 0
    stubFetch({
      'GET /api/timeline/new?tab=all&sinceId=10': () =>
        ++calls === 1
          ? apiError(500, 'INTERNAL_ERROR', 'エラー')
          : json(200, { count: 1, hasMore: false, items: [post(11)] }),
    })

    const { result } = renderHook(() => useNewPostsPolling('all', 10, NONE, true))
    await tick()
    expect(result.current.count).toBe(0)
    await tick()

    expect(result.current.count).toBe(1)
  })
})

describe('自分の投稿(すでに一覧にある)', () => {
  it('known に含まれる投稿は新着から除く', async () => {
    stubFetch({
      'GET /api/timeline/new?tab=all&sinceId=10': () => json(200, { count: 2, hasMore: false, items: [post(12), post(11)] }),
    })

    const { result } = renderHook(() => useNewPostsPolling('all', 10, new Set([12]), true))
    await tick()

    expect(result.current.items.map((p) => p.id)).toEqual([11])
    expect(result.current.count).toBe(1)
  })

  it('除いた結果が空なら、hasMore も false にする', async () => {
    stubFetch({
      'GET /api/timeline/new?tab=all&sinceId=10': () => json(200, { count: 1, hasMore: true, items: [post(12)] }),
    })

    const { result } = renderHook(() => useNewPostsPolling('all', 10, new Set([12]), true))
    await tick()

    expect(result.current.count).toBe(0)
    expect(result.current.hasMore).toBe(false)
  })
})

describe('確認しない条件', () => {
  it('enabled が false の間は確認しない', async () => {
    const server = stubFetch({})

    renderHook(() => useNewPostsPolling('all', 10, NONE, false))
    await tick(POLL_INTERVAL_MS * 3)

    expect(server.calls).toHaveLength(0)
  })

  it('画面が隠れている間は確認しない', async () => {
    const server = stubFetch({})
    setHidden(true)

    renderHook(() => useNewPostsPolling('all', 10, NONE, true))
    await tick(POLL_INTERVAL_MS * 2)

    expect(server.calls).toHaveLength(0)
  })

  it('画面が見える状態に戻ったら、間隔を待たずにすぐ確認する', async () => {
    const server = stubFetch({
      'GET /api/timeline/new?tab=all&sinceId=10': () => json(200, { count: 0, hasMore: false, items: [] }),
    })
    setHidden(true)
    renderHook(() => useNewPostsPolling('all', 10, NONE, true))

    setHidden(false)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(server.calls).toHaveLength(1)
  })

  it('画面が隠れたときの visibilitychange では確認しない', async () => {
    const server = stubFetch({})
    renderHook(() => useNewPostsPolling('all', 10, NONE, true))

    setHidden(true)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(server.calls).toHaveLength(0)
  })

  it('アンマウント後は確認しない', async () => {
    const server = stubFetch({})
    const { unmount } = renderHook(() => useNewPostsPolling('all', 10, NONE, true))

    unmount()
    await tick(POLL_INTERVAL_MS * 2)

    expect(server.calls).toHaveLength(0)
  })
})

describe('clear と タブの切り替え', () => {
  it('clear で見つけた新着を捨てる', async () => {
    stubFetch({
      'GET /api/timeline/new?tab=all&sinceId=10': () => json(200, { count: 1, hasMore: false, items: [post(11)] }),
    })
    const { result } = renderHook(() => useNewPostsPolling('all', 10, NONE, true))
    await tick()
    expect(result.current.count).toBe(1)

    act(() => result.current.clear())

    expect(result.current.count).toBe(0)
  })

  it('タブを切り替えたら、前のタブで見つけた新着は返さない', async () => {
    stubFetch({
      'GET /api/timeline/new?tab=all&sinceId=10': () => json(200, { count: 1, hasMore: false, items: [post(11)] }),
      'GET /api/timeline/new?tab=following&sinceId=10': () => json(200, { count: 0, hasMore: false, items: [] }),
    })
    const { result, rerender } = renderHook(({ tab }) => useNewPostsPolling(tab, 10, NONE, true), {
      initialProps: { tab: 'all' as 'all' | 'following' },
    })
    await tick()
    expect(result.current.count).toBe(1)

    rerender({ tab: 'following' })

    expect(result.current.count).toBe(0)
  })
})
