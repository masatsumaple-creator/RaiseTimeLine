import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import type { User, UserProfile } from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import { tokenStore } from '../auth/tokenStore'
import { ToastProvider } from '../components/ToastProvider'
import { apiError, json, SESSION, stubFetch, type Handler } from '../test/fakeServer'

const REFRESH_OK: Handler = () => json(200, SESSION)
const ME: User = { ...SESSION.user, bio: '元の自己紹介' }

const GET_ME = 'GET /api/auth/me'
const PUT_ME = 'PUT /api/users/me'

/** 保存したあとに移動する、自分のプロフィール(S-05)の取得。 */
function profileHandlers(overrides: Partial<UserProfile> = {}): Record<string, Handler> {
  const profile: UserProfile = {
    ...ME,
    followingCount: 0,
    followerCount: 0,
    followedByMe: false,
    isMe: true,
    ...overrides,
  }
  return {
    'GET /api/users/tamura': () => json(200, profile),
    'GET /api/users/tamura/posts': () => json(200, { items: [], nextCursor: null }),
  }
}

function renderAt(path: string) {
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
  vi.stubGlobal('scrollTo', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('編集画面の表示', () => {
  it('開くと、サーバーの現在の値がフォームに入る', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, ME) })

    renderAt('/settings/profile')

    expect(await screen.findByLabelText('表示名')).toHaveValue('田村')
    expect(screen.getByLabelText('自己紹介')).toHaveValue('元の自己紹介')
    expect(screen.getByText('残り 154 文字')).toBeInTheDocument()
  })

  it('自己紹介が未設定のときは、空の欄で表示する', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, SESSION.user) })

    renderAt('/settings/profile')

    expect(await screen.findByLabelText('自己紹介')).toHaveValue('')
    expect(screen.getByText('残り 160 文字')).toBeInTheDocument()
  })

  it('取得に失敗したら、再読み込みで取り直せる', async () => {
    let fail = true
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => (fail ? apiError(500, 'INTERNAL', 'error') : json(200, ME)),
    })

    renderAt('/settings/profile')
    const retry = await screen.findByRole('button', { name: '再読み込み' })
    fail = false
    await userEvent.click(retry)

    expect(await screen.findByLabelText('表示名')).toHaveValue('田村')
  })

  it('自分のプロフィールの「プロフィールを編集」から開ける。他人のプロフィールには出ない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      ...profileHandlers(),
      'GET /api/users/suzuki': () =>
        json(200, { id: 2, handle: 'suzuki', displayName: '鈴木', followingCount: 0, followerCount: 0, followedByMe: false, isMe: false }),
      'GET /api/users/suzuki/posts': () => json(200, { items: [], nextCursor: null }),
      [GET_ME]: () => json(200, ME),
    })

    const view = renderAt('/users/suzuki')
    await screen.findByRole('heading', { name: '鈴木' })
    expect(screen.queryByRole('link', { name: 'プロフィールを編集' })).not.toBeInTheDocument()
    view.unmount()

    renderAt('/users/tamura')
    await userEvent.click(await screen.findByRole('link', { name: 'プロフィールを編集' }))

    expect(await screen.findByRole('heading', { name: 'プロフィールを編集' })).toBeInTheDocument()
  })
})

describe('保存', () => {
  it('保存すると、サーバーに送って自分のプロフィールへ戻り、ヘッダーの表示名も変わる', async () => {
    const updated: User = { ...SESSION.user, displayName: 'たむら', bio: '新しい自己紹介' }
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME),
      [PUT_ME]: () => json(200, updated),
      ...profileHandlers({ displayName: 'たむら', bio: '新しい自己紹介' }),
    })

    renderAt('/settings/profile')
    const name = await screen.findByLabelText('表示名')
    await userEvent.clear(name)
    await userEvent.type(name, '  たむら  ')
    const bio = screen.getByLabelText('自己紹介')
    await userEvent.clear(bio)
    await userEvent.type(bio, '新しい自己紹介')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    // 自分のプロフィールに戻り、保存した内容が出る
    expect(await screen.findByRole('heading', { name: 'たむら' })).toBeInTheDocument()
    expect(screen.getByText('新しい自己紹介')).toBeInTheDocument()
    expect(await screen.findByText('プロフィールを保存しました')).toBeInTheDocument()
    // ヘッダーの表示名がすぐ変わる
    expect(within(screen.getByRole('banner')).getByText('たむら')).toBeInTheDocument()
    // 前後の空白を取り除いて送る
    const sent = calls.filter((c) => `${c.method} ${c.path}` === PUT_ME)
    expect(sent).toHaveLength(1)
    expect(sent[0].body).toEqual({ displayName: 'たむら', bio: '新しい自己紹介' })
  })

  it('自己紹介を空にして保存できる', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME),
      [PUT_ME]: () => json(200, SESSION.user),
      ...profileHandlers({ bio: undefined }),
    })

    renderAt('/settings/profile')
    await userEvent.clear(await screen.findByLabelText('自己紹介'))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await screen.findByRole('heading', { name: '田村' })
    expect(calls.find((c) => `${c.method} ${c.path}` === PUT_ME)?.body).toEqual({ displayName: '田村', bio: '' })
  })

  it('キャンセルすると、保存せずにプロフィールへ戻る', async () => {
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME),
      ...profileHandlers(),
    })

    renderAt('/settings/profile')
    await userEvent.type(await screen.findByLabelText('表示名'), '変更')
    await userEvent.click(screen.getByRole('link', { name: 'キャンセル' }))

    expect(await screen.findByRole('heading', { name: '田村' })).toBeInTheDocument()
    expect(count(PUT_ME)).toBe(0)
  })

  it('保存ボタンを連打しても、送信は 1 回だけ', async () => {
    let release: (r: Response) => void = () => {}
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME),
      [PUT_ME]: () => new Promise<Response>((resolve) => (release = resolve)),
      ...profileHandlers(),
    })

    renderAt('/settings/profile')
    await screen.findByLabelText('表示名')
    const save = screen.getByRole('button', { name: '保存' })
    await userEvent.click(save)
    await userEvent.click(screen.getByRole('button', { name: '保存中…' }))

    expect(count(PUT_ME)).toBe(1)
    release(json(200, ME))
    await screen.findByRole('heading', { name: '田村' })
  })
})

describe('入力の検証', () => {
  it('表示名が空・空白だけのときは、保存ボタンを押せない', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, ME) })

    renderAt('/settings/profile')
    const name = await screen.findByLabelText('表示名')
    await userEvent.clear(name)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()

    await userEvent.type(name, '   ')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()

    await userEvent.type(name, 'あ')
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('自己紹介は 160 文字ちょうどまで。超えると残り文字数が負になり、保存できない', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, SESSION.user) })

    renderAt('/settings/profile')
    const bio = await screen.findByLabelText('自己紹介')
    await userEvent.click(bio)
    await userEvent.paste('あ'.repeat(160))
    expect(screen.getByText('残り 0 文字')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()

    await userEvent.paste('あ')
    expect(screen.getByText('残り -1 文字')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('サーバーの検証エラーは、その項目の下に出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME),
      [PUT_ME]: () => apiError(400, 'VALIDATION_ERROR', '表示名は 1〜50 文字で入力してください', {
        displayName: '表示名は 1〜50 文字で入力してください',
      }),
    })

    renderAt('/settings/profile')
    await screen.findByLabelText('表示名')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('表示名は 1〜50 文字で入力してください', { selector: '#displayName-error' })).toBeInTheDocument()
    expect(screen.getByLabelText('表示名')).toHaveAttribute('aria-invalid', 'true')
  })

  it('通信に失敗したら、入力を残したまま、メッセージを出して再試行できる', async () => {
    let fail = true
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME),
      [PUT_ME]: () => (fail ? apiError(500, 'INTERNAL', 'サーバーエラー') : json(200, ME)),
      ...profileHandlers(),
    })

    renderAt('/settings/profile')
    const bio = await screen.findByLabelText('自己紹介')
    await userEvent.type(bio, '追記')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('サーバーエラー')).toBeInTheDocument()
    expect(bio).toHaveValue('元の自己紹介追記')

    fail = false
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByRole('heading', { name: '田村' })).toBeInTheDocument()
  })
})
