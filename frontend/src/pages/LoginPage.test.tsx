import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { AuthContext, type AuthContextValue } from '../auth/AuthContext'
import { MESSAGES } from '../validation/auth'
import { NETWORK_ERROR_MESSAGE } from './formErrors'
import { LoginPage } from './LoginPage'

function renderPage(login: AuthContextValue['login'] = vi.fn().mockResolvedValue(undefined)) {
  render(
    <AuthContext.Provider
      value={{ status: 'anonymous', user: null, login, signup: vi.fn(), logout: vi.fn(), updateUser: vi.fn() }}
    >
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  return login
}

const email = () => screen.getByLabelText('メールアドレス')
const password = () => screen.getByLabelText('パスワード')
const submit = () => screen.getByRole('button', { name: /ログイン|送信中/ })

describe('LoginPage', () => {
  it('メールアドレスにフォーカスが当たった状態で表示する', () => {
    renderPage()

    expect(email()).toHaveFocus()
    expect(password()).toHaveAttribute('type', 'password')
  })

  it('新規登録画面へのリンクがある', () => {
    renderPage()

    expect(screen.getByRole('link', { name: '新規登録' })).toHaveAttribute('href', '/signup')
  })

  it('空のまま送信すると、項目ごとのエラーを出して送信しない', async () => {
    const login = renderPage()

    await userEvent.click(submit())

    expect(screen.getByText(MESSAGES.email)).toBeInTheDocument()
    expect(screen.getByText(MESSAGES.loginPasswordRequired)).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('メールの形式が違えばメールだけにエラーを出す', async () => {
    const login = renderPage()
    await userEvent.type(email(), 'not-an-email')
    await userEvent.type(password(), 'password1')

    await userEvent.click(submit())

    expect(screen.getByText(MESSAGES.email)).toBeInTheDocument()
    expect(screen.queryByText(MESSAGES.loginPasswordRequired)).not.toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('ログイン時はパスワードの強度を検証しない(1 文字以上なら送る)', async () => {
    const login = renderPage()
    await userEvent.type(email(), 'a@example.com')
    await userEvent.type(password(), 'x')

    await userEvent.click(submit())

    expect(login).toHaveBeenCalledWith('a@example.com', 'x')
  })

  it('メールの前後の空白を取り除き、パスワードはそのまま送る', async () => {
    const login = renderPage()
    await userEvent.type(email(), '  a@example.com  ')
    await userEvent.type(password(), ' pass word1 ')

    await userEvent.click(submit())

    expect(login).toHaveBeenCalledWith('a@example.com', ' pass word1 ')
  })

  it('エラーを直して送り直すと、前のエラーは消える', async () => {
    renderPage()
    await userEvent.click(submit())
    expect(screen.getByText(MESSAGES.email)).toBeInTheDocument()

    await userEvent.type(email(), 'a@example.com')
    await userEvent.type(password(), 'password1')
    await userEvent.click(submit())

    await waitFor(() => expect(screen.queryByText(MESSAGES.email)).not.toBeInTheDocument())
  })

  it('送信中はボタンを無効にして「送信中…」と表示する', async () => {
    let finish!: () => void
    const login = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    renderPage(login)
    await userEvent.type(email(), 'a@example.com')
    await userEvent.type(password(), 'password1')

    await userEvent.click(submit())

    expect(screen.getByRole('button', { name: '送信中…' })).toBeDisabled()
    finish()
  })

  it('認証に失敗したら、サーバーの文言をフォーム全体に出し、ボタンを戻す', async () => {
    const login = vi.fn().mockRejectedValue(
      new ApiError(401, { code: 'LOGIN_FAILED', message: 'メールアドレスまたはパスワードが正しくありません' }),
    )
    renderPage(login)
    await userEvent.type(email(), 'a@example.com')
    await userEvent.type(password(), 'wrong-pass1')

    await userEvent.click(submit())

    expect(await screen.findByText('メールアドレスまたはパスワードが正しくありません')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled()
  })

  it('通信に失敗したら、通信エラーの文言をフォーム全体に出す', async () => {
    renderPage(vi.fn().mockRejectedValue(new Error('offline')))
    await userEvent.type(email(), 'a@example.com')
    await userEvent.type(password(), 'password1')

    await userEvent.click(submit())

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeInTheDocument()
  })
})
