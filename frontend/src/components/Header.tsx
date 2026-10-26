import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { Avatar } from './Avatar'
import { useToast } from './toast'

export function Header() {
  const { user, status, logout } = useAuth()
  const showToast = useToast()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    showToast('ログアウトしました')
    navigate('/login', { replace: true })
  }

  return (
    <header className="header">
      <div className="header-in">
        <Link className="logo" to="/">
          RaiseTimeLine
        </Link>
        <span className="spacer" />
        <nav className="nav">
          {status === 'authenticated' && user ? (
            <>
              <Link className="btn small" to="/search">
                ユーザー検索
              </Link>
              <Link className="me" to={`/users/${user.handle}`}>
                <Avatar user={user} size="sm" />
                <span className="me-name">{user.displayName}</span>
              </Link>
              <button className="btn small" type="button" onClick={handleLogout}>
                ログアウト
              </button>
            </>
          ) : status === 'anonymous' ? (
            <>
              <Link className="btn small" to="/login">
                ログイン
              </Link>
              <Link className="btn small primary" to="/signup">
                新規登録
              </Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  )
}
