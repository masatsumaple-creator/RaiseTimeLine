import { Navigate, Outlet, useLocation, type Location } from 'react-router'
import { useAuth } from './AuthContext'

interface FromState {
  from?: Location
}

/** ログインが必要な画面。未ログインなら /login へ送り、ログイン後に元の画面へ戻れるよう場所を覚えておく。 */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return null
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location } satisfies FromState} />
  return <Outlet />
}

/** ログイン・登録画面。ログイン済みなら、元の画面(なければ S-03)へ移動する。 */
export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return null
  if (status === 'authenticated') {
    const from = (location.state as FromState | null)?.from
    return <Navigate to={from ?? '/'} replace />
  }
  return <Outlet />
}
