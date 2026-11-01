import { act, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { ToastProvider } from '../components/ToastProvider'
import { apiError, json, stubFetch } from '../test/fakeServer'
import { useFollowToggle } from './useFollowToggle'

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

beforeEach(() => {
  tokenStore.set('access-1')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('一覧の行(フォロワー数を持たない)', () => {
  it('押した直後に画面を更新し、サーバーの結果で確定する', async () => {
    const server = stubFetch({ 'PUT /api/users/bob/follow': () => json(200, { followedByMe: true, followerCount: 5 }) })
    const apply = vi.fn()
    const { result } = renderHook(() => useFollowToggle('bob', apply), { wrapper })

    await act(() => result.current({ followedByMe: false }))

    expect(server.count('PUT /api/users/bob/follow')).toBe(1)
    expect(apply).toHaveBeenNthCalledWith(1, { followedByMe: true })
    expect(apply).toHaveBeenNthCalledWith(2, { followedByMe: true })
    expect(apply).toHaveBeenCalledTimes(2)
  })

  it('フォロー済みなら解除(DELETE)する', async () => {
    const server = stubFetch({
      'DELETE /api/users/bob/follow': () => json(200, { followedByMe: false, followerCount: 4 }),
    })
    const apply = vi.fn()
    const { result } = renderHook(() => useFollowToggle('bob', apply), { wrapper })

    await act(() => result.current({ followedByMe: true }))

    expect(server.count('DELETE /api/users/bob/follow')).toBe(1)
    expect(apply).toHaveBeenLastCalledWith({ followedByMe: false })
  })

  it('失敗したら元に戻し、メッセージを出す', async () => {
    stubFetch({ 'PUT /api/users/bob/follow': () => apiError(500, 'INTERNAL_ERROR', 'エラー') })
    const apply = vi.fn()
    const { result } = renderHook(() => useFollowToggle('bob', apply), { wrapper })

    await act(() => result.current({ followedByMe: false }))

    expect(apply).toHaveBeenNthCalledWith(1, { followedByMe: true })
    expect(apply).toHaveBeenLastCalledWith({ followedByMe: false })
    expect(await screen.findByText('フォローの操作に失敗しました')).toBeInTheDocument()
  })

  it('相手が見つからない(404)なら、そのメッセージを出す', async () => {
    stubFetch({ 'PUT /api/users/bob/follow': () => apiError(404, 'NOT_FOUND', 'なし') })
    const { result } = renderHook(() => useFollowToggle('bob', vi.fn()), { wrapper })

    await act(() => result.current({ followedByMe: false }))

    expect(await screen.findByText('ユーザーが見つかりません')).toBeInTheDocument()
  })
})

describe('プロフィール(フォロワー数を持つ)', () => {
  it('押した直後にフォロワー数を 1 増やし、サーバーの結果(フォロワー数)で確定する', async () => {
    stubFetch({ 'PUT /api/users/bob/follow': () => json(200, { followedByMe: true, followerCount: 10 }) })
    const apply = vi.fn()
    const { result } = renderHook(() => useFollowToggle('bob', apply), { wrapper })

    await act(() => result.current({ followedByMe: false, followerCount: 3 }))

    expect(apply).toHaveBeenNthCalledWith(1, { followedByMe: true, followerCount: 4 })
    expect(apply).toHaveBeenLastCalledWith({ followedByMe: true, followerCount: 10 })
  })

  it('解除では押した直後にフォロワー数を 1 減らすが、0 未満にはしない', async () => {
    stubFetch({ 'DELETE /api/users/bob/follow': () => json(200, { followedByMe: false, followerCount: 0 }) })
    const apply = vi.fn()
    const { result } = renderHook(() => useFollowToggle('bob', apply), { wrapper })

    await act(() => result.current({ followedByMe: true, followerCount: 0 }))

    expect(apply).toHaveBeenNthCalledWith(1, { followedByMe: false, followerCount: 0 })
  })

  it('失敗したら、フォロー状態とフォロワー数の両方を元に戻す', async () => {
    stubFetch({ 'PUT /api/users/bob/follow': () => apiError(500, 'INTERNAL_ERROR', 'エラー') })
    const apply = vi.fn()
    const { result } = renderHook(() => useFollowToggle('bob', apply), { wrapper })

    await act(() => result.current({ followedByMe: false, followerCount: 3 }))

    expect(apply).toHaveBeenLastCalledWith({ followedByMe: false, followerCount: 3 })
  })
})

describe('連打', () => {
  it('最後に押した操作の結果だけを反映し、先の操作の結果や失敗では上書きしない', async () => {
    let resolveFirst!: (response: Response) => void
    stubFetch({
      'PUT /api/users/bob/follow': () => new Promise<Response>((resolve) => (resolveFirst = resolve)),
      'DELETE /api/users/bob/follow': () => json(200, { followedByMe: false, followerCount: 3 }),
    })
    const apply = vi.fn()
    const { result } = renderHook(() => useFollowToggle('bob', apply), { wrapper })

    let first!: Promise<void>
    act(() => {
      first = result.current({ followedByMe: false, followerCount: 3 })
    })
    await act(() => result.current({ followedByMe: true, followerCount: 4 }))
    apply.mockClear()
    await act(async () => {
      resolveFirst(json(200, { followedByMe: true, followerCount: 4 }))
      await first
    })

    // 先に押した「フォロー」の結果が遅れて届いても、あとから押した「解除」の状態を上書きしない
    expect(apply).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText('フォローの操作に失敗しました')).not.toBeInTheDocument())
  })
})
