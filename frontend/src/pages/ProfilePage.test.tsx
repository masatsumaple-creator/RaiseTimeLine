import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import type { Post, UserProfile } from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import { tokenStore } from '../auth/tokenStore'
import { ToastProvider } from '../components/ToastProvider'
import { apiError, json, SESSION, stubFetch, type Handler } from '../test/fakeServer'

const ME = SESSION.user
const OTHER = { id: 2, handle: 'suzuki', displayName: '鈴木' }

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...OTHER, followingCount: 0, followerCount: 0, followedByMe: false, isMe: false, ...overrides }
}

function post(id: number, body: string, overrides: Partial<Post> = {}): Post {
  return { id, body, createdAt: new Date().toISOString(), editedAt: null, author: OTHER, likeCount: 0, likedByMe: false, commentCount: 0, images: [], ...overrides }
}

const page = (items: Post[], nextCursor: string | null = null) => json(200, { items, nextCursor })
const REFRESH_OK: Handler = () => json(200, SESSION)

const PROFILE = 'GET /api/users/suzuki'
const POSTS = 'GET /api/users/suzuki/posts'

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

describe('プロフィールの表示', () => {
  it('表示名・ハンドル・自己紹介と、そのユーザーの投稿を表示する', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [PROFILE]: () => json(200, profile({ bio: 'よろしく\n釣りが好きです' })),
      [POSTS]: () => page([post(2, '二つ目'), post(1, '一つ目')]),
    })

    renderAt('/users/suzuki')

    expect(await screen.findByRole('heading', { name: '鈴木' })).toBeInTheDocument()
    const header = screen.getByRole('heading', { name: '鈴木' }).closest('section')!
    expect(within(header).getByText('@suzuki')).toBeInTheDocument()
    expect(screen.getByText(/釣りが好きです/)).toBeInTheDocument()
    expect(await screen.findByText('二つ目')).toBeInTheDocument()
    expect(screen.getByText('一つ目')).toBeInTheDocument()
  })

  it('自己紹介が無いときは出さない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [PROFILE]: () => json(200, profile()),
      [POSTS]: () => page([]),
    })

    renderAt('/users/suzuki')

    expect(await screen.findByRole('heading', { name: '鈴木' })).toBeInTheDocument()
    expect(document.querySelector('.profile-bio')).toBeNull()
  })

  it('投稿が 0 件のときは空状態を表示する', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [PROFILE]: () => json(200, profile()),
      [POSTS]: () => page([]),
    })

    renderAt('/users/suzuki')

    expect(await screen.findByText('まだ投稿がありません')).toBeInTheDocument()
  })

  it('存在しないハンドルでは「ユーザーが見つかりません」を表示する', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/users/nobody': () => apiError(404, 'NOT_FOUND', 'ユーザーが見つかりません'),
      'GET /api/users/nobody/posts': () => apiError(404, 'NOT_FOUND', 'ユーザーが見つかりません'),
    })

    renderAt('/users/nobody')

    expect(await screen.findByText('ユーザーが見つかりません')).toBeInTheDocument()
  })

  it('取得に失敗したら、再読み込みで取り直せる', async () => {
    let fail = true
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [PROFILE]: () => (fail ? apiError(500, 'INTERNAL', 'error') : json(200, profile())),
      [POSTS]: () => page([]),
    })

    renderAt('/users/suzuki')

    const retry = await screen.findByRole('button', { name: '再読み込み' })
    fail = false
    await userEvent.click(retry)

    expect(await screen.findByRole('heading', { name: '鈴木' })).toBeInTheDocument()
  })

  it('末尾までスクロールすると、続きを重複なく読み込む', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [PROFILE]: () => json(200, profile()),
      [POSTS]: () => page([post(2, '新しい投稿')], 'c1'),
      'GET /api/users/suzuki/posts?cursor=c1': () => page([post(2, '新しい投稿'), post(1, '古い投稿')]),
    })

    renderAt('/users/suzuki')
    await screen.findByText('新しい投稿')
    await reachEnd()

    expect(await screen.findByText('古い投稿')).toBeInTheDocument()
    expect(screen.getAllByText('新しい投稿')).toHaveLength(1)
    expect(calls.filter((c) => c.path.startsWith(POSTS.slice(4)))).toHaveLength(2)
  })

  it('自分のプロフィールの投稿には、編集・削除ボタンが出る', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/users/tamura': () => json(200, profile({ ...ME, isMe: true })),
      'GET /api/users/tamura/posts': () => page([post(1, '自分の投稿', { author: ME })]),
    })

    renderAt('/users/tamura')

    expect(await screen.findByText('自分の投稿')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument()
  })
})

describe('プロフィールへの導線', () => {
  it('投稿カードの表示名を押すと、その人のプロフィールへ移動する', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/timeline?tab=following': () => page([post(1, '他人の投稿')]),
      [PROFILE]: () => json(200, profile()),
      [POSTS]: () => page([post(1, '他人の投稿')]),
    })

    renderAt('/')
    await screen.findByText('他人の投稿')
    await userEvent.click(screen.getByRole('link', { name: '鈴木' }))

    expect(await screen.findByRole('heading', { name: '鈴木' })).toBeInTheDocument()
  })

  it('ヘッダーの自分の名前から、自分のプロフィールへ移動する', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/timeline?tab=following': () => page([]),
      'GET /api/users/tamura': () => json(200, profile({ ...ME, isMe: true })),
      'GET /api/users/tamura/posts': () => page([]),
    })

    renderAt('/')
    const link = await screen.findByRole('link', { name: /田村/ })
    await userEvent.click(link)

    await waitFor(() => expect(screen.getByRole('heading', { name: '田村' })).toBeInTheDocument())
  })
})

describe('フォロー', () => {
  const FOLLOW = 'PUT /api/users/suzuki/follow'
  const UNFOLLOW = 'DELETE /api/users/suzuki/follow'

  function stubProfile(overrides: Partial<UserProfile>, extra: Record<string, Handler> = {}) {
    return stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [PROFILE]: () => json(200, profile(overrides)),
      [POSTS]: () => page([]),
      ...extra,
    })
  }

  it('フォロー数・フォロワー数を表示する', async () => {
    stubProfile({ followingCount: 3, followerCount: 12 })

    renderAt('/users/suzuki')

    expect(await screen.findByText('フォロー中', { selector: '.profile-counts a' })).toHaveTextContent('3 フォロー中')
    expect(screen.getByText('フォロワー', { selector: '.profile-counts a' })).toHaveTextContent('12 フォロワー')
  })

  it('「フォロー」を押すと、先に「フォロー中」に変わり、サーバーの値でフォロワー数を上書きする', async () => {
    let release: (r: Response) => void = () => {}
    const { count } = stubProfile(
      { followerCount: 5 },
      { [FOLLOW]: () => new Promise<Response>((resolve) => (release = resolve)) },
    )

    renderAt('/users/suzuki')
    await userEvent.click(await screen.findByRole('button', { name: 'フォロー' }))

    // サーバーの応答前に、画面が先に変わる
    expect(screen.getByRole('button', { name: 'フォロー中' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('フォロワー', { selector: '.profile-counts a' })).toHaveTextContent('6 フォロワー')

    // 別の人も同時にフォローしていた場合は、サーバーの値が正
    await act(async () => release(json(200, { followedByMe: true, followerCount: 8 })))
    expect(screen.getByText('フォロワー', { selector: '.profile-counts a' })).toHaveTextContent('8 フォロワー')
    expect(count(FOLLOW)).toBe(1)
  })

  it('「フォロー中」を押すと解除し、フォロワー数が 1 減る', async () => {
    stubProfile(
      { followedByMe: true, followerCount: 5 },
      { [UNFOLLOW]: () => json(200, { followedByMe: false, followerCount: 4 }) },
    )

    renderAt('/users/suzuki')
    await userEvent.click(await screen.findByRole('button', { name: 'フォロー中' }))

    expect(await screen.findByRole('button', { name: 'フォロー' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('フォロワー', { selector: '.profile-counts a' })).toHaveTextContent('4 フォロワー')
  })

  it('失敗したら元の状態に戻し、メッセージを出す', async () => {
    stubProfile({ followerCount: 5 }, { [FOLLOW]: () => apiError(500, 'INTERNAL', 'error') })

    renderAt('/users/suzuki')
    await userEvent.click(await screen.findByRole('button', { name: 'フォロー' }))

    expect(await screen.findByText('フォローの操作に失敗しました')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'フォロー' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('フォロワー', { selector: '.profile-counts a' })).toHaveTextContent('5 フォロワー')
  })

  it('連打したときは、最後に押した操作の結果を正とする', async () => {
    const resolvers: ((r: Response) => void)[] = []
    stubProfile(
      { followerCount: 5 },
      {
        [FOLLOW]: () => new Promise<Response>((resolve) => resolvers.push(resolve)),
        [UNFOLLOW]: () => new Promise<Response>((resolve) => resolvers.push(resolve)),
      },
    )

    renderAt('/users/suzuki')
    await userEvent.click(await screen.findByRole('button', { name: 'フォロー' }))
    await userEvent.click(screen.getByRole('button', { name: 'フォロー中' }))

    // 先に押した「フォロー」の結果が後から届いても、最後の「解除」の表示を上書きしない
    await act(async () => {
      resolvers[0](json(200, { followedByMe: true, followerCount: 6 }))
      resolvers[1](json(200, { followedByMe: false, followerCount: 5 }))
    })
    expect(screen.getByRole('button', { name: 'フォロー' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('フォロワー', { selector: '.profile-counts a' })).toHaveTextContent('5 フォロワー')
  })

  it('自分のプロフィールには、フォローボタンを出さない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/users/tamura': () => json(200, profile({ ...ME, isMe: true })),
      'GET /api/users/tamura/posts': () => page([]),
    })

    renderAt('/users/tamura')

    expect(await screen.findByRole('heading', { name: '田村' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^フォロー/ })).not.toBeInTheDocument()
  })
})

describe('「フォロー中」タブが空のとき', () => {
  it('案内を出し、「全体」へ切り替えられる', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/timeline?tab=following': () => page([]),
      'GET /api/timeline?tab=all': () => page([post(1, '他人の投稿')]),
    })

    renderAt('/')
    await userEvent.click(await screen.findByRole('button', { name: '「全体」で探す' }))

    expect(await screen.findByText('他人の投稿')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '全体' })).toHaveAttribute('aria-selected', 'true')
  })

  it('「ユーザーを検索」から、ユーザー検索の画面へ移動できる', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/timeline?tab=following': () => page([]),
    })

    renderAt('/')
    await userEvent.click(await screen.findByRole('link', { name: 'ユーザーを検索' }))

    expect(await screen.findByRole('searchbox', { name: 'ユーザーを検索' })).toBeInTheDocument()
  })

  it('「全体」タブが空のときは、案内だけで、検索へのリンクは出さない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/timeline?tab=following': () => page([]),
      'GET /api/timeline?tab=all': () => page([]),
    })

    renderAt('/')
    await userEvent.click(await screen.findByRole('tab', { name: '全体' }))

    expect(await screen.findByText('まだ投稿がありません。')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'ユーザーを検索' })).not.toBeInTheDocument()
  })

  it('フォロー中の投稿があるときは、案内も、検索へのリンクも出さない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/timeline?tab=following': () => page([post(1, '投稿がある')]),
    })

    renderAt('/')

    expect(await screen.findByText('投稿がある')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'ユーザーを検索' })).not.toBeInTheDocument()
  })
})
