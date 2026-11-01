import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { usePagedList } from './usePagedList'

interface Row {
  id: number
  name: string
}

const row = (id: number, name = `row${id}`): Row => ({ id, name })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('先頭ページの取得', () => {
  it('取得中は loading で、取得できたら ready になり行と続きの有無を持つ', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [row(1), row(2)], nextCursor: 'c1' })

    const { result } = renderHook(() => usePagedList<Row>('k', fetchPage))

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.items).toEqual([row(1), row(2)])
    expect(result.current.hasNext).toBe(true)
    expect(fetchPage).toHaveBeenCalledWith()
  })

  it('最後のページなら hasNext が false', async () => {
    const { result } = renderHook(() => usePagedList<Row>('k', () => Promise.resolve({ items: [row(1)], nextCursor: null })))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.hasNext).toBe(false)
  })

  it('失敗したら error になり、retry でやり直せる', async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [row(1)], nextCursor: null })
    const { result } = renderHook(() => usePagedList<Row>('k', fetchPage))
    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.retry())

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.items).toEqual([row(1)])
  })

  it('一覧の持ち主が存在しない(404)なら missing', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new ApiError(404, { code: 'NOT_FOUND', message: 'なし' }))

    const { result } = renderHook(() => usePagedList<Row>('k', fetchPage))

    await waitFor(() => expect(result.current.status).toBe('missing'))
  })
})

describe('続きの取得 (loadMore)', () => {
  async function ready(fetchPage: (cursor?: string | null) => Promise<{ items: Row[]; nextCursor: string | null }>) {
    const hook = renderHook(() => usePagedList<Row>('k', fetchPage))
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    return hook
  }

  it('カーソルを渡して取得し、行を末尾に足して次のカーソルに進む', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [row(1)], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [row(2)], nextCursor: null })
    const { result } = await ready(fetchPage)

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    expect(fetchPage).toHaveBeenLastCalledWith('c1')
    expect(result.current.items.map((r) => r.id)).toEqual([1, 2])
    expect(result.current.hasNext).toBe(false)
    expect(result.current.more).toBe('idle')
  })

  it('すでに一覧にある行(id 重複)は足さない', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [row(1), row(2)], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [row(2), row(3)], nextCursor: null })
    const { result } = await ready(fetchPage)

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(3))

    expect(result.current.items.map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('取得中は more が loading で、連打しても通信は 1 回', async () => {
    const next = deferred<{ items: Row[]; nextCursor: string | null }>()
    const fetchPage = vi.fn().mockResolvedValueOnce({ items: [row(1)], nextCursor: 'c1' }).mockReturnValueOnce(next.promise)
    const { result } = await ready(fetchPage)

    act(() => {
      result.current.loadMore()
      result.current.loadMore()
    })

    expect(result.current.more).toBe('loading')
    expect(fetchPage).toHaveBeenCalledTimes(2)
    await act(async () => next.resolve({ items: [row(2)], nextCursor: null }))
    expect(result.current.more).toBe('idle')
  })

  it('続きが無いときは何もしない', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [row(1)], nextCursor: null })
    const { result } = await ready(fetchPage)

    act(() => result.current.loadMore())

    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('失敗したら more が error になり、一覧はそのまま。もう一度 loadMore できる', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [row(1)], nextCursor: 'c1' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [row(2)], nextCursor: null })
    const { result } = await ready(fetchPage)

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.more).toBe('error'))
    expect(result.current.items).toEqual([row(1)])
    expect(result.current.hasNext).toBe(true)

    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.items).toHaveLength(2))
  })
})

describe('行の更新', () => {
  async function ready() {
    const hook = renderHook(() =>
      usePagedList<Row>('k', () => Promise.resolve({ items: [row(1), row(2)], nextCursor: 'c1' })),
    )
    await waitFor(() => expect(hook.result.current.status).toBe('ready'))
    return hook
  }

  it('patch は id が一致する行だけを部分的に書き換える', async () => {
    const { result } = await ready()

    act(() => result.current.patch(2, { name: '新' }))

    expect(result.current.items).toEqual([row(1), row(2, '新')])
  })

  it('setItems は今の行と、続きがあるかを受け取って並びを書き換える', async () => {
    const { result } = await ready()
    const updater = vi.fn((items: Row[], hasNext: boolean) => (hasNext ? [...items, row(9)] : items))

    act(() => result.current.setItems(updater))

    expect(updater).toHaveBeenCalledWith([row(1), row(2)], true)
    expect(result.current.items.map((r) => r.id)).toEqual([1, 2, 9])
  })
})

describe('key の変化', () => {
  it('key が変わったら前の一覧を引き継がず、最初から取得し直す', async () => {
    const fetchPage = vi.fn((cursor?: string | null) => {
      void cursor
      return Promise.resolve({ items: [row(fetchPage.mock.calls.length)], nextCursor: null })
    })
    const { result, rerender } = renderHook(({ k }) => usePagedList<Row>(k, fetchPage), { initialProps: { k: 'a' } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.items.map((r) => r.id)).toEqual([1])

    rerender({ k: 'b' })

    expect(result.current.status).toBe('loading')
    expect(result.current.items).toEqual([])
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.items.map((r) => r.id)).toEqual([2])
  })

  it('古い key の取得結果が遅れて届いても、新しい一覧には反映しない', async () => {
    const slow = deferred<{ items: Row[]; nextCursor: string | null }>()
    const fetchPage = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ items: [row(2, 'new')], nextCursor: null })
    const { result, rerender } = renderHook(({ k }) => usePagedList<Row>(k, fetchPage), { initialProps: { k: 'a' } })

    rerender({ k: 'b' })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => slow.resolve({ items: [row(1, 'old')], nextCursor: null }))

    expect(result.current.items).toEqual([row(2, 'new')])
  })
})
