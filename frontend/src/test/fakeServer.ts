import { vi } from 'vitest'
import type { AuthResponse } from '../api/types'

export interface FakeRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
}

export type Handler = (request: FakeRequest) => Response | Promise<Response>

export const SESSION: AuthResponse = {
  accessToken: 'access-1',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: { id: 1, handle: 'tamura', displayName: '田村' },
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}

export function apiError(status: number, code: string, message: string, fieldErrors?: Record<string, string>): Response {
  return json(status, { code, message, fieldErrors })
}

/**
 * fetch を差し替えて、"METHOD /path" ごとのハンドラで応答する。
 * 登録のないリクエストはテストの失敗として扱う。受け取ったリクエストは calls に溜まる。
 */
export function stubFetch(handlers: Record<string, Handler>) {
  const calls: FakeRequest[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: FakeRequest = {
      method: init?.method ?? 'GET',
      path: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(request)
    const handler = handlers[`${request.method} ${request.path}`]
    if (!handler) throw new Error(`想定していないリクエスト: ${request.method} ${request.path}`)
    return handler(request)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock, count: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key).length }
}
