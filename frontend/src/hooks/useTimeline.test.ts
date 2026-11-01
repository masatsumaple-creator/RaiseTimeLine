import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Post, TimelinePage } from '../api/types'
import { useTimeline } from './useTimeline'

function post(id: number, body = `p${id}`): Post {
  return {
    id,
    body,
    createdAt: '2026-01-01T00:00:00Z',
    editedAt: null,
    author: { id: 1, handle: 'alice', displayName: 'Alice' },
    likeCount: 0,
    likedByMe: false,
    commentCount: 0,
    images: [],
  }
}

const page = (items: Post[], nextCursor: string | null = null): TimelinePage => ({ items, nextCursor })
const ids = (items: Post[]) => items.map((p) => p.id)

async function ready(first: TimelinePage, fetchPage = vi.fn().mockResolvedValue(first)) {
  const hook = renderHook(() => useTimeline('k', fetchPage))
  await waitFor(() => expect(hook.result.current.status).toBe('ready'))
  return { ...hook, fetchPage }
}

describe('先頭ページの取得', () => {
  it('取得中は loading で、取得できたら ready になり、先頭の投稿 id を新着確認の基準にする', async () => {
    const { result } = await ready(page([post(30), post(20)], 'c1'))

    expect(ids(result.current.items)).toEqual([30, 20])
    expect(result.current.baseId).toBe(30)
    expect(result.current.hasNext).toBe(true)
  })

  it('投稿が 0 件なら、基準は 0', async () => {
    const { result } = await ready(page([]))

    expect(result.current.baseId).toBe(0)
    expect(result.current.hasNext).toBe(false)
  })

  it('失敗したら error になり、retry でやり直せる', async () => {
    const fetchPage = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page([post(1)]))
    const { result } = renderHook(() => useTimeline('k', fetchPage))
    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.retry())

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(ids(result.current.items)).toEqual([1])
  })

  it('retry も失敗したら、また error に戻る', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useTimeline('k', fetchPage))
    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.retry())

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})

describe('refresh', () => {
  it('一覧を残したまま先頭ページを取り直し、成功を返す', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(page([post(1)])).mockResolvedValueOnce(page([post(5), post(1)]))
    const { result } = await ready(page([]), fetchPage)

    let ok = false
    await act(async () => {
      ok = await result.current.refresh()
    })

    expect(ok).toBe(true)
    expect(ids(result.current.items)).toEqual([5, 1])
    expect(result.current.baseId).toBe(5)
  })

  it('失敗したら false を返し、今の一覧はそのまま', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(page([post(1)])).mockRejectedValueOnce(new Error('offline'))
    const { result } = await ready(page([]), fetchPage)

    let ok = true
    await act(async () => {
      ok = await result.current.refresh()
    })

    expect(ok).toBe(false)
    expect(ids(result.current.items)).toEqual([1])
    expect(result.current.status).toBe('ready')
  })
})

describe('続きの取得 (loadMore)', () => {
  it('カーソルを渡して取得し、末尾に足す。重複する投稿は足さない', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([post(30), post(20)], 'c1'))
      .mockResolvedValueOnce(page([post(20), post(10)], null))
    const { result } = await ready(page([]), fetchPage)

    act(() => result.current.loadMore())
    await waitFor(() => expect(ids(result.current.items)).toEqual([30, 20, 10]))

    expect(fetchPage).toHaveBeenLastCalledWith('c1')
    expect(result.current.hasNext).toBe(false)
  })

  it('続きが無ければ何もしない', async () => {
    const { result, fetchPage } = await ready(page([post(1)]))

    act(() => result.current.loadMore())

    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('失敗したら more が error になり、一覧は残る', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(page([post(2)], 'c1')).mockRejectedValueOnce(new Error('offline'))
    const { result } = await ready(page([]), fetchPage)

    act(() => result.current.loadMore())

    await waitFor(() => expect(result.current.more).toBe('error'))
    expect(ids(result.current.items)).toEqual([2])
    expect(result.current.hasNext).toBe(true)
  })
})

describe('投稿の追加・差し替え・削除', () => {
  it('prepend は新着を先頭側に足し、新着確認の基準を進める。並びは id の新しい順', async () => {
    const { result } = await ready(page([post(10)]))

    act(() => result.current.prepend([post(12), post(11)]))

    expect(ids(result.current.items)).toEqual([12, 11, 10])
    expect(result.current.baseId).toBe(12)
  })

  it('prepend は、すでに一覧にある投稿を重ねて足さない', async () => {
    const { result } = await ready(page([post(10), post(9)]))

    act(() => result.current.prepend([post(11), post(10)]))

    expect(ids(result.current.items)).toEqual([11, 10, 9])
  })

  it('prependOwn は自分の投稿を先頭に足すが、新着確認の基準は進めない', async () => {
    const { result } = await ready(page([post(10)]))

    act(() => result.current.prependOwn(post(15)))

    expect(ids(result.current.items)).toEqual([15, 10])
    expect(result.current.baseId).toBe(10)
  })

  it('replace は id が一致する投稿だけを差し替える', async () => {
    const { result } = await ready(page([post(2), post(1)]))

    act(() => result.current.replace(post(1, '編集後')))

    expect(result.current.items.map((p) => p.body)).toEqual(['p2', '編集後'])
  })

  it('remove は id が一致する投稿だけを取り除く', async () => {
    const { result } = await ready(page([post(2), post(1)]))

    act(() => result.current.remove(2))

    expect(ids(result.current.items)).toEqual([1])
  })
})

describe('key の変化', () => {
  it('key が変わったら前の一覧を引き継がず、取り直す', async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce(page([post(1)])).mockResolvedValueOnce(page([post(2)]))
    const { result, rerender } = renderHook(({ k }) => useTimeline(k, fetchPage), { initialProps: { k: 'following' } })
    await waitFor(() => expect(ids(result.current.items)).toEqual([1]))

    rerender({ k: 'all' })

    expect(result.current.status).toBe('loading')
    expect(result.current.items).toEqual([])
    await waitFor(() => expect(ids(result.current.items)).toEqual([2]))
  })
})
