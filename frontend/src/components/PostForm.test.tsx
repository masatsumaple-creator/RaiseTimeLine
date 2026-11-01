import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '../api/types'
import { tokenStore } from '../auth/tokenStore'
import { NETWORK_ERROR_MESSAGE } from '../pages/formErrors'
import { apiError, json, stubFetch } from '../test/fakeServer'
import { PostForm } from './PostForm'

const CREATE = 'POST /api/posts'

function created(body: string): Post {
  return {
    id: 1,
    body,
    createdAt: new Date().toISOString(),
    editedAt: null,
    author: { id: 1, handle: 'tamura', displayName: '田村' },
    likeCount: 0,
    likedByMe: false,
    commentCount: 0,
    images: [],
  }
}

function setup() {
  const onCreated = vi.fn()
  render(<PostForm onCreated={onCreated} />)
  return onCreated
}

const textarea = () => screen.getByLabelText('いまどうしてる?')
const submit = () => screen.getByRole('button', { name: /投稿する|投稿中/ })

beforeEach(() => {
  tokenStore.set('access-1')
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('入力', () => {
  it('最初は空で、投稿ボタンは押せず、残り 280 文字', () => {
    setup()

    expect(textarea()).toHaveValue('')
    expect(submit()).toBeDisabled()
    expect(screen.getByText('残り 280 文字')).toBeInTheDocument()
  })

  it('入力するとボタンが押せるようになり、残り文字数が減る', async () => {
    setup()

    await userEvent.type(textarea(), 'こんにちは')

    expect(submit()).toBeEnabled()
    expect(screen.getByText('残り 275 文字')).toBeInTheDocument()
  })

  it('空白だけでは投稿できない', async () => {
    setup()

    await userEvent.type(textarea(), '   ')

    expect(submit()).toBeDisabled()
  })

  it('前後の空白は文字数に数えない', async () => {
    setup()

    await userEvent.type(textarea(), '  ab  ')

    expect(screen.getByText('残り 278 文字')).toBeInTheDocument()
  })

  it('絵文字は 1 文字と数える', async () => {
    setup()

    await userEvent.type(textarea(), '😀😀')

    expect(screen.getByText('残り 278 文字')).toBeInTheDocument()
  })

  it('281 文字以上は投稿できず、残り文字数が負になる', async () => {
    setup()

    await userEvent.click(textarea())
    await userEvent.paste('a'.repeat(281))

    expect(screen.getByText('残り -1 文字')).toBeInTheDocument()
    expect(textarea()).toHaveAttribute('aria-invalid', 'true')
    expect(submit()).toBeDisabled()
  })

  it('280 文字ちょうどなら投稿できる', async () => {
    setup()

    await userEvent.click(textarea())
    await userEvent.paste('a'.repeat(280))

    expect(screen.getByText('残り 0 文字')).toBeInTheDocument()
    expect(submit()).toBeEnabled()
  })
})

describe('投稿', () => {
  it('前後の空白を除いた本文で投稿し、成功したら入力欄を空にして onCreated に渡す', async () => {
    const server = stubFetch({ [CREATE]: () => json(201, created('こんにちは')) })
    const onCreated = setup()
    await userEvent.type(textarea(), '  こんにちは  ')

    await userEvent.click(submit())

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 1, body: 'こんにちは' })))
    expect(server.calls[0].body).toEqual({ body: 'こんにちは', imageKeys: [] })
    expect(textarea()).toHaveValue('')
  })

  it('送信中はボタンを無効にして「投稿中…」と表示する', async () => {
    let finish!: (response: Response) => void
    stubFetch({ [CREATE]: () => new Promise<Response>((resolve) => (finish = resolve)) })
    setup()
    await userEvent.type(textarea(), 'x')

    await userEvent.click(submit())

    expect(screen.getByRole('button', { name: '投稿中…' })).toBeDisabled()
    finish(json(201, created('x')))
    await waitFor(() => expect(screen.getByRole('button', { name: '投稿する' })).toBeInTheDocument())
  })

  it('サーバーの本文エラーは入力欄の下に出し、入力は残す', async () => {
    stubFetch({ [CREATE]: () => apiError(400, 'VALIDATION_ERROR', '入力NG', { body: 'サーバー側の本文エラー' }) })
    const onCreated = setup()
    await userEvent.type(textarea(), '本文')

    await userEvent.click(submit())

    expect(await screen.findByText('サーバー側の本文エラー')).toBeInTheDocument()
    expect(textarea()).toHaveValue('本文')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('通信に失敗したら通信エラーを出し、入力は残して再度投稿できる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    setup()
    await userEvent.type(textarea(), '本文')

    await userEvent.click(submit())

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeInTheDocument()
    expect(textarea()).toHaveValue('本文')
    expect(submit()).toBeEnabled()
  })

  it('成功したあとの再投稿では、前回のエラーを引き継がない', async () => {
    let calls = 0
    stubFetch({
      [CREATE]: () =>
        ++calls === 1 ? apiError(400, 'VALIDATION_ERROR', '入力NG', { body: '一回目のエラー' }) : json(201, created('本文')),
    })
    setup()
    await userEvent.type(textarea(), '本文')
    await userEvent.click(submit())
    expect(await screen.findByText('一回目のエラー')).toBeInTheDocument()

    await userEvent.click(submit())

    await waitFor(() => expect(screen.queryByText('一回目のエラー')).not.toBeInTheDocument())
  })
})
