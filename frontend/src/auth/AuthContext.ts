import { createContext, useContext } from 'react'
import type { SignupInput, User } from '../api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  status: AuthStatus
  user: User | null
  login: (email: string, password: string) => Promise<void>
  signup: (input: SignupInput) => Promise<void>
  logout: () => Promise<void>
  /** プロフィールを更新したあとに、画面が持っているログイン中のユーザーの情報(ヘッダーの表示名など)を差し替える */
  updateUser: (user: User) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth は AuthProvider の中で使ってください')
  return value
}
