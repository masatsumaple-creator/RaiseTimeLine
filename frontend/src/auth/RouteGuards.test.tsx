import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation, type Location } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext'
import { GuestOnly, RequireAuth } from './RouteGuards'

function authValue(status: AuthStatus): AuthContextValue {
  return {
    status,
    user: status === 'authenticated' ? { id: 1, handle: 'alice', displayName: 'Alice' } : null,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
  }
}

function LoginPlaceholder() {
  const from = (useLocation().state as { from?: Location } | null)?.from
  return <p>ログイン画面 from={from ? `${from.pathname}${from.search}` : 'なし'}</p>
}

function renderGuards(status: AuthStatus, initialEntry: string, extra?: ReactNode) {
  return render(
    <AuthContext.Provider value={authValue(status)}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/" element={<p>ホーム</p>} />
            <Route path="/posts/:id" element={<p>投稿詳細</p>} />
          </Route>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPlaceholder />} />
          </Route>
          {extra}
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('RequireAuth', () => {
  it('ログイン済みなら中の画面を表示する', () => {
    renderGuards('authenticated', '/')

    expect(screen.getByText('ホーム')).toBeInTheDocument()
  })

  it('未ログインなら /login へ送り、元の場所を覚えておく', () => {
    renderGuards('anonymous', '/posts/5?focus=1')

    expect(screen.getByText('ログイン画面 from=/posts/5?focus=1')).toBeInTheDocument()
    expect(screen.queryByText('投稿詳細')).not.toBeInTheDocument()
  })

  it('状態の復元中は何も表示しない(ログイン画面にも飛ばさない)', () => {
    const { container } = renderGuards('loading', '/')

    expect(container).toBeEmptyDOMElement()
  })
})

describe('GuestOnly', () => {
  it('未ログインならログイン画面を表示する', () => {
    renderGuards('anonymous', '/login')

    expect(screen.getByText('ログイン画面 from=なし')).toBeInTheDocument()
  })

  it('ログイン済みでログイン画面を開くと、ホームへ移動する', () => {
    renderGuards('authenticated', '/login')

    expect(screen.getByText('ホーム')).toBeInTheDocument()
    expect(screen.queryByText(/ログイン画面/)).not.toBeInTheDocument()
  })

  it('状態の復元中は何も表示しない', () => {
    const { container } = renderGuards('loading', '/login')

    expect(container).toBeEmptyDOMElement()
  })

  it('覚えておいた元の場所があれば、ログイン済みになったときそこへ移動する', () => {
    render(
      <AuthContext.Provider value={authValue('authenticated')}>
        <MemoryRouter
          initialEntries={[{ pathname: '/login', state: { from: { pathname: '/posts/9', search: '', hash: '' } } }]}
        >
          <Routes>
            <Route element={<GuestOnly />}>
              <Route path="/login" element={<p>ログイン画面</p>} />
            </Route>
            <Route path="/posts/:id" element={<p>投稿詳細</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(screen.getByText('投稿詳細')).toBeInTheDocument()
  })
})
