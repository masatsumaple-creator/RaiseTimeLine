import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue, type AuthStatus } from '../auth/AuthContext'
import { Header } from './Header'
import { ToastProvider } from './ToastProvider'

function authValue(status: AuthStatus, overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status,
    user: status === 'authenticated' ? { id: 1, handle: 'tamura', displayName: '田村' } : null,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn(),
    ...overrides,
  }
}

function renderHeader(value: AuthContextValue) {
  return render(
    <AuthContext.Provider value={value}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/']}>
          <Header />
          <Routes>
            <Route path="/" element={<p>ホーム画面</p>} />
            <Route path="/login" element={<p>ログイン画面</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>,
  )
}

describe('Header', () => {
  it('ロゴはホームへのリンク', () => {
    renderHeader(authValue('authenticated'))

    expect(screen.getByRole('link', { name: 'RaiseTimeLine' })).toHaveAttribute('href', '/')
  })

  describe('ログイン済み', () => {
    it('ユーザー検索・自分のプロフィール・ログアウトを出す', () => {
      renderHeader(authValue('authenticated'))

      expect(screen.getByRole('link', { name: 'ユーザー検索' })).toHaveAttribute('href', '/search')
      expect(screen.getByRole('link', { name: /田村/ })).toHaveAttribute('href', '/users/tamura')
      expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
    })

    it('ログイン・新規登録のリンクは出さない', () => {
      renderHeader(authValue('authenticated'))

      expect(screen.queryByRole('link', { name: 'ログイン' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: '新規登録' })).not.toBeInTheDocument()
    })

    it('ログアウトを押すと、ログアウトしてトーストを出し、ログイン画面へ移動する', async () => {
      const logout = vi.fn().mockResolvedValue(undefined)
      renderHeader(authValue('authenticated', { logout }))

      await userEvent.click(screen.getByRole('button', { name: 'ログアウト' }))

      await waitFor(() => expect(screen.getByText('ログイン画面')).toBeInTheDocument())
      expect(logout).toHaveBeenCalledTimes(1)
      expect(screen.getByText('ログアウトしました')).toBeInTheDocument()
    })
  })

  describe('未ログイン', () => {
    it('ログインと新規登録のリンクを出す', () => {
      renderHeader(authValue('anonymous'))

      expect(screen.getByRole('link', { name: 'ログイン' })).toHaveAttribute('href', '/login')
      expect(screen.getByRole('link', { name: '新規登録' })).toHaveAttribute('href', '/signup')
    })

    it('ユーザー検索やログアウトは出さない', () => {
      renderHeader(authValue('anonymous'))

      expect(screen.queryByRole('link', { name: 'ユーザー検索' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument()
    })
  })

  describe('状態の復元中', () => {
    it('どちらのメニューも出さない(表示がちらつかないように)', () => {
      renderHeader(authValue('loading'))

      expect(screen.queryByRole('link', { name: 'ログイン' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'ログアウト' })).not.toBeInTheDocument()
    })
  })
})
