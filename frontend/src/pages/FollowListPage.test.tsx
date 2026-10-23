import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import type { UserProfile, UserSummary } from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import { tokenStore } from '../auth/tokenStore'
import { ToastProvider } from '../components/ToastProvider'
import { apiError, json, SESSION, stubFetch, type Handler } from '../test/fakeServer'

const REFRESH_OK: Handler = () => json(200, SESSION)

function summary(id: number, handle: string, overrides: Partial<UserSummary> = {}): UserSummary {
  return { id, handle, displayName: `${handle}さん`, followedByMe: false, isMe: false, ...overrides }
}

const page = (items: UserSummary[], nextCursor: string | null = null) => json(200, { items, nextCursor })

const FOLLOWING = 'GET /api/users/suzuki/following'
const FOLLOWERS = 'GET /api/users/suzuki/followers'

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

/** 末尾を監視する側が登録されるのを待ってから、「末尾が見えた」を起こす。 */
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

describe('一覧の表示', () => {
  it('フォロー中の一覧に、表示名・@ハンドル・自己紹介の 1 行目を出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([summary(2, 'tanaka', { bio: '一行目\n二行目' }), summary(3, 'sato')]),
    })

    renderAt('/users/suzuki/following')

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('tanakaさん')).toBeInTheDocument()
    expect(within(rows[0]).getByText('@tanaka')).toBeInTheDocument()
    expect(within(rows[0]).getByText('一行目')).toBeInTheDocument()
    expect(screen.queryByText(/二行目/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'フォロー中' })).toHaveAttribute('aria-current', 'page')
  })

  it('タブを押すと、フォロワーの一覧に切り替わる', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([summary(2, 'tanaka')]),
      [FOLLOWERS]: () => page([summary(3, 'sato')]),
    })

    renderAt('/users/suzuki/following')
    await screen.findByText('tanakaさん')
    await userEvent.click(screen.getByRole('link', { name: 'フォロワー' }))

    expect(await screen.findByText('satoさん')).toBeInTheDocument()
    expect(screen.queryByText('tanakaさん')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'フォロワー' })).toHaveAttribute('aria-current', 'page')
  })

  it('0 人のときは、タブごとの空状態を出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([]),
      [FOLLOWERS]: () => page([]),
    })

    renderAt('/users/suzuki/following')
    expect(await screen.findByText('まだフォローしていません')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'フォロワー' }))
    expect(await screen.findByText('まだフォロワーがいません')).toBeInTheDocument()
  })

  it('存在しないハンドルでは「ユーザーが見つかりません」を出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/users/nobody/following': () => apiError(404, 'NOT_FOUND', 'ユーザーが見つかりません'),
    })

    renderAt('/users/nobody/following')

    expect(await screen.findByText('ユーザーが見つかりません')).toBeInTheDocument()
  })

  it('取得に失敗したら、再読み込みで取り直せる', async () => {
    let fail = true
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => (fail ? apiError(500, 'INTERNAL', 'error') : page([summary(2, 'tanaka')])),
    })

    renderAt('/users/suzuki/following')
    const retry = await screen.findByRole('button', { name: '再読み込み' })
    fail = false
    await userEvent.click(retry)

    expect(await screen.findByText('tanakaさん')).toBeInTheDocument()
  })

  it('末尾までスクロールすると、続きを重複なく読み込む', async () => {
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([summary(2, 'tanaka')], 'c1'),
      [`${FOLLOWING}?cursor=c1`]: () => page([summary(2, 'tanaka'), summary(3, 'sato')]),
    })

    renderAt('/users/suzuki/following')
    await screen.findByText('tanakaさん')
    await reachEnd()

    expect(await screen.findByText('satoさん')).toBeInTheDocument()
    expect(screen.getAllByText('tanakaさん')).toHaveLength(1)
    expect(count(`${FOLLOWING}?cursor=c1`)).toBe(1)
  })
})

describe('行からのフォロー', () => {
  const FOLLOW = 'PUT /api/users/tanaka/follow'
  const UNFOLLOW = 'DELETE /api/users/tanaka/follow'

  it('自分の行には、フォローボタンを出さない', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWERS]: () => page([summary(1, 'tamura', { displayName: '田村', isMe: true }), summary(2, 'tanaka')]),
    })

    renderAt('/users/suzuki/followers')

    await screen.findByText('tanakaさん')
    expect(screen.getAllByRole('button')).toHaveLength(2) // ヘッダーのログアウト + tanaka の行
    expect(screen.queryByRole('button', { name: /田村/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tanakaさんをフォロー' })).toBeInTheDocument()
  })

  it('「フォロー」を押すと、その行だけ「フォロー中」に変わり、一覧は取り直さない', async () => {
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWERS]: () => page([summary(2, 'tanaka'), summary(3, 'sato')]),
      [FOLLOW]: () => json(200, { followedByMe: true, followerCount: 1 }),
    })

    renderAt('/users/suzuki/followers')
    await userEvent.click(await screen.findByRole('button', { name: 'tanakaさんをフォロー' }))

    expect(await screen.findByRole('button', { name: 'tanakaさんをフォロー解除' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'satoさんをフォロー' })).toHaveAttribute('aria-pressed', 'false')
    expect(count(FOLLOW)).toBe(1)
    expect(count(FOLLOWERS)).toBe(1)
  })

  it('「フォロー中」を押すと、その行が「フォロー」に戻る', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([summary(2, 'tanaka', { followedByMe: true })]),
      [UNFOLLOW]: () => json(200, { followedByMe: false, followerCount: 0 }),
    })

    renderAt('/users/suzuki/following')
    await userEvent.click(await screen.findByRole('button', { name: 'tanakaさんをフォロー解除' }))

    expect(await screen.findByRole('button', { name: 'tanakaさんをフォロー' })).toHaveAttribute('aria-pressed', 'false')
    // 解除しても、その行は一覧に残る(表示を更新するだけ)
    expect(screen.getByText('tanakaさん')).toBeInTheDocument()
  })

  it('失敗したら、元の表示に戻してメッセージを出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWERS]: () => page([summary(2, 'tanaka')]),
      [FOLLOW]: () => apiError(500, 'INTERNAL', 'error'),
    })

    renderAt('/users/suzuki/followers')
    await userEvent.click(await screen.findByRole('button', { name: 'tanakaさんをフォロー' }))

    expect(await screen.findByText('フォローの操作に失敗しました')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tanakaさんをフォロー' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('プロフィールからの導線', () => {
  it('フォロー数・フォロワー数を押すと、その一覧へ移動する', async () => {
    const profile: UserProfile = {
      id: 5,
      handle: 'suzuki',
      displayName: '鈴木',
      followingCount: 1,
      followerCount: 2,
      followedByMe: false,
      isMe: false,
    }
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/users/suzuki': () => json(200, profile),
      'GET /api/users/suzuki/posts': () => json(200, { items: [], nextCursor: null }),
      [FOLLOWING]: () => page([summary(2, 'tanaka')]),
      [FOLLOWERS]: () => page([summary(3, 'sato')]),
    })

    renderAt('/users/suzuki')
    await userEvent.click(await screen.findByRole('link', { name: /フォロワー/ }))

    expect(await screen.findByText('satoさん')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'フォロワー' })).toHaveAttribute('aria-current', 'page')
  })
})
