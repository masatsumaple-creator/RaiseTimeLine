import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as authApi from '../api/auth'
import { refreshSession, setSessionExpiredHandler } from '../api/client'
import type { SignupInput, User } from '../api/types'
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)

  const signIn = useCallback((next: User) => {
    setUser(next)
    setStatus('authenticated')
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    setStatus('anonymous')
  }, [])

  // 起動時: リフレッシュトークン(Cookie)があればログイン状態を復元する。
  // StrictMode で 2 回走っても、refreshSession が通信を 1 回にまとめる
  useEffect(() => {
    let cancelled = false
    refreshSession()
      .then((session) => {
        if (cancelled) return
        if (session) signIn(session.user)
        else signOut()
      })
      .catch(() => {
        if (!cancelled) signOut()
      })
    return () => {
      cancelled = true
    }
  }, [signIn, signOut])

  // どの画面で API を呼んでもリフレッシュに失敗したら、ログイン画面へ戻す(ガードが /login へ誘導する)
  useEffect(() => {
    setSessionExpiredHandler(signOut)
    return () => setSessionExpiredHandler(null)
  }, [signOut])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login: async (email, password) => {
        signIn((await authApi.login(email, password)).user)
      },
      signup: async (input: SignupInput) => {
        signIn((await authApi.signup(input)).user)
      },
      logout: async () => {
        try {
          await authApi.logout()
        } catch {
          // 通信に失敗しても、この端末ではログアウトした状態にする
        }
        signOut()
      },
      updateUser: setUser,
    }),
    [status, user, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
