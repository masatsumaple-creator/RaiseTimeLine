import { tokenStore } from '../auth/tokenStore'
import { request } from './client'
import type { AuthResponse, SignupInput, User } from './types'

export async function signup(input: SignupInput): Promise<AuthResponse> {
  const session = await request<AuthResponse>('/api/auth/signup', { method: 'POST', body: input })
  tokenStore.set(session.accessToken)
  return session
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const session = await request<AuthResponse>('/api/auth/login', { method: 'POST', body: { email, password } })
  tokenStore.set(session.accessToken)
  return session
}

/** サーバー側のリフレッシュトークンを失効させる。失敗しても、手元のトークンは必ず捨てる。 */
export async function logout(): Promise<void> {
  try {
    await request<void>('/api/auth/logout', { method: 'POST' })
  } finally {
    tokenStore.clear()
  }
}

export function fetchMe(): Promise<User> {
  return request<User>('/api/auth/me', { auth: true })
}
