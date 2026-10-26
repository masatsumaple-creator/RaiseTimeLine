import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import type { Post } from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import { tokenStore } from '../auth/tokenStore'
import { ToastProvider } from '../components/ToastProvider'
import { json, SESSION, stubFetch, type Handler } from '../test/fakeServer'

const REFRESH_OK: Handler = () => json(200, SESSION)
const FOLLOWING = 'GET /api/timeline?tab=following'

function post(id: number, body: string, urls: string[], overrides: Partial<Post> = {}): Post {
  return {
    id,
    body,
    createdAt: new Date().toISOString(),
    editedAt: null,
    author: SESSION.user,
    likeCount: 0,
    likedByMe: false,
    commentCount: 0,
    images: urls.map((url, sortOrder) => ({ url, sortOrder })),
    ...overrides,
  }
}

const page = (items: Post[]) => json(200, { items, nextCursor: null })

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
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 0
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('投稿カードの画像', () => {
  it('画像のある投稿に、サムネイルを出す。画像の無い投稿には出さない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () =>
        page([post(2, '写真つき', ['https://s3.test/get/a.png', 'https://s3.test/get/b.png']), post(1, '文章だけ', [])]),
    })

    renderAt('/')

    const [withImages, textOnly] = await screen.findAllByRole('article')
    expect(within(withImages).getAllByRole('img', { name: /投稿の画像/ })).toHaveLength(2)
    expect(within(textOnly).queryByRole('img')).not.toBeInTheDocument()
  })

  it('サムネイルを押すと拡大表示を開き、投稿の詳細へは移動しない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(2, '写真つき', ['https://s3.test/get/a.png'])]),
    })

    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: '画像 1 を拡大' }))

    expect(screen.getByRole('dialog', { name: '画像の拡大表示' })).toBeInTheDocument()
    // 一覧のまま(詳細画面には移動していない)
    expect(screen.getByRole('heading', { name: 'タイムライン' })).toBeInTheDocument()
  })

  it('画像だけの投稿(本文が空)は、空の本文の段落を出さない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(2, '', ['https://s3.test/get/a.png'])]),
    })

    renderAt('/')

    const article = await screen.findByRole('article')
    expect(article.querySelector('.post-body')).toBeNull()
    expect(within(article).getByRole('img', { name: '投稿の画像 1' })).toBeInTheDocument()
  })

  it('投稿の詳細にも、画像を出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/posts/2': () => json(200, post(2, '詳細', ['https://s3.test/get/a.png', 'https://s3.test/get/b.png', 'https://s3.test/get/c.png'])),
      'GET /api/posts/2/comments': () => json(200, { items: [], nextCursor: null }),
    })

    renderAt('/posts/2')

    const article = await screen.findByRole('article')
    expect(within(article).getAllByRole('img', { name: /投稿の画像/ })).toHaveLength(3)
  })
})

describe('画像のある投稿の編集', () => {
  const OWN = (body: string, urls: string[]) => post(2, body, urls)

  it('本文を空にして保存できる(画像だけの投稿になる)', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([OWN('消す本文', ['https://s3.test/get/a.png'])]),
      'PUT /api/posts/2': () => json(200, post(2, '', ['https://s3.test/get/a.png'], { editedAt: new Date().toISOString() })),
    })

    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: '編集' }))
    await userEvent.clear(screen.getByLabelText('投稿を編集'))
    const save = screen.getByRole('button', { name: '保存' })
    expect(save).toBeEnabled()
    await userEvent.click(save)

    const article = await screen.findByRole('article')
    expect(await within(article).findByText('(編集済み)')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'PUT' && c.path === '/api/posts/2')?.body).toEqual({ body: '' })
    // 画像は、そのまま残る
    expect(within(article).getByRole('img', { name: '投稿の画像 1' })).toBeInTheDocument()
  })

  it('画像の無い投稿は、本文を空にして保存できない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([OWN('文章だけ', [])]),
    })

    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: '編集' }))
    await userEvent.clear(screen.getByLabelText('投稿を編集'))

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('編集中も、画像は表示したまま', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([OWN('本文', ['https://s3.test/get/a.png'])]),
    })

    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: '編集' }))

    expect(screen.getByRole('img', { name: '投稿の画像 1' })).toBeInTheDocument()
  })
})
