import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { AuthContext, type AuthContextValue } from '../auth/AuthContext'
import { ToastProvider } from '../components/ToastProvider'
import { MESSAGES } from '../validation/auth'
import { NETWORK_ERROR_MESSAGE } from './formErrors'
import { SignupPage } from './SignupPage'

function renderPage(signup: AuthContextValue['signup'] = vi.fn().mockResolvedValue(undefined)) {
  render(
    <AuthContext.Provider
      value={{ status: 'anonymous', user: null, login: vi.fn(), signup, logout: vi.fn(), updateUser: vi.fn() }}
    >
      <ToastProvider>
        <MemoryRouter>
          <SignupPage />
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>,
  )
  return signup
}

const email = () => screen.getByLabelText('メールアドレス')
const password = () => screen.getByLabelText('パスワード')
const displayName = () => screen.getByLabelText('表示名')
const handle = () => screen.getByLabelText('ユーザーハンドル')
const submit = () => screen.getByRole('button', { name: /登録する|送信中/ })

async function fillValid() {
  await userEvent.type(email(), '  a@example.com ')
  await userEvent.type(password(), 'password1')
  await userEvent.type(displayName(), '  田村  ')
  await userEvent.type(handle(), '@tamura')
}

describe('SignupPage', () => {
  it('ログイン画面へのリンクがある', () => {
    renderPage()

    expect(screen.getByRole('link', { name: 'ログイン' })).toHaveAttribute('href', '/login')
  })

  it('入力の規則をヒントとして出す', () => {
    renderPage()

    expect(screen.getByText('8〜64 文字、英字と数字を含める')).toBeInTheDocument()
    expect(screen.getByText('1〜50 文字')).toBeInTheDocument()
    expect(screen.getByText('@ なしで入力。半角英数字と _ の 3〜30 文字')).toBeInTheDocument()
  })

  it('空のまま送信すると、すべての項目にエラーを出して送信しない', async () => {
    const signup = renderPage()

    await userEvent.click(submit())

    expect(screen.getByText(MESSAGES.email)).toBeInTheDocument()
    expect(screen.getByText(MESSAGES.password)).toBeInTheDocument()
    expect(screen.getByText(MESSAGES.displayName)).toBeInTheDocument()
    expect(screen.getByText(MESSAGES.handle)).toBeInTheDocument()
    expect(signup).not.toHaveBeenCalled()
  })

  it('不正な項目だけにエラーを出す', async () => {
    const signup = renderPage()
    await userEvent.type(email(), 'a@example.com')
    await userEvent.type(password(), 'short')
    await userEvent.type(displayName(), '田村')
    await userEvent.type(handle(), 'tamura')

    await userEvent.click(submit())

    expect(screen.getByText(MESSAGES.password)).toBeInTheDocument()
    expect(screen.queryByText(MESSAGES.email)).not.toBeInTheDocument()
    expect(screen.queryByText(MESSAGES.handle)).not.toBeInTheDocument()
    expect(signup).not.toHaveBeenCalled()
  })

  it('メール・表示名の前後の空白と、ハンドルの先頭の @ を取り除いて送る(パスワードはそのまま)', async () => {
    const signup = renderPage()
    await fillValid()

    await userEvent.click(submit())

    expect(signup).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'password1',
      displayName: '田村',
      handle: 'tamura',
    })
  })

  it('成功したら「登録しました」のトーストを出す', async () => {
    renderPage()
    await fillValid()

    await userEvent.click(submit())

    expect(await screen.findByText('登録しました')).toBeInTheDocument()
  })

  it('送信中はボタンを無効にして「送信中…」と表示する', async () => {
    let finish!: () => void
    renderPage(vi.fn(() => new Promise<void>((resolve) => (finish = resolve))))
    await fillValid()

    await userEvent.click(submit())

    expect(screen.getByRole('button', { name: '送信中…' })).toBeDisabled()
    finish()
  })

  it('メールの重複(409)は、メール欄にエラーを出す', async () => {
    renderPage(
      vi.fn().mockRejectedValue(new ApiError(409, { code: 'EMAIL_ALREADY_EXISTS', message: 'このメールアドレスは登録済みです' })),
    )
    await fillValid()

    await userEvent.click(submit())

    expect(await screen.findByText('このメールアドレスは登録済みです')).toBeInTheDocument()
    expect(email()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: '登録する' })).toBeEnabled()
  })

  it('ハンドルの重複(409)は、ハンドル欄にエラーを出す', async () => {
    renderPage(
      vi.fn().mockRejectedValue(new ApiError(409, { code: 'HANDLE_ALREADY_EXISTS', message: 'このハンドルは使われています' })),
    )
    await fillValid()

    await userEvent.click(submit())

    expect(await screen.findByText('このハンドルは使われています')).toBeInTheDocument()
    expect(handle()).toHaveAttribute('aria-invalid', 'true')
  })

  it('サーバーの項目別エラー(400)を、該当の項目に出す', async () => {
    renderPage(
      vi.fn().mockRejectedValue(
        new ApiError(400, { code: 'VALIDATION_ERROR', message: '入力が正しくありません', fieldErrors: { displayName: 'サーバー側の表示名エラー' } }),
      ),
    )
    await fillValid()

    await userEvent.click(submit())

    expect(await screen.findByText('サーバー側の表示名エラー')).toBeInTheDocument()
    expect(displayName()).toHaveAttribute('aria-invalid', 'true')
  })

  it('通信に失敗したら、通信エラーの文言をフォーム全体に出す', async () => {
    renderPage(vi.fn().mockRejectedValue(new Error('offline')))
    await fillValid()

    await userEvent.click(submit())

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeInTheDocument()
  })
})
