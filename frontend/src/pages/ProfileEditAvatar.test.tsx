import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
const OLD_URL = 'https://s3.test/get/old.png'
const ME: User = { ...SESSION.user }
const ME_WITH_AVATAR: User = { ...SESSION.user, avatarUrl: OLD_URL }

const GET_ME = 'GET /api/auth/me'
const PUT_ME = 'PUT /api/users/me'
const ISSUE = 'POST /api/images/upload-url'
const S3_PUT = 'PUT https://s3.test/upload/new'

const issued: Handler = () =>
  json(200, { uploadUrl: 'https://s3.test/upload/new', imageKey: 'avatars/1/new.png', expiresIn: 300 })
const s3Ok: Handler = () => new Response(null, { status: 200 })

function profileHandlers(user: User): Record<string, Handler> {
  const profile: UserProfile = { ...user, followingCount: 0, followerCount: 0, followedByMe: false, isMe: true }
  return {
    'GET /api/users/tamura': () => json(200, profile),
    'GET /api/users/tamura/posts': () => json(200, { items: [], nextCursor: null }),
  }
}

function png(size = 1000, type = 'image/png', name = 'a.png'): File {
  return new File([new Uint8Array(size)], name, { type })
}

function renderEdit() {
  return render(
    <MemoryRouter initialEntries={['/settings/profile']}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

async function pick(file: File) {
  await userEvent.upload(await screen.findByLabelText('画像を選ぶ'), file)
}

/** accept で弾かれない(userEvent.upload が無視してしまう)形式のファイルも、画面に渡す。 */
function pickRaw(file: File) {
  fireEvent.change(screen.getByLabelText('画像を選ぶ'), { target: { files: [file] } })
}

function formAvatarImg(): HTMLImageElement | null {
  return document.querySelector('form .avatar img')
}

let previewCounter = 0
let revoked: string[] = []

beforeEach(() => {
  tokenStore.clear()
  previewCounter = 0
  revoked = []
  URL.createObjectURL = vi.fn(() => `blob:preview-${++previewCounter}`)
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url)
  })
  vi.stubGlobal('scrollTo', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('アイコンの表示', () => {
  it('今のアイコンがあれば画像を出し、「画像を削除」を出す', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, ME_WITH_AVATAR) })

    renderEdit()
    await screen.findByLabelText('画像を選ぶ')

    expect(formAvatarImg()).toHaveAttribute('src', OLD_URL)
    expect(screen.getByRole('button', { name: '画像を削除' })).toBeInTheDocument()
  })

  it('アイコンが無いときは、頭文字を出し、「画像を削除」は出さない', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, ME) })

    renderEdit()
    await screen.findByLabelText('画像を選ぶ')

    expect(formAvatarImg()).toBeNull()
    expect(screen.queryByRole('button', { name: '画像を削除' })).not.toBeInTheDocument()
  })
})

describe('画像を選ぶ', () => {
  it('選ぶとすぐプレビューを出す(この時点では、何も送らない)', async () => {
    const { count } = stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, ME) })

    renderEdit()
    await pick(png())

    expect(formAvatarImg()).toHaveAttribute('src', 'blob:preview-1')
    expect(screen.getByRole('button', { name: '画像を削除' })).toBeInTheDocument()
    expect(count(ISSUE)).toBe(0)
  })

  it('別の画像を選び直すと、前のプレビューを解放する', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, ME) })

    renderEdit()
    await pick(png(1000, 'image/png', 'a.png'))
    await pick(png(2000, 'image/jpeg', 'b.jpg'))

    expect(formAvatarImg()).toHaveAttribute('src', 'blob:preview-2')
    expect(revoked).toEqual(['blob:preview-1'])
  })

  it('JPEG・PNG・WebP 以外は、エラーを出して選ばない', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, ME_WITH_AVATAR) })

    renderEdit()
    await screen.findByLabelText('画像を選ぶ')
    pickRaw(png(1000, 'image/gif', 'a.gif'))

    expect(await screen.findByText('JPEG、PNG、WebP の画像を選んでください')).toBeInTheDocument()
    // 今のアイコンのまま
    expect(formAvatarImg()).toHaveAttribute('src', OLD_URL)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('5MB を超える画像は、エラーを出して選ばない(5MB ちょうどは選べる)', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, ME) })

    renderEdit()
    await screen.findByLabelText('画像を選ぶ')
    pickRaw(png(5 * 1024 * 1024 + 1))
    expect(await screen.findByText('画像は 1 枚 5MB 以下にしてください')).toBeInTheDocument()
    expect(formAvatarImg()).toBeNull()

    pickRaw(png(5 * 1024 * 1024))
    expect(formAvatarImg()).toHaveAttribute('src', 'blob:preview-1')
    expect(screen.queryByText('画像は 1 枚 5MB 以下にしてください')).not.toBeInTheDocument()
  })

  it('空のファイルは選べない', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, ME) })

    renderEdit()
    await screen.findByLabelText('画像を選ぶ')
    pickRaw(png(0))

    expect(await screen.findByText('空の画像は使えません')).toBeInTheDocument()
  })
})

describe('画像を削除', () => {
  it('選んだ画像を取り消すと、今のアイコンに戻る(保存しても、アイコンは変わらない)', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME_WITH_AVATAR),
      [PUT_ME]: () => json(200, ME_WITH_AVATAR),
      ...profileHandlers(ME_WITH_AVATAR),
    })

    renderEdit()
    await pick(png())
    await userEvent.click(screen.getByRole('button', { name: '画像を削除' }))

    expect(formAvatarImg()).toHaveAttribute('src', OLD_URL)
    expect(revoked).toEqual(['blob:preview-1'])

    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('heading', { name: '田村' })
    expect(calls.find((c) => `${c.method} ${c.path}` === PUT_ME)?.body).toEqual({ displayName: '田村', bio: '' })
  })

  it('今のアイコンを削除して保存すると、removeAvatar を送る', async () => {
    const { calls, count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME_WITH_AVATAR),
      [PUT_ME]: () => json(200, ME),
      ...profileHandlers(ME),
    })

    renderEdit()
    await userEvent.click(await screen.findByRole('button', { name: '画像を削除' }))

    expect(formAvatarImg()).toBeNull()
    expect(screen.queryByRole('button', { name: '画像を削除' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('heading', { name: '田村' })
    expect(calls.find((c) => `${c.method} ${c.path}` === PUT_ME)?.body).toEqual({
      displayName: '田村',
      bio: '',
      removeAvatar: true,
    })
    expect(count(ISSUE)).toBe(0)
  })

  it('削除したあとに別の画像を選ぶと、置き換えになる(削除は送らない)', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME_WITH_AVATAR),
      [ISSUE]: issued,
      [S3_PUT]: s3Ok,
      [PUT_ME]: () => json(200, { ...ME, avatarUrl: 'https://s3.test/get/new.png' }),
      ...profileHandlers(ME),
    })

    renderEdit()
    await userEvent.click(await screen.findByRole('button', { name: '画像を削除' }))
    await pick(png())
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await screen.findByRole('heading', { name: '田村' })
    expect(calls.find((c) => `${c.method} ${c.path}` === PUT_ME)?.body).toEqual({
      displayName: '田村',
      bio: '',
      avatarKey: 'avatars/1/new.png',
    })
  })
})

describe('保存', () => {
  it('選んだ画像を S3 へアップロードしてから、キーを送って保存する。ヘッダーのアイコンも変わる', async () => {
    const updated: User = { ...ME, avatarUrl: 'https://s3.test/get/new.png' }
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME),
      [ISSUE]: issued,
      [S3_PUT]: s3Ok,
      [PUT_ME]: () => json(200, updated),
      ...profileHandlers(updated),
    })

    renderEdit()
    const file = png(1234, 'image/png')
    await pick(file)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('heading', { name: '田村' })).toBeInTheDocument()
    // 署名付き URL の申し込み → S3 へ直接 PUT → キーを送って保存、の順
    const order = calls.map((c) => `${c.method} ${c.path}`).filter((k) => [ISSUE, S3_PUT, PUT_ME].includes(k))
    expect(order).toEqual([ISSUE, S3_PUT, PUT_ME])
    expect(calls.find((c) => `${c.method} ${c.path}` === ISSUE)?.body).toEqual({
      purpose: 'avatar',
      contentType: 'image/png',
      size: 1234,
    })
    expect(calls.find((c) => `${c.method} ${c.path}` === PUT_ME)?.body).toEqual({
      displayName: '田村',
      bio: '',
      avatarKey: 'avatars/1/new.png',
    })
    // ヘッダーと、プロフィールのアイコンが、新しい画像になる
    expect(document.querySelector('header .avatar img')).toHaveAttribute('src', 'https://s3.test/get/new.png')
  })

  it('画像を選んでいなければ、アップロードも、avatarKey / removeAvatar も送らない', async () => {
    const { calls, count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME_WITH_AVATAR),
      [PUT_ME]: () => json(200, ME_WITH_AVATAR),
      ...profileHandlers(ME_WITH_AVATAR),
    })

    renderEdit()
    await userEvent.type(await screen.findByLabelText('表示名'), '!')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await screen.findByRole('heading', { name: '田村' })
    expect(calls.find((c) => `${c.method} ${c.path}` === PUT_ME)?.body).toEqual({ displayName: '田村!', bio: '' })
    expect(count(ISSUE)).toBe(0)
  })

  it('署名付き URL の発行に失敗したら、サーバーのメッセージを出し、保存はしない', async () => {
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME),
      [ISSUE]: () => apiError(503, 'IMAGES_NOT_CONFIGURED', '画像のアップロードは現在利用できません'),
    })

    renderEdit()
    await pick(png())
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('画像のアップロードは現在利用できません')).toBeInTheDocument()
    expect(count(PUT_ME)).toBe(0)
    // 入力はそのまま。選んだ画像も残り、直したらもう一度保存できる
    expect(formAvatarImg()).toHaveAttribute('src', 'blob:preview-1')
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('S3 へのアップロードに失敗したら、メッセージを出し、保存はしない。再試行ではもう一度アップロードする', async () => {
    let fail = true
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME),
      [ISSUE]: issued,
      [S3_PUT]: () => (fail ? new Response(null, { status: 500 }) : new Response(null, { status: 200 })),
      [PUT_ME]: () => json(200, ME),
      ...profileHandlers(ME),
    })

    renderEdit()
    await pick(png())
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText(/画像のアップロードに失敗しました/)).toBeInTheDocument()
    expect(count(PUT_ME)).toBe(0)

    fail = false
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('heading', { name: '田村' })
    expect(count(S3_PUT)).toBe(2)
  })

  it('画像のアップロード後に保存で失敗しても、再試行ではアップロードをやり直さない', async () => {
    let fail = true
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME),
      [ISSUE]: issued,
      [S3_PUT]: s3Ok,
      [PUT_ME]: () => (fail ? apiError(500, 'INTERNAL', 'サーバーエラー') : json(200, ME)),
      ...profileHandlers(ME),
    })

    renderEdit()
    await pick(png())
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('サーバーエラー')).toBeInTheDocument()

    fail = false
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await screen.findByRole('heading', { name: '田村' })
    expect(count(ISSUE)).toBe(1)
    expect(count(S3_PUT)).toBe(1)
    expect(count(PUT_ME)).toBe(2)
  })

  it('サーバーが画像を受け付けなかったら(400)、メッセージを出し、選び直せるようにする', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [GET_ME]: () => json(200, ME),
      [ISSUE]: issued,
      [S3_PUT]: s3Ok,
      [PUT_ME]: () => apiError(400, 'VALIDATION_ERROR', 'JPEG、PNG、WebP の画像を選んでください'),
    })

    renderEdit()
    await pick(png())
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('JPEG、PNG、WebP の画像を選んでください')).toBeInTheDocument()
    // 選んだ画像は取り消され、選び直せる
    expect(formAvatarImg()).toBeNull()
    expect(screen.getByLabelText('画像を選ぶ')).toBeEnabled()
  })

  it('画面を離れるときに、プレビューを解放する', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [GET_ME]: () => json(200, ME) })

    const view = renderEdit()
    await pick(png())
    view.unmount()

    await waitFor(() => expect(revoked).toContain('blob:preview-1'))
  })
})
