import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Comment } from '../api/types'
import { tokenStore } from '../auth/tokenStore'
import { apiError, json, stubFetch } from '../test/fakeServer'
import { useComments } from './useComments'

function comment(id: number, mine = false): Comment {
  return {
    id,
    postId: 3,
    body: `c${id}`,
    createdAt: '2026-01-01T00:00:00Z',
    author: { id: 1, handle: 'alice', displayName: 'Alice' },
    mine,
  }
}

beforeEach(() => {
  tokenStore.set('access-1')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

async function ready(items: Comment[], nextCursor: string | null = null) {
  stubFetch({ 'GET /api/posts/3/comments': () => json(200, { items, nextCursor }) })
  const hook = renderHook(() => useComments(3))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return hook
}

describe('取得', () => {
  it('投稿のコメントを古い順のまま取得する', async () => {
    const { result } = await ready([comment(1), comment(2)])

    expect(result.current.items.map((c) => c.id)).toEqual([1, 2])
    expect(result.current.hasNext).toBe(false)
  })

  it('続きがあれば cursor を付けて取得して足す', async () => {
    stubFetch({
      'GET /api/posts/3/comments': () => json(200, { items: [comment(1)], nextCursor: 'c1' }),
      'GET /api/posts/3/comments?cursor=c1': () => json(200, { items: [comment(2)], nextCursor: null }),
    })
    const { result } = renderHook(() => useComments(3))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    expect(result.current.hasNext).toBe(false)
  })

  it('投稿が無い(404)ときも、コメント一覧としては error 扱い', async () => {
    stubFetch({ 'GET /api/posts/3/comments': () => apiError(404, 'NOT_FOUND', 'なし') })

    const { result } = renderHook(() => useComments(3))

    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})

describe('append(自分のコメントを足す)', () => {
  it('続きが無ければ末尾に足す', async () => {
    const { result } = await ready([comment(1)])

    act(() => result.current.append(comment(2, true)))

    expect(result.current.items.map((c) => c.id)).toEqual([1, 2])
  })

  it('続きが未取得のときは足さない(続きを読んだときに並び順どおり入るため)', async () => {
    const { result } = await ready([comment(1)], 'c1')

    act(() => result.current.append(comment(2, true)))

    expect(result.current.items.map((c) => c.id)).toEqual([1])
  })

  it('すでにあるコメントは重ねて足さない', async () => {
    const { result } = await ready([comment(1)])

    act(() => result.current.append(comment(1)))

    expect(result.current.items).toHaveLength(1)
  })
})

describe('remove', () => {
  it('id が一致するコメントだけを取り除く', async () => {
    const { result } = await ready([comment(1), comment(2), comment(3)])

    act(() => result.current.remove(2))

    expect(result.current.items.map((c) => c.id)).toEqual([1, 3])
  })

  it('存在しない id では何も変わらない', async () => {
    const { result } = await ready([comment(1)])

    act(() => result.current.remove(99))

    expect(result.current.items).toHaveLength(1)
  })
})

describe('投稿の切り替え', () => {
  it('postId が変わったら、前の投稿のコメントを引き継がず取り直す', async () => {
    stubFetch({
      'GET /api/posts/3/comments': () => json(200, { items: [comment(1)], nextCursor: null }),
      'GET /api/posts/4/comments': () => json(200, { items: [{ ...comment(7), postId: 4 }], nextCursor: null }),
    })
    const { result, rerender } = renderHook(({ id }) => useComments(id), { initialProps: { id: 3 } })
    await waitFor(() => expect(result.current.items.map((c) => c.id)).toEqual([1]))

    rerender({ id: 4 })

    expect(result.current.items).toEqual([])
    await waitFor(() => expect(result.current.items.map((c) => c.id)).toEqual([7]))
  })
})
