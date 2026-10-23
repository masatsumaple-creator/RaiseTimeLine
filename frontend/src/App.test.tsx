import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { AuthProvider } from './auth/AuthProvider'
import { tokenStore } from './auth/tokenStore'
import { ToastProvider } from './components/ToastProvider'
import { apiError, json, noContent, SESSION, stubFetch, type Handler } from './test/fakeServer'

const TIMELINE = 'GET /api/timeline?tab=following'

const REFRESH_FAILS: Handler = () => apiError(401, 'INVALID_REFRESH_TOKEN', '期限切れ')
const REFRESH_OK: Handler = () => json(200, SESSION)
const EMPTY_TIMELINE: Handler = () => json(200, { items: [], nextCursor: null })

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  tokenStore.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('起動時の状態復元とガード', () => {
  it('未ログイン(リフレッシュ失敗)なら、保護された画面からログイン画面へ移動する', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_FAILS })

    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    // 未ログインのヘッダーには、ログインと新規登録のボタンが出る
    const header = within(screen.getByRole('banner'))
    expect(header.getByRole('link', { name: 'ログイン' })).toHaveAttribute('href', '/login')
    expect(header.getByRole('link', { name: '新規登録' })).toHaveAttribute('href', '/signup')
  })

  it('リフレッシュに成功すればログイン状態を復元し、ログイン後ページにタイムラインを表示する', async () => {
    const server = stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [TIMELINE]: EMPTY_TIMELINE })

    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'タイムライン' })).toBeInTheDocument()
    expect(await screen.findByText('まだ投稿がありません。最初の投稿をしてみましょう。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
    expect(server.calls.find((c) => c.path === TIMELINE.slice(4))?.headers.Authorization).toBe('Bearer access-1')
  })

  it('ログイン済みでログイン画面・登録画面を開くと、ホームへ移動する', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [TIMELINE]: EMPTY_TIMELINE })

    renderApp('/login')

    expect(await screen.findByRole('heading', { name: 'タイムライン' })).toBeInTheDocument()
  })

  it('アクセストークンが期限切れでも、リフレッシュして自動で続行する', async () => {
    let refreshCalls = 0
    const server = stubFetch({
      'POST /api/auth/refresh': () =>
        json(200, { ...SESSION, accessToken: ++refreshCalls === 1 ? 'access-1' : 'access-2' }),
      [TIMELINE]: (req) =>
        req.headers.Authorization === 'Bearer access-2'
          ? json(200, {
              items: [{ id: 1, body: 'はじめての投稿', createdAt: new Date().toISOString(), editedAt: null, author: SESSION.user, likeCount: 0, likedByMe: false }],
              nextCursor: null,
            })
          : apiError(401, 'UNAUTHORIZED', '期限切れ'),
    })

    renderApp('/')

    expect(await screen.findByText('はじめての投稿')).toBeInTheDocument()
    expect(server.count('POST /api/auth/refresh')).toBe(2)
  })

  it('リフレッシュも失敗したらログイン画面へ戻る', async () => {
    let refreshCalls = 0
    stubFetch({
      'POST /api/auth/refresh': () => (++refreshCalls === 1 ? json(200, SESSION) : REFRESH_FAILS({} as never)),
      [TIMELINE]: () => apiError(401, 'UNAUTHORIZED', '期限切れ'),
    })

    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
  })

  it('存在しないパスは NotFound', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_FAILS })

    renderApp('/no-such-page')

    expect(await screen.findByRole('heading', { name: 'ページが見つかりません' })).toBeInTheDocument()
  })
})

describe('ログイン画面', () => {
  async function openLogin() {
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_FAILS,
      'POST /api/auth/login': () => json(200, SESSION),
      [TIMELINE]: EMPTY_TIMELINE,
    })
    const user = userEvent.setup()
    renderApp('/login')
    await screen.findByRole('heading', { name: 'ログイン' })
    return { server, user }
  }

  it('空のまま送信すると、項目ごとのエラーが出て送信されない', async () => {
    const { server, user } = await openLogin()

    await user.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(screen.getByText('メールアドレスの形式が正しくありません')).toBeInTheDocument()
    expect(screen.getByText('パスワードを入力してください')).toBeInTheDocument()
    expect(server.count('POST /api/auth/login')).toBe(0)
  })

  it('正しく入力して送信すると、ログインしてホームを表示する(メールは前後の空白を除いて送る)', async () => {
    const { server, user } = await openLogin()

    await user.type(screen.getByLabelText('メールアドレス'), ' tamura@example.com ')
    await user.type(screen.getByLabelText('パスワード'), 'password1')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByRole('heading', { name: 'タイムライン' })).toBeInTheDocument()
    expect(server.calls.find((c) => c.path === '/api/auth/login')?.body).toEqual({
      email: 'tamura@example.com',
      password: 'password1',
    })
  })

  it('ログインに失敗すると、どちらが違うか示さない固定文言を出し、画面に残る', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_FAILS,
      'POST /api/auth/login': () =>
        apiError(401, 'LOGIN_FAILED', 'メールアドレスまたはパスワードが正しくありません'),
    })
    const user = userEvent.setup()
    renderApp('/login')

    await user.type(await screen.findByLabelText('メールアドレス'), 'tamura@example.com')
    await user.type(screen.getByLabelText('パスワード'), 'wrongpass1')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByText('メールアドレスまたはパスワードが正しくありません')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled()
  })

  it('送信中はボタンを無効にして「送信中…」と表示する', async () => {
    let finish: (response: Response) => void = () => {}
    stubFetch({
      'POST /api/auth/refresh': REFRESH_FAILS,
      'POST /api/auth/login': () => new Promise<Response>((resolve) => (finish = resolve)),
      [TIMELINE]: EMPTY_TIMELINE,
    })
    const user = userEvent.setup()
    renderApp('/login')

    await user.type(await screen.findByLabelText('メールアドレス'), 'tamura@example.com')
    await user.type(screen.getByLabelText('パスワード'), 'password1')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))

    const pending = await screen.findByRole('button', { name: '送信中…' })
    expect(pending).toBeDisabled()
    finish(json(200, SESSION))
    expect(await screen.findByRole('heading', { name: 'タイムライン' })).toBeInTheDocument()
  })

  it('通信に失敗したら、フォーム全体にエラーを出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_FAILS,
      'POST /api/auth/login': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    const user = userEvent.setup()
    renderApp('/login')

    await user.type(await screen.findByLabelText('メールアドレス'), 'tamura@example.com')
    await user.type(screen.getByLabelText('パスワード'), 'password1')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByText('通信に失敗しました。しばらくしてからやり直してください')).toBeInTheDocument()
  })

  it('ログイン前に開こうとした画面があれば、ログイン後にそこへ戻る', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_FAILS,
      'POST /api/auth/login': () => json(200, SESSION),
      [TIMELINE]: EMPTY_TIMELINE,
    })
    const user = userEvent.setup()
    renderApp('/')

    await user.type(await screen.findByLabelText('メールアドレス'), 'tamura@example.com')
    await user.type(screen.getByLabelText('パスワード'), 'password1')
    await user.click(screen.getByRole('button', { name: 'ログイン' }))

    expect(await screen.findByRole('heading', { name: 'タイムライン' })).toBeInTheDocument()
  })
})

describe('新規登録画面', () => {
  async function openSignup(overrides: Record<string, Handler> = {}) {
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_FAILS,
      'POST /api/auth/signup': () => json(201, SESSION),
      [TIMELINE]: EMPTY_TIMELINE,
      ...overrides,
    })
    const user = userEvent.setup()
    renderApp('/signup')
    await screen.findByRole('heading', { name: '新規登録' })
    return { server, user }
  }

  async function fill(user: ReturnType<typeof userEvent.setup>, values: Record<string, string>) {
    for (const [label, value] of Object.entries(values)) {
      await user.type(screen.getByLabelText(label), value)
    }
  }

  it('不正な入力はすべて項目ごとにエラーを出し、送信しない', async () => {
    const { server, user } = await openSignup()

    await fill(user, { メールアドレス: 'bad', パスワード: 'abcdefgh', 表示名: ' ', ユーザーハンドル: 'a-b' })
    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(screen.getByText('メールアドレスの形式が正しくありません')).toBeInTheDocument()
    expect(screen.getByText('パスワードは 8〜64 文字で、英字と数字を含めてください')).toBeInTheDocument()
    expect(screen.getByText('表示名は 1〜50 文字で入力してください')).toBeInTheDocument()
    expect(screen.getByText('ユーザーハンドルは半角英数字と _ の 3〜30 文字で入力してください')).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute('aria-invalid', 'true')
    expect(server.count('POST /api/auth/signup')).toBe(0)
  })

  it('成功すると先頭の @ と前後の空白を取り除いて送信し、トーストを出してホームへ移動する', async () => {
    const { server, user } = await openSignup()

    await fill(user, {
      メールアドレス: 'tamura@example.com',
      パスワード: 'password1',
      表示名: ' 田村 ',
      ユーザーハンドル: '@tamura',
    })
    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(await screen.findByRole('heading', { name: 'タイムライン' })).toBeInTheDocument()
    expect(screen.getByText('登録しました')).toBeInTheDocument()
    expect(server.calls.find((c) => c.path === '/api/auth/signup')?.body).toEqual({
      email: 'tamura@example.com',
      password: 'password1',
      displayName: '田村',
      handle: 'tamura',
    })
  })

  it('重複(409)は、該当する項目にエラーを出す', async () => {
    const { user } = await openSignup({
      'POST /api/auth/signup': () => apiError(409, 'EMAIL_ALREADY_EXISTS', 'このメールアドレスは登録済みです'),
    })

    await fill(user, {
      メールアドレス: 'tamura@example.com',
      パスワード: 'password1',
      表示名: '田村',
      ユーザーハンドル: 'tamura',
    })
    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(await screen.findByText('このメールアドレスは登録済みです')).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: '登録する' })).toBeEnabled()
  })

  it('サーバーの項目別エラー(400 の fieldErrors)を該当する項目に出す', async () => {
    const { user } = await openSignup({
      'POST /api/auth/signup': () =>
        apiError(400, 'VALIDATION_ERROR', 'x', { handle: 'サーバー側のハンドルエラー', unknown: '無視される' }),
    })

    await fill(user, {
      メールアドレス: 'tamura@example.com',
      パスワード: 'password1',
      表示名: '田村',
      ユーザーハンドル: 'tamura',
    })
    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(await screen.findByText('サーバー側のハンドルエラー')).toBeInTheDocument()
    expect(screen.queryByText('無視される')).not.toBeInTheDocument()
  })

  it('ログイン画面へのリンクがある', async () => {
    await openSignup()

    expect(within(screen.getByRole('main')).getByRole('link', { name: 'ログイン' })).toHaveAttribute('href', '/login')
  })
})

describe('ログアウト', () => {
  it('サーバーへ通知してトークンを捨て、トーストを出してログイン画面へ移動する', async () => {
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [TIMELINE]: EMPTY_TIMELINE,
      'POST /api/auth/logout': () => noContent(),
    })
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'ログアウト' }))

    expect(await screen.findByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    expect(screen.getByText('ログアウトしました')).toBeInTheDocument()
    expect(server.count('POST /api/auth/logout')).toBe(1)
    // 期限切れの可能性があるアクセストークンは、ログアウトでは送らない
    expect(server.calls.find((c) => c.path === '/api/auth/logout')?.headers.Authorization).toBeUndefined()
    expect(tokenStore.get()).toBeNull()
  })

  it('通信に失敗しても、この端末ではログアウトする', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [TIMELINE]: EMPTY_TIMELINE,
      'POST /api/auth/logout': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'ログアウト' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument())
    expect(tokenStore.get()).toBeNull()
  })
})
