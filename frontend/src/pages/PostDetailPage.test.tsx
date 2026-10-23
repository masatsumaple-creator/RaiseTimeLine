import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import type { Comment, Post } from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import { tokenStore } from '../auth/tokenStore'
import { ToastProvider } from '../components/ToastProvider'
import { apiError, json, SESSION, stubFetch, type Handler } from '../test/fakeServer'

const ME = SESSION.user
const OTHER = { id: 2, handle: 'suzuki', displayName: '鈴木' }

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 1,
    body: '詳細の投稿',
    createdAt: new Date().toISOString(),
    editedAt: null,
    author: OTHER,
    likeCount: 0,
    likedByMe: false,
    commentCount: 0,
    ...overrides,
  }
}

function comment(id: number, body: string, overrides: Partial<Comment> = {}): Comment {
  return { id, postId: 1, body, createdAt: new Date().toISOString(), author: OTHER, mine: false, ...overrides }
}

const REFRESH_OK: Handler = () => json(200, SESSION)
const POST = 'GET /api/posts/1'
const COMMENTS = 'GET /api/posts/1/comments'
const page = (items: Comment[], nextCursor: string | null = null) => json(200, { items, nextCursor })

/** IntersectionObserver の代わり。テストから「末尾が見えた」を起こせる。 */
let observers: { callback: IntersectionObserverCallback; disconnected: boolean }[] = []
class FakeIntersectionObserver {
  private readonly entry: (typeof observers)[number]
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, disconnected: false }
    observers.push(this.entry)
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.entry.disconnected = true
  }
}

/** 末尾を監視する側(useInfiniteScroll の effect)が登録されるのを待ってから、「末尾が見えた」を起こす。 */
async function reachEnd() {
  await waitFor(() => expect(observers.some((o) => !o.disconnected)).toBe(true))
  act(() => {
    for (const o of observers.filter((o) => !o.disconnected)) {
      o.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    }
  })
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
  observers = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  vi.stubGlobal('scrollTo', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('詳細画面の表示', () => {
  it('投稿とコメントを古い順に表示し、削除は自分のコメントにだけ出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => json(200, post({ commentCount: 2 })),
      [COMMENTS]: () => page([comment(1, '最初のコメント'), comment(2, '自分のコメント', { author: ME, mine: true })]),
    })

    renderAt('/posts/1')

    expect(await screen.findByText('詳細の投稿')).toBeInTheDocument()
    expect(await screen.findByText('最初のコメント')).toBeInTheDocument()
    const texts = screen.getAllByText(/のコメント$/).map((e) => e.textContent)
    expect(texts).toEqual(['最初のコメント', '自分のコメント'])
    expect(screen.getByLabelText('コメント 2 件')).toBeInTheDocument()

    const mine = screen.getByText('自分のコメント').closest('article')!
    expect(within(mine).getByRole('button', { name: '削除' })).toBeInTheDocument()
    const others = screen.getByText('最初のコメント').closest('article')!
    expect(within(others).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('コメントが無ければ、その旨を表示する', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => json(200, post()),
      [COMMENTS]: () => page([]),
    })

    renderAt('/posts/1')

    expect(await screen.findByText('まだコメントがありません')).toBeInTheDocument()
  })

  it('存在しない投稿なら、見つからない旨とタイムラインへの導線を出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => apiError(404, 'NOT_FOUND', '投稿が見つかりません'),
      [COMMENTS]: () => apiError(404, 'NOT_FOUND', '投稿が見つかりません'),
    })

    renderAt('/posts/1')

    expect(await screen.findByText('投稿が見つかりません')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'タイムラインへ戻る' })).toBeInTheDocument()
  })

  it('?focus=1 で開くと、コメント入力欄にフォーカスする', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => json(200, post()),
      [COMMENTS]: () => page([]),
    })

    renderAt('/posts/1?focus=1')

    const input = await screen.findByLabelText('コメントを書く')
    await waitFor(() => expect(input).toHaveFocus())
  })

  it('末尾が見えたら続きを読み込み、重複なく末尾に足す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => json(200, post({ commentCount: 3 })),
      [COMMENTS]: () => page([comment(1, 'コメントA'), comment(2, 'コメントB')], 'next'),
      'GET /api/posts/1/comments?cursor=next': () => page([comment(2, 'コメントB'), comment(3, 'コメントC')]),
    })

    renderAt('/posts/1')
    await screen.findByText('コメントB')
    await reachEnd()

    expect(await screen.findByText('コメントC')).toBeInTheDocument()
    expect(screen.getAllByText('コメントB')).toHaveLength(1)
  })
})

describe('コメントの投稿', () => {
  it('投稿すると末尾に追加され、コメント数が返ってきた値になり、入力欄が空になる', async () => {
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => json(200, post({ commentCount: 1 })),
      [COMMENTS]: () => page([comment(1, '既存のコメント')]),
      'POST /api/posts/1/comments': () =>
        json(201, { comment: comment(2, '新しいコメント', { author: ME, mine: true }), commentCount: 5 }),
    })
    const user = userEvent.setup()

    renderAt('/posts/1')
    await screen.findByText('既存のコメント')
    const input = screen.getByLabelText('コメントを書く')
    await user.type(input, '  新しいコメント  ')
    await user.click(screen.getByRole('button', { name: 'コメントする' }))

    expect(await screen.findByText('新しいコメント')).toBeInTheDocument()
    expect(screen.getByLabelText('コメント 5 件')).toBeInTheDocument()
    expect(input).toHaveValue('')
    expect(server.calls.find((c) => c.method === 'POST' && c.path.endsWith('/comments'))?.body).toEqual({
      body: '新しいコメント',
    })
  })

  it('続きが未取得のときは一覧に足さず、トーストで知らせる。続きを読むと並び順どおり入る', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => json(200, post({ commentCount: 2 })),
      [COMMENTS]: () => page([comment(1, 'コメントA')], 'next'),
      'GET /api/posts/1/comments?cursor=next': () =>
        page([comment(2, 'コメントB'), comment(3, '自分の新しいコメント', { author: ME, mine: true })]),
      'POST /api/posts/1/comments': () =>
        json(201, { comment: comment(3, '自分の新しいコメント', { author: ME, mine: true }), commentCount: 3 }),
    })
    const user = userEvent.setup()

    renderAt('/posts/1')
    await screen.findByText('コメントA')
    await user.type(screen.getByLabelText('コメントを書く'), '自分の新しいコメント')
    await user.click(screen.getByRole('button', { name: 'コメントする' }))

    expect(await screen.findByText('コメントしました。一覧の末尾に表示されます')).toBeInTheDocument()
    expect(screen.getByLabelText('コメント 3 件')).toBeInTheDocument()
    expect(screen.queryByText('自分の新しいコメント')).not.toBeInTheDocument()

    await reachEnd()
    expect(await screen.findByText('自分の新しいコメント')).toBeInTheDocument()
    expect(screen.getAllByText('自分の新しいコメント')).toHaveLength(1)
  })

  it('空白だけでは送れず、281 文字以上は送れない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => json(200, post()),
      [COMMENTS]: () => page([]),
    })
    const user = userEvent.setup()

    renderAt('/posts/1')
    const input = await screen.findByLabelText('コメントを書く')
    const submit = screen.getByRole('button', { name: 'コメントする' })
    expect(submit).toBeDisabled()

    await user.type(input, '   ')
    expect(submit).toBeDisabled()

    await user.clear(input)
    await user.click(input)
    await user.paste('あ'.repeat(281))
    expect(submit).toBeDisabled()
  })

  it('サーバーのエラーはフォームに出し、入力は残す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => json(200, post()),
      [COMMENTS]: () => page([]),
      'POST /api/posts/1/comments': () => apiError(500, 'INTERNAL_ERROR', '送信に失敗しました'),
    })
    const user = userEvent.setup()

    renderAt('/posts/1')
    const input = await screen.findByLabelText('コメントを書く')
    await user.type(input, '残るコメント')
    await user.click(screen.getByRole('button', { name: 'コメントする' }))

    expect(await screen.findByText('送信に失敗しました')).toBeInTheDocument()
    expect(input).toHaveValue('残るコメント')
  })

  it('送信時に投稿が削除されていたら、メッセージを出してタイムラインへ戻す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => json(200, post()),
      [COMMENTS]: () => page([]),
      'POST /api/posts/1/comments': () => apiError(404, 'NOT_FOUND', '投稿が見つかりません'),
      'GET /api/timeline?tab=following': () => json(200, { items: [], nextCursor: null }),
    })
    const user = userEvent.setup()

    renderAt('/posts/1')
    await user.type(await screen.findByLabelText('コメントを書く'), 'こんにちは')
    await user.click(screen.getByRole('button', { name: 'コメントする' }))

    expect(await screen.findByText('投稿が見つかりません')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'タイムライン' })).toBeInTheDocument()
  })
})

describe('コメントの削除', () => {
  it('確認して削除すると、一覧から消えてコメント数が返ってきた値になる', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => json(200, post({ commentCount: 2 })),
      [COMMENTS]: () => page([comment(1, '残るコメント'), comment(2, '消すコメント', { author: ME, mine: true })]),
      'DELETE /api/comments/2': () => json(200, { commentCount: 1 }),
    })
    const user = userEvent.setup()

    renderAt('/posts/1')
    const target = (await screen.findByText('消すコメント')).closest('article')!
    await user.click(within(target).getByRole('button', { name: '削除' }))

    await waitFor(() => expect(screen.queryByText('消すコメント')).not.toBeInTheDocument())
    expect(screen.getByText('残るコメント')).toBeInTheDocument()
    expect(screen.getByLabelText('コメント 1 件')).toBeInTheDocument()
    expect(server.count('DELETE /api/comments/2')).toBe(1)
  })

  it('確認でキャンセルすると、何もしない', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [POST]: () => json(200, post({ commentCount: 1 })),
      [COMMENTS]: () => page([comment(1, '消さないコメント', { author: ME, mine: true })]),
    })
    const user = userEvent.setup()

    renderAt('/posts/1')
    const target = (await screen.findByText('消さないコメント')).closest('article')!
    await user.click(within(target).getByRole('button', { name: '削除' }))

    expect(screen.getByText('消さないコメント')).toBeInTheDocument()
    expect(server.calls.some((c) => c.method === 'DELETE')).toBe(false)
  })
})

describe('タイムラインからの移動', () => {
  const FOLLOWING = 'GET /api/timeline?tab=following'

  it('カードを押すと詳細へ、💬 を押すと詳細へ移動する。いいねやボタンでは移動しない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => json(200, { items: [post({ author: ME, commentCount: 3 })], nextCursor: null }),
      [POST]: () => json(200, post({ author: ME, commentCount: 3 })),
      [COMMENTS]: () => page([comment(1, '詳細で見えるコメント')]),
      'PUT /api/posts/1/like': () => json(200, { likeCount: 1, likedByMe: true }),
    })
    const user = userEvent.setup()

    renderAt('/')
    await user.click(await screen.findByRole('button', { name: /^いいね/ }))
    // いいねでは移動しない
    expect(screen.getByRole('heading', { name: 'タイムライン' })).toBeInTheDocument()

    await user.click(screen.getByText('詳細の投稿'))
    expect(await screen.findByText('詳細で見えるコメント')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '投稿の詳細' })).toBeInTheDocument()
  })

  it('💬 のリンクは、コメント入力欄にフォーカスした詳細へ移動する', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => json(200, { items: [post({ author: ME, commentCount: 3 })], nextCursor: null }),
      [POST]: () => json(200, post({ author: ME, commentCount: 3 })),
      [COMMENTS]: () => page([]),
    })
    const user = userEvent.setup()

    renderAt('/')
    await user.click(await screen.findByRole('link', { name: 'コメント 3 件。コメントする' }))

    await waitFor(() => expect(screen.getByLabelText('コメントを書く')).toHaveFocus())
  })
})
