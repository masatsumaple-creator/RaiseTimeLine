import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import type { UserSummary } from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import { tokenStore } from '../auth/tokenStore'
import { ToastProvider } from '../components/ToastProvider'
import { apiError, json, SESSION, stubFetch, type Handler } from '../test/fakeServer'

const REFRESH_OK: Handler = () => json(200, SESSION)

function summary(id: number, handle: string, overrides: Partial<UserSummary> = {}): UserSummary {
  return { id, handle, displayName: `${handle}さん`, followedByMe: false, isMe: false, ...overrides }
}

const page = (items: UserSummary[], nextCursor: string | null = null) => json(200, { items, nextCursor })
const SEARCH = 'GET /api/search/users?q='

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

/** 検索のリクエスト(q の値)を、送られた順に返す。 */
function searched(calls: { method: string; path: string }[]): string[] {
  return calls
    .filter((c) => c.path.startsWith('/api/search/users?q='))
    .map((c) => decodeURIComponent(c.path.slice('/api/search/users?q='.length).split('&')[0]))
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

describe('検索の開始', () => {
  it('入力を止めて少し待つと検索を始める。素早く入力しても、最後の入力だけを送る', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [`${SEARCH}tan`]: () => page([summary(2, 'tanaka')]),
    })

    renderAt('/search')
    await userEvent.type(await screen.findByRole('searchbox', { name: 'ユーザーを検索' }), 'tan')

    expect(await screen.findByText('tanakaさん')).toBeInTheDocument()
    expect(searched(calls)).toEqual(['tan'])
  })

  it('Enter を押すと、待たずにすぐ検索する', async () => {
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [`${SEARCH}tan`]: () => page([summary(2, 'tanaka')]),
    })

    renderAt('/search')
    await userEvent.type(await screen.findByRole('searchbox'), 'tan{Enter}')

    // 300ms の待ちより前に、リクエストが送られている
    await waitFor(() => expect(count(`${SEARCH}tan`)).toBe(1), { timeout: 200 })
    expect(await screen.findByText('tanakaさん')).toBeInTheDocument()
  })

  it('先頭の @ と前後の空白を取り除いて検索する(@tan と tan は同じ)', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [`${SEARCH}tan`]: () => page([summary(2, 'tanaka')]),
    })

    renderAt('/search')
    await userEvent.type(await screen.findByRole('searchbox'), '  @tan {Enter}')

    expect(await screen.findByText('tanakaさん')).toBeInTheDocument()
    expect(searched(calls)).toEqual(['tan'])
  })

  it('空・空白だけ・@ だけのときは検索せず、案内を出す', async () => {
    const { calls } = stubFetch({ 'POST /api/auth/refresh': REFRESH_OK })

    renderAt('/search')
    expect(await screen.findByText('ハンドルか表示名の一部を入力して、ユーザーを探しましょう。')).toBeInTheDocument()

    await userEvent.type(screen.getByRole('searchbox'), '  @ {Enter}')
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(searched(calls)).toEqual([])
    expect(screen.getByText('ハンドルか表示名の一部を入力して、ユーザーを探しましょう。')).toBeInTheDocument()
  })

  it('51 文字以上は検索せず、エラーを出す(50 文字ちょうどは検索する)', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [`${SEARCH}${'a'.repeat(50)}`]: () => page([]),
    })

    renderAt('/search')
    const box = await screen.findByRole('searchbox')

    await userEvent.type(box, 'a'.repeat(51))
    expect(await screen.findByRole('alert')).toHaveTextContent('50 文字以内で入力してください')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(searched(calls)).toEqual([])

    await userEvent.type(box, '{Backspace}')
    expect(await screen.findByText('見つかりませんでした')).toBeInTheDocument()
    expect(searched(calls)).toEqual(['a'.repeat(50)])
  })

  it('URL の ?q= から検索語を復元して検索する', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [`${SEARCH}${encodeURIComponent('田中')}`]: () => page([summary(2, 'tanaka')]),
    })

    renderAt(`/search?q=${encodeURIComponent('田中')}`)

    expect(await screen.findByText('tanakaさん')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('田中')
  })

  it('ヘッダーの「ユーザー検索」から、検索画面へ移動できる', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      'GET /api/timeline?tab=following': () => page([]),
    })

    renderAt('/')
    await userEvent.click(await screen.findByRole('link', { name: 'ユーザー検索' }))

    expect(await screen.findByRole('searchbox')).toBeInTheDocument()
  })
})

describe('結果の表示', () => {
  it('0 件のときは「見つかりませんでした」を出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [`${SEARCH}zzz`]: () => page([]),
    })

    renderAt('/search?q=zzz')

    expect(await screen.findByText('見つかりませんでした')).toBeInTheDocument()
  })

  it('取得に失敗したら、再読み込みで取り直せる', async () => {
    let fail = true
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [`${SEARCH}tan`]: () => (fail ? apiError(500, 'INTERNAL', 'error') : page([summary(2, 'tanaka')])),
    })

    renderAt('/search?q=tan')
    const retry = await screen.findByRole('button', { name: '再読み込み' })
    fail = false
    await userEvent.click(retry)

    expect(await screen.findByText('tanakaさん')).toBeInTheDocument()
  })

  it('遅れて届いた古い検索の結果で、新しい結果を上書きしない', async () => {
    const resolvers: Record<string, (r: Response) => void> = {}
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [`${SEARCH}ta`]: () => new Promise<Response>((resolve) => (resolvers.ta = resolve)),
      [`${SEARCH}tan`]: () => new Promise<Response>((resolve) => (resolvers.tan = resolve)),
    })

    renderAt('/search')
    const box = await screen.findByRole('searchbox')
    await userEvent.type(box, 'ta{Enter}')
    await waitFor(() => expect(resolvers.ta).toBeDefined())
    await userEvent.type(box, 'n{Enter}')
    await waitFor(() => expect(resolvers.tan).toBeDefined())

    // 新しい検索(tan)の結果が先に届き、そのあとに古い検索(ta)の結果が届く
    await act(async () => {
      resolvers.tan(page([summary(2, 'tanaka')]))
    })
    await act(async () => {
      resolvers.ta(page([summary(3, 'tada')]))
    })

    expect(await screen.findByText('tanakaさん')).toBeInTheDocument()
    expect(screen.queryByText('tadaさん')).not.toBeInTheDocument()
  })

  it('末尾までスクロールすると、続きを重複なく読み込む', async () => {
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [`${SEARCH}tan`]: () => page([summary(2, 'tanaka')], 'c1'),
      [`${SEARCH}tan&cursor=c1`]: () => page([summary(2, 'tanaka'), summary(3, 'tanabe')]),
    })

    renderAt('/search?q=tan')
    await screen.findByText('tanakaさん')
    await reachEnd()

    expect(await screen.findByText('tanabeさん')).toBeInTheDocument()
    expect(screen.getAllByText('tanakaさん')).toHaveLength(1)
    expect(count(`${SEARCH}tan&cursor=c1`)).toBe(1)
  })
})

describe('結果の行からのフォロー', () => {
  it('その行だけ「フォロー中」に変わり、一覧は取り直さない。自分の行にはボタンを出さない', async () => {
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [`${SEARCH}ta`]: () =>
        page([summary(1, 'tamura', { displayName: '田村', isMe: true }), summary(2, 'tanaka'), summary(3, 'tada')]),
      'PUT /api/users/tanaka/follow': () => json(200, { followedByMe: true, followerCount: 1 }),
    })

    renderAt('/search?q=ta')
    await userEvent.click(await screen.findByRole('button', { name: 'tanakaさんをフォロー' }))

    expect(await screen.findByRole('button', { name: 'tanakaさんをフォロー解除' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'tadaさんをフォロー' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: /田村/ })).not.toBeInTheDocument()
    expect(count(`${SEARCH}ta`)).toBe(1)
  })
})
