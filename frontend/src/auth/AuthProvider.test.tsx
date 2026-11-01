import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request, setSessionExpiredHandler } from '../api/client'
import { apiError, json, noContent, SESSION, stubFetch } from '../test/fakeServer'
import { useAuth } from './AuthContext'
import { AuthProvider } from './AuthProvider'
import { tokenStore } from './tokenStore'

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper })
}

beforeEach(() => {
  tokenStore.clear()
  setSessionExpiredHandler(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('起動時の状態の復元', () => {
  it('復元できるまでは loading で、ユーザーはいない', async () => {
    let finish!: (response: Response) => void
    stubFetch({ 'POST /api/auth/refresh': () => new Promise<Response>((resolve) => (finish = resolve)) })

    const { result } = renderAuth()

    expect(result.current.status).toBe('loading')
    expect(result.current.user).toBeNull()

    // 通信中の Promise を残したままにしない(リフレッシュは通信中の 1 本を共有するため、次のテストに影響する)
    await act(async () => finish(apiError(401, 'INVALID_REFRESH_TOKEN', '期限切れ')))
    await waitFor(() => expect(result.current.status).toBe('anonymous'))
  })

  it('リフレッシュに成功したら authenticated になり、ユーザーを持つ', async () => {
    stubFetch({ 'POST /api/auth/refresh': () => json(200, SESSION) })

    const { result } = renderAuth()

    await waitFor(() => expect(result.current.status).toBe('authenticated'))
    expect(result.current.user).toEqual(SESSION.user)
    expect(tokenStore.get()).toBe('access-1')
  })

  it('リフレッシュトークンが無効(401)なら anonymous になる', async () => {
    stubFetch({ 'POST /api/auth/refresh': () => apiError(401, 'INVALID_REFRESH_TOKEN', '期限切れ') })

    const { result } = renderAuth()

    await waitFor(() => expect(result.current.status).toBe('anonymous'))
    expect(result.current.user).toBeNull()
  })

  it('通信に失敗しても anonymous になる(読み込み中のまま止まらない)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    const { result } = renderAuth()

    await waitFor(() => expect(result.current.status).toBe('anonymous'))
  })
})

describe('login / signup', () => {
  async function anonymous() {
    const server = stubFetch({
      'POST /api/auth/refresh': () => apiError(401, 'INVALID_REFRESH_TOKEN', '期限切れ'),
      'POST /api/auth/login': () => json(200, SESSION),
      'POST /api/auth/signup': () => json(201, SESSION),
    })
    const hook = renderAuth()
    await waitFor(() => expect(hook.result.current.status).toBe('anonymous'))
    return { ...hook, server }
  }

  it('login に成功したら authenticated になり、トークンを保存する', async () => {
    const { result, server } = await anonymous()

    await act(() => result.current.login('a@example.com', 'password1'))

    expect(result.current.status).toBe('authenticated')
    expect(result.current.user).toEqual(SESSION.user)
    expect(tokenStore.get()).toBe('access-1')
    expect(server.calls.at(-1)?.body).toEqual({ email: 'a@example.com', password: 'password1' })
  })

  it('login に失敗したらエラーを呼び出し元へ伝え、anonymous のまま', async () => {
    const { result, server } = await anonymous()
    stubFetch({
      'POST /api/auth/refresh': () => apiError(401, 'INVALID_REFRESH_TOKEN', '期限切れ'),
      'POST /api/auth/login': () => apiError(401, 'LOGIN_FAILED', '違います'),
    })
    expect(server.count('POST /api/auth/login')).toBe(0)

    await expect(act(() => result.current.login('a@example.com', 'wrong'))).rejects.toMatchObject({
      code: 'LOGIN_FAILED',
    })

    expect(result.current.status).toBe('anonymous')
    expect(result.current.user).toBeNull()
  })

  it('signup に成功したら、そのまま authenticated になる', async () => {
    const { result, server } = await anonymous()
    const input = { email: 'a@example.com', password: 'password1', handle: 'alice', displayName: 'Alice' }

    await act(() => result.current.signup(input))

    expect(result.current.status).toBe('authenticated')
    expect(server.calls.at(-1)?.body).toEqual(input)
  })
})

describe('logout', () => {
  async function authenticated(handlers: Parameters<typeof stubFetch>[0] = {}) {
    stubFetch({ 'POST /api/auth/refresh': () => json(200, SESSION), ...handlers })
    const hook = renderAuth()
    await waitFor(() => expect(hook.result.current.status).toBe('authenticated'))
    return hook
  }

  it('サーバーへ通知し、トークンを捨てて anonymous になる', async () => {
    const { result } = await authenticated({ 'POST /api/auth/logout': () => noContent() })

    await act(() => result.current.logout())

    expect(result.current.status).toBe('anonymous')
    expect(result.current.user).toBeNull()
    expect(tokenStore.get()).toBeNull()
  })

  it('サーバーへの通知に失敗しても、この端末ではログアウトする(エラーは投げない)', async () => {
    const { result } = await authenticated({ 'POST /api/auth/logout': () => apiError(500, 'INTERNAL_ERROR', 'エラー') })

    await act(() => result.current.logout())

    expect(result.current.status).toBe('anonymous')
    expect(tokenStore.get()).toBeNull()
  })
})

describe('updateUser', () => {
  it('画面が持つログイン中のユーザーを差し替える', async () => {
    stubFetch({ 'POST /api/auth/refresh': () => json(200, SESSION) })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('authenticated'))

    act(() => result.current.updateUser({ ...SESSION.user, displayName: '新しい名前' }))

    expect(result.current.user?.displayName).toBe('新しい名前')
    expect(result.current.status).toBe('authenticated')
  })
})

describe('セッション切れ', () => {
  it('API 呼び出しで 401 になり、リフレッシュにも失敗したら anonymous に戻す', async () => {
    let refreshCalls = 0
    stubFetch({
      'POST /api/auth/refresh': () => (++refreshCalls === 1 ? json(200, SESSION) : apiError(401, 'X', '期限切れ')),
      'GET /api/x': () => apiError(401, 'UNAUTHORIZED', 'ログインが必要です'),
    })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('authenticated'))

    await act(() => request('/api/x', { auth: true }).catch(() => undefined))

    expect(result.current.status).toBe('anonymous')
    expect(result.current.user).toBeNull()
  })
})

describe('useAuth', () => {
  it('AuthProvider の外で使うとエラーにする', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useAuth())).toThrow('AuthProvider')

    spy.mockRestore()
  })
})
