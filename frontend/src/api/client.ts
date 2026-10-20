import { tokenStore } from '../auth/tokenStore'
import type { ApiErrorBody, AuthResponse } from './types'

/** サーバーが {code, message} 形式で返したエラー。 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors?: Record<string, string>

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? 'エラーが発生しました')
    this.name = 'ApiError'
    this.status = status
    this.code = body.code ?? 'UNKNOWN'
    this.fieldErrors = body.fieldErrors
  }
}

/** サーバーに届かなかった(オフライン等)。 */
export class NetworkError extends Error {
  constructor() {
    super('network error')
    this.name = 'NetworkError'
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  /** true: アクセストークンを付け、401 ならリフレッシュして 1 回だけ再試行する */
  auth?: boolean
}

let onSessionExpired: (() => void) | null = null

/** リフレッシュにも失敗した(ログインし直しが必要な)ときに呼ばれる関数を登録する。 */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler
}

async function send(path: string, { method = 'GET', body }: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    return await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new NetworkError()
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const json: unknown = text ? safeParse(text) : undefined
  if (!res.ok) throw new ApiError(res.status, (json ?? {}) as Partial<ApiErrorBody>)
  return json as T
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

let refreshing: Promise<AuthResponse | null> | null = null

/**
 * HttpOnly Cookie のリフレッシュトークンで、アクセストークンを取り直す。
 * 同時に何度呼ばれても通信は 1 回にまとめる(ローテーションで、2 本目が使用済みトークンになるのを防ぐ)。
 * ログインし直しが必要なら null。通信自体の失敗は NetworkError を投げる。
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function doRefresh(): Promise<AuthResponse | null> {
  const res = await send('/api/auth/refresh', { method: 'POST' }, null)
  if (res.status === 401) {
    tokenStore.clear()
    return null
  }
  const session = await parse<AuthResponse>(res)
  tokenStore.set(session.accessToken)
  return session
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await send(path, options, options.auth ? tokenStore.get() : null)
  if (res.status === 401 && options.auth) {
    const session = await refreshSession()
    if (session) {
      res = await send(path, options, tokenStore.get())
    } else {
      onSessionExpired?.()
    }
  }
  return parse<T>(res)
}
