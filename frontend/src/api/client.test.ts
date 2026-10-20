import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { apiError, json, noContent, SESSION, stubFetch } from '../test/fakeServer'
import { ApiError, NetworkError, refreshSession, request, setSessionExpiredHandler } from './client'

beforeEach(() => {
  tokenStore.clear()
  setSessionExpiredHandler(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request', () => {
  it('auth: true のときだけ Bearer ヘッダーを付ける', async () => {
    tokenStore.set('access-1')
    const server = stubFetch({ 'GET /api/x': () => json(200, { ok: true }) })

    await request('/api/x')
    await request('/api/x', { auth: true })

    expect(server.calls[0].headers.Authorization).toBeUndefined()
    expect(server.calls[1].headers.Authorization).toBe('Bearer access-1')
  })

  it('エラー応答を ApiError(status / code / message / fieldErrors)にする', async () => {
    stubFetch({
      'POST /api/x': () => apiError(400, 'VALIDATION_ERROR', '入力が正しくありません', { email: 'メールNG' }),
    })

    const error = await request('/api/x', { method: 'POST', body: {} }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: '入力が正しくありません',
      fieldErrors: { email: 'メールNG' },
    })
  })

  it('204 は undefined を返す', async () => {
    stubFetch({ 'POST /api/x': () => noContent() })

    await expect(request('/api/x', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('通信できなければ NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(request('/api/x')).rejects.toBeInstanceOf(NetworkError)
  })

  it('401 のときはリフレッシュして、新しいトークンで 1 回だけ再試行する', async () => {
    tokenStore.set('expired')
    const server = stubFetch({
      'GET /api/x': (req) =>
        req.headers.Authorization === 'Bearer access-2' ? json(200, { ok: true }) : apiError(401, 'UNAUTHORIZED', 'x'),
      'POST /api/auth/refresh': () => json(200, { ...SESSION, accessToken: 'access-2' }),
    })

    await expect(request('/api/x', { auth: true })).resolves.toEqual({ ok: true })

    expect(server.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/x',
      'POST /api/auth/refresh',
      'GET /api/x',
    ])
    expect(tokenStore.get()).toBe('access-2')
  })

  it('リフレッシュにも失敗したらトークンを捨て、セッション切れを通知して 401 を投げる', async () => {
    tokenStore.set('expired')
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    stubFetch({
      'GET /api/x': () => apiError(401, 'UNAUTHORIZED', 'ログインが必要です'),
      'POST /api/auth/refresh': () => apiError(401, 'INVALID_REFRESH_TOKEN', '期限切れ'),
    })

    await expect(request('/api/x', { auth: true })).rejects.toMatchObject({ status: 401 })

    expect(tokenStore.get()).toBeNull()
    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('auth を付けないリクエスト(ログイン等)の 401 ではリフレッシュしない', async () => {
    const server = stubFetch({ 'POST /api/auth/login': () => apiError(401, 'LOGIN_FAILED', 'NG') })

    await expect(request('/api/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'LOGIN_FAILED' })

    expect(server.calls).toHaveLength(1)
  })

  it('同時に複数の 401 が起きても、リフレッシュの通信は 1 回にまとめる', async () => {
    tokenStore.set('expired')
    const server = stubFetch({
      'GET /api/a': (req) => (req.headers.Authorization === 'Bearer access-2' ? json(200, 'a') : apiError(401, 'U', 'x')),
      'GET /api/b': (req) => (req.headers.Authorization === 'Bearer access-2' ? json(200, 'b') : apiError(401, 'U', 'x')),
      'POST /api/auth/refresh': async () => json(200, { ...SESSION, accessToken: 'access-2' }),
    })

    const results = await Promise.all([request('/api/a', { auth: true }), request('/api/b', { auth: true })])

    expect(results).toEqual(['a', 'b'])
    expect(server.count('POST /api/auth/refresh')).toBe(1)
  })
})

describe('refreshSession', () => {
  it('成功したらアクセストークンを保持し、セッションを返す', async () => {
    stubFetch({ 'POST /api/auth/refresh': () => json(200, SESSION) })

    await expect(refreshSession()).resolves.toEqual(SESSION)

    expect(tokenStore.get()).toBe('access-1')
  })

  it('401 なら null(ログインし直しが必要)で、トークンを捨てる', async () => {
    tokenStore.set('old')
    stubFetch({ 'POST /api/auth/refresh': () => apiError(401, 'INVALID_REFRESH_TOKEN', '期限切れ') })

    await expect(refreshSession()).resolves.toBeNull()

    expect(tokenStore.get()).toBeNull()
  })

  it('通信失敗はログアウト扱いにせず NetworkError を投げる', async () => {
    tokenStore.set('keep')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(refreshSession()).rejects.toBeInstanceOf(NetworkError)

    expect(tokenStore.get()).toBe('keep')
  })
})
