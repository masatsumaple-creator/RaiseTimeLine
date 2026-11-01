import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { apiError, json, noContent, SESSION, stubFetch } from '../test/fakeServer'
import { fetchMe, login, logout, signup } from './auth'
import { ApiError, NetworkError } from './client'

beforeEach(() => {
  tokenStore.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const SIGNUP_INPUT = { email: 'a@example.com', password: 'password1', handle: 'alice', displayName: 'Alice' }

describe('signup', () => {
  it('入力を POST して、返ったアクセストークンを保存する', async () => {
    const server = stubFetch({ 'POST /api/auth/signup': () => json(201, SESSION) })

    const session = await signup(SIGNUP_INPUT)

    expect(server.calls[0].body).toEqual(SIGNUP_INPUT)
    expect(session).toEqual(SESSION)
    expect(tokenStore.get()).toBe('access-1')
  })

  it('登録済み(409)なら ApiError を投げ、トークンは保存しない', async () => {
    stubFetch({ 'POST /api/auth/signup': () => apiError(409, 'EMAIL_ALREADY_EXISTS', '登録済み') })

    const error = await signup(SIGNUP_INPUT).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'EMAIL_ALREADY_EXISTS' })
    expect(tokenStore.get()).toBeNull()
  })

  it('認証ヘッダーは付けない(まだトークンが無いため)', async () => {
    tokenStore.set('stale')
    const server = stubFetch({ 'POST /api/auth/signup': () => json(201, SESSION) })

    await signup(SIGNUP_INPUT)

    expect(server.calls[0].headers.Authorization).toBeUndefined()
  })
})

describe('login', () => {
  it('メールとパスワードを POST して、アクセストークンを保存する', async () => {
    const server = stubFetch({ 'POST /api/auth/login': () => json(200, SESSION) })

    const session = await login('a@example.com', 'password1')

    expect(server.calls[0].body).toEqual({ email: 'a@example.com', password: 'password1' })
    expect(session.user.handle).toBe('tamura')
    expect(tokenStore.get()).toBe('access-1')
  })

  it('認証に失敗(401)したら ApiError を投げ、トークンは保存しない', async () => {
    stubFetch({ 'POST /api/auth/login': () => apiError(401, 'LOGIN_FAILED', '違います') })

    await expect(login('a@example.com', 'wrong')).rejects.toMatchObject({ status: 401, code: 'LOGIN_FAILED' })
    expect(tokenStore.get()).toBeNull()
  })

  it('通信できなければ NetworkError を投げる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))

    await expect(login('a@example.com', 'password1')).rejects.toBeInstanceOf(NetworkError)
  })
})

describe('logout', () => {
  it('サーバーに通知して、手元のトークンを捨てる', async () => {
    tokenStore.set('access-1')
    const server = stubFetch({ 'POST /api/auth/logout': () => noContent() })

    await logout()

    expect(server.count('POST /api/auth/logout')).toBe(1)
    expect(tokenStore.get()).toBeNull()
  })

  it('サーバーへの通知に失敗しても、手元のトークンは必ず捨てる', async () => {
    tokenStore.set('access-1')
    stubFetch({ 'POST /api/auth/logout': () => apiError(500, 'INTERNAL_ERROR', 'エラー') })

    await expect(logout()).rejects.toMatchObject({ status: 500 })
    expect(tokenStore.get()).toBeNull()
  })
})

describe('fetchMe', () => {
  it('アクセストークンを付けて自分の情報を取得する', async () => {
    tokenStore.set('access-1')
    const server = stubFetch({ 'GET /api/auth/me': () => json(200, SESSION.user) })

    const me = await fetchMe()

    expect(me).toEqual(SESSION.user)
    expect(server.calls[0].headers.Authorization).toBe('Bearer access-1')
  })
})
