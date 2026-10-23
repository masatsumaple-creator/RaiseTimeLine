import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import type { Post } from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import { tokenStore } from '../auth/tokenStore'
import { ToastProvider } from '../components/ToastProvider'
import { POLL_INTERVAL_MS } from '../hooks/useNewPostsPolling'
import { apiError, json, noContent, SESSION, stubFetch, type Handler } from '../test/fakeServer'

const ME = SESSION.user
const OTHER = { id: 2, handle: 'suzuki', displayName: '鈴木' }

function post(id: number, body: string, overrides: Partial<Post> = {}): Post {
  return { id, body, createdAt: new Date().toISOString(), editedAt: null, author: ME, likeCount: 0, likedByMe: false, ...overrides }
}

const page = (items: Post[], nextCursor: string | null = null) => json(200, { items, nextCursor })
const REFRESH_OK: Handler = () => json(200, SESSION)

const FOLLOWING = 'GET /api/timeline?tab=following'
const ALL = 'GET /api/timeline?tab=all'

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

function reachEnd() {
  act(() => {
    for (const o of observers.filter((o) => !o.disconnected)) {
      o.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    }
  })
}

function renderTimeline() {
  return render(
    <MemoryRouter initialEntries={['/']}>
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
  vi.useRealTimers()
})

describe('一覧の表示', () => {
  it('投稿を新しい順に表示し、編集・削除は自分の投稿にだけ出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(2, '自分の投稿', { editedAt: new Date().toISOString() }), post(1, '他人の投稿', { author: OTHER })]),
    })

    renderTimeline()

    const mine = (await screen.findByText('自分の投稿')).closest('article')!
    expect(within(mine).getByText('(編集済み)')).toBeInTheDocument()
    expect(within(mine).getByRole('button', { name: '編集' })).toBeInTheDocument()
    expect(within(mine).getByRole('button', { name: '削除' })).toBeInTheDocument()

    const others = screen.getByText('他人の投稿').closest('article')!
    expect(within(others).getByText('@suzuki')).toBeInTheDocument()
    expect(within(others).queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
    expect(within(others).queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('取得に失敗したら、エラーと再読み込みボタンを出す', async () => {
    let calls = 0
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => {
        if (++calls === 1) throw new TypeError('Failed to fetch')
        return page([post(1, '復旧した')])
      },
    })
    const user = userEvent.setup()

    renderTimeline()
    await user.click(await screen.findByRole('button', { name: '再読み込み' }))

    expect(await screen.findByText('復旧した')).toBeInTheDocument()
  })

  it('タブを切り替えると、そのタブの一覧を読み込む', async () => {
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(1, '自分だけ')]),
      [ALL]: () => page([post(2, 'みんなの投稿', { author: OTHER }), post(1, '自分だけ')]),
    })
    const user = userEvent.setup()

    renderTimeline()
    await screen.findByText('自分だけ')
    await user.click(screen.getByRole('tab', { name: '全体' }))

    expect(await screen.findByText('みんなの投稿')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '全体' })).toHaveAttribute('aria-selected', 'true')
    expect(server.count(ALL)).toBe(1)
  })

  it('表示中のタブをもう一度押すと、最新の状態に更新する', async () => {
    let calls = 0
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page(++calls === 1 ? [post(1, '古い一覧')] : [post(2, '新しい投稿'), post(1, '古い一覧')]),
    })
    const user = userEvent.setup()

    renderTimeline()
    await screen.findByText('古い一覧')
    await user.click(screen.getByRole('tab', { name: 'フォロー中' }))

    expect(await screen.findByText('新しい投稿')).toBeInTheDocument()
    expect(server.count(FOLLOWING)).toBe(2)
  })
})

describe('投稿の作成', () => {
  it('投稿すると、再読み込みなしで一覧の先頭に表示され、入力欄が空になる', async () => {
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(1, '既存の投稿')]),
      'POST /api/posts': () => json(201, post(2, 'こんにちは')),
    })
    const user = userEvent.setup()

    renderTimeline()
    await screen.findByText('既存の投稿')
    const submit = screen.getByRole('button', { name: '投稿する' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('いまどうしてる?'), '  こんにちは  ')
    expect(submit).toBeEnabled()
    await user.click(submit)

    const articles = await screen.findAllByRole('article')
    expect(articles[0]).toHaveTextContent('こんにちは')
    expect(articles[1]).toHaveTextContent('既存の投稿')
    expect(screen.getByLabelText('いまどうしてる?')).toHaveValue('')
    expect(server.calls.find((c) => c.path === '/api/posts')?.body).toEqual({ body: 'こんにちは' })
    expect(server.count(FOLLOWING)).toBe(1)
  })

  it('280 文字を超えると、残り文字数が負になり投稿できない', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [FOLLOWING]: () => page([]) })

    renderTimeline()
    const textarea = await screen.findByLabelText('いまどうしてる?')
    fireEvent.change(textarea, { target: { value: 'あ'.repeat(281) } })

    expect(screen.getByText('残り -1 文字')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '投稿する' })).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'あ'.repeat(280) } })
    expect(screen.getByText('残り 0 文字')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '投稿する' })).toBeEnabled()
  })

  it('サーバーのエラーはフォームに出し、入力は残す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([]),
      'POST /api/posts': () => apiError(400, 'VALIDATION_ERROR', 'x', { body: 'サーバー側の本文エラー' }),
    })
    const user = userEvent.setup()

    renderTimeline()
    await user.type(await screen.findByLabelText('いまどうしてる?'), 'あ')
    await user.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByText('サーバー側の本文エラー')).toBeInTheDocument()
    expect(screen.getByLabelText('いまどうしてる?')).toHaveValue('あ')
  })
})

describe('投稿の編集', () => {
  it('編集して保存すると、本文が変わり「編集済み」になる', async () => {
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(1, '変更前')]),
      'PUT /api/posts/1': () => json(200, post(1, '変更後', { editedAt: new Date().toISOString() })),
    })
    const user = userEvent.setup()

    renderTimeline()
    await user.click(await screen.findByRole('button', { name: '編集' }))
    const textarea = screen.getByLabelText('投稿を編集')
    expect(textarea).toHaveValue('変更前')
    await user.clear(textarea)
    await user.type(textarea, '変更後')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('変更後')).toBeInTheDocument()
    expect(screen.getByText('(編集済み)')).toBeInTheDocument()
    expect(screen.queryByLabelText('投稿を編集')).not.toBeInTheDocument()
    expect(server.calls.find((c) => c.method === 'PUT')?.body).toEqual({ body: '変更後' })
  })

  it('キャンセルすると、変更を捨てて元の本文に戻る', async () => {
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(1, '変更前')]),
    })
    const user = userEvent.setup()

    renderTimeline()
    await user.click(await screen.findByRole('button', { name: '編集' }))
    await user.type(screen.getByLabelText('投稿を編集'), '追記')
    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.getByText('変更前')).toBeInTheDocument()
    expect(server.calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('編集中に投稿が削除されていたら、一覧から取り除く', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(1, '消える投稿')]),
      'PUT /api/posts/1': () => apiError(404, 'NOT_FOUND', '投稿が見つかりません'),
    })
    const user = userEvent.setup()

    renderTimeline()
    await user.click(await screen.findByRole('button', { name: '編集' }))
    await user.type(screen.getByLabelText('投稿を編集'), '追記')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('投稿が見つかりません')).toBeInTheDocument()
    expect(screen.queryByText(/消える投稿/)).not.toBeInTheDocument()
  })
})

describe('投稿の削除', () => {
  it('確認して削除すると、一覧から消える', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(2, '残る投稿'), post(1, '消す投稿')]),
      'DELETE /api/posts/1': () => noContent(),
    })
    const user = userEvent.setup()

    renderTimeline()
    const target = (await screen.findByText('消す投稿')).closest('article')!
    await user.click(within(target).getByRole('button', { name: '削除' }))

    expect(await screen.findByText('投稿を削除しました')).toBeInTheDocument()
    expect(screen.queryByText('消す投稿')).not.toBeInTheDocument()
    expect(screen.getByText('残る投稿')).toBeInTheDocument()
    expect(server.count('DELETE /api/posts/1')).toBe(1)
  })

  it('確認でキャンセルすると、何もしない', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(1, '消さない投稿')]),
    })
    const user = userEvent.setup()

    renderTimeline()
    await user.click(await screen.findByRole('button', { name: '削除' }))

    expect(screen.getByText('消さない投稿')).toBeInTheDocument()
    expect(server.calls.some((c) => c.method === 'DELETE')).toBe(false)
  })
})

describe('いいね', () => {
  it('押すとすぐに件数が増え、サーバーの結果で確定する。もう一度押すと取り消す', async () => {
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(1, '対象の投稿', { likeCount: 3 })]),
      'PUT /api/posts/1/like': () => json(200, { likeCount: 5, likedByMe: true }),
      'DELETE /api/posts/1/like': () => json(200, { likeCount: 4, likedByMe: false }),
    })
    const user = userEvent.setup()

    renderTimeline()
    const button = await screen.findByRole('button', { name: 'いいね' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveTextContent('3')

    await user.click(button)
    // 他のユーザーの分も含めた、サーバーの件数で上書きされる
    await waitFor(() => expect(button).toHaveTextContent('5'))
    expect(button).toHaveAttribute('aria-pressed', 'true')

    await user.click(button)
    await waitFor(() => expect(button).toHaveTextContent('4'))
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(server.count('PUT /api/posts/1/like')).toBe(1)
    expect(server.count('DELETE /api/posts/1/like')).toBe(1)
  })

  it('失敗したら元に戻してエラーを出す', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(1, '対象の投稿', { likeCount: 3 })]),
      'PUT /api/posts/1/like': () => apiError(500, 'INTERNAL_ERROR', 'error'),
    })
    const user = userEvent.setup()

    renderTimeline()
    const button = await screen.findByRole('button', { name: 'いいね' })
    await user.click(button)

    expect(await screen.findByText('いいねに失敗しました')).toBeInTheDocument()
    expect(button).toHaveTextContent('3')
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('投稿が削除されていたら、一覧から取り除く', async () => {
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(1, '消えた投稿')]),
      'PUT /api/posts/1/like': () => apiError(404, 'NOT_FOUND', '投稿が見つかりません'),
    })
    const user = userEvent.setup()

    renderTimeline()
    await user.click(await screen.findByRole('button', { name: 'いいね' }))

    await waitFor(() => expect(screen.queryByText('消えた投稿')).not.toBeInTheDocument())
  })
})

describe('無限スクロール', () => {
  it('末尾が見えたら続きを読み込んで末尾に足し、最後のページなら読み込みを止める', async () => {
    const server = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(3, '3番目'), post(2, '2番目')], 'cursor-1'),
      [`${FOLLOWING}&cursor=cursor-1`]: () => page([post(1, '1番目')]),
    })

    renderTimeline()
    await screen.findByText('2番目')
    expect(server.count(`${FOLLOWING}&cursor=cursor-1`)).toBe(0)

    reachEnd()

    expect(await screen.findByText('1番目')).toBeInTheDocument()
    expect(screen.getAllByRole('article').map((a) => a.textContent)).toEqual([
      expect.stringContaining('3番目'),
      expect.stringContaining('2番目'),
      expect.stringContaining('1番目'),
    ])
    // 最後のページまで読んだので、これ以上は監視しない
    expect(observers.filter((o) => !o.disconnected)).toHaveLength(0)
    expect(server.count(`${FOLLOWING}&cursor=cursor-1`)).toBe(1)
  })

  it('続きの取得に失敗したら再試行ボタンを出す', async () => {
    let calls = 0
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(2, '2番目')], 'cursor-1'),
      [`${FOLLOWING}&cursor=cursor-1`]: () => {
        if (++calls === 1) throw new TypeError('Failed to fetch')
        return page([post(1, '1番目')])
      },
    })
    const user = userEvent.setup()

    renderTimeline()
    await screen.findByText('2番目')
    reachEnd()
    await user.click(await screen.findByRole('button', { name: '読み込みに失敗しました。再試行' }))

    expect(await screen.findByText('1番目')).toBeInTheDocument()
  })
})

describe('新着の通知', () => {
  const NEW = `GET /api/timeline/new?tab=following&sinceId=1`

  async function renderWithClock(handlers: Record<string, Handler>) {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const server = stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [FOLLOWING]: () => page([post(1, '既存の投稿')]), ...handlers })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderTimeline()
    await screen.findByText('既存の投稿')
    return { server, user }
  }

  async function waitForPoll() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    })
  }

  it('他のユーザーの新着を見つけたらバーを出し、押すと先頭に足す', async () => {
    const { server, user } = await renderWithClock({
      [NEW]: () => json(200, { count: 1, hasMore: false, items: [post(2, '新着の投稿', { author: OTHER })] }),
    })
    expect(screen.queryByRole('button', { name: /新しい投稿を表示/ })).not.toBeInTheDocument()

    await waitForPoll()
    const bar = await screen.findByRole('button', { name: '1件の新しい投稿を表示' })
    // 自動では挿入しない
    expect(screen.queryByText('新着の投稿')).not.toBeInTheDocument()

    await user.click(bar)

    const articles = screen.getAllByRole('article')
    expect(articles[0]).toHaveTextContent('新着の投稿')
    expect(articles[1]).toHaveTextContent('既存の投稿')
    expect(screen.queryByRole('button', { name: /新しい投稿を表示/ })).not.toBeInTheDocument()
    expect(window.scrollTo).toHaveBeenCalled()
    // 一覧を取り直してはいない
    expect(server.count(FOLLOWING)).toBe(1)
  })

  it('新着がなければバーを出さない', async () => {
    await renderWithClock({ [NEW]: () => json(200, { count: 0, hasMore: false, items: [] }) })

    await waitForPoll()

    expect(screen.queryByRole('button', { name: /新しい投稿を表示/ })).not.toBeInTheDocument()
  })

  it('画面が隠れている間は確認しない', async () => {
    const { server } = await renderWithClock({ [NEW]: () => json(200, { count: 0, hasMore: false, items: [] }) })
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

    await waitForPoll()
    expect(server.count(NEW)).toBe(0)

    hidden.mockReturnValue(false)
    await waitForPoll()
    expect(server.count(NEW)).toBe(1)
    hidden.mockRestore()
  })

  it('件数が多いときは「N件以上」と表示し、押すと一覧を取り直す', async () => {
    let listCalls = 0
    const { server, user } = await renderWithClock({
      [FOLLOWING]: () => page(++listCalls === 1 ? [post(1, '既存の投稿')] : [post(99, '最新の投稿'), post(98, '2番目に新しい')], 'cursor-x'),
      [NEW]: () => json(200, { count: 50, hasMore: true, items: Array.from({ length: 50 }, (_, i) => post(99 - i, `n${i}`)) }),
    })

    await waitForPoll()
    await user.click(await screen.findByRole('button', { name: '50件以上の新しい投稿を表示' }))

    expect(await screen.findByText('最新の投稿')).toBeInTheDocument()
    expect(server.count(FOLLOWING)).toBe(2)
    expect(screen.queryByRole('button', { name: /新しい投稿を表示/ })).not.toBeInTheDocument()
  })

  async function postOwn(text: string) {
    fireEvent.change(screen.getByLabelText('いまどうしてる?'), { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: '投稿する' }))
    await screen.findByText(text)
  }

  it('自分が投稿して既に一覧にあるものだけなら、新着として数えない', async () => {
    const { server } = await renderWithClock({
      'POST /api/posts': () => json(201, post(2, '自分の新規投稿')),
      [NEW]: () => json(200, { count: 1, hasMore: false, items: [post(2, '自分の新規投稿')] }),
    })

    await postOwn('自分の新規投稿')
    await waitForPoll()

    // 基準は自分の投稿では進まない(sinceId=1 のまま)。結果は自分の投稿だけなのでバーは出ない
    expect(server.count(NEW)).toBe(1)
    expect(screen.queryByRole('button', { name: /新しい投稿を表示/ })).not.toBeInTheDocument()
  })

  it('自分の投稿の直前に届いた他のユーザーの投稿も、新着として見つけて正しい順に足す', async () => {
    const { server, user } = await renderWithClock({
      'POST /api/posts': () => json(201, post(3, '自分の新規投稿')),
      // 他のユーザーの投稿(id=2)の後に、自分が投稿(id=3)した
      [NEW]: () =>
        json(200, { count: 2, hasMore: false, items: [post(3, '自分の新規投稿'), post(2, '他のユーザーの投稿', { author: OTHER })] }),
    })

    await postOwn('自分の新規投稿')
    await waitForPoll()

    // 自分の投稿は数えず、他のユーザーの投稿だけが新着
    const bar = await screen.findByRole('button', { name: '1件の新しい投稿を表示' })
    expect(server.count(NEW)).toBe(1)

    await user.click(bar)

    // 並び順は id の新しい順: 自分の投稿(3)、他のユーザーの投稿(2)、既存の投稿(1)
    expect(screen.getAllByRole('article').map((a) => a.textContent)).toEqual([
      expect.stringContaining('自分の新規投稿'),
      expect.stringContaining('他のユーザーの投稿'),
      expect.stringContaining('既存の投稿'),
    ])
    expect(screen.queryByRole('button', { name: /新しい投稿を表示/ })).not.toBeInTheDocument()
  })

  it('新着バーを押して一覧に足したあとは、足した投稿の次から確認する', async () => {
    let calls = 0
    const { server, user } = await renderWithClock({
      [NEW]: () => {
        calls++
        return json(200, { count: 1, hasMore: false, items: [post(2, '新着の投稿', { author: OTHER })] })
      },
      'GET /api/timeline/new?tab=following&sinceId=2': () => json(200, { count: 0, hasMore: false, items: [] }),
    })

    await waitForPoll()
    await user.click(await screen.findByRole('button', { name: '1件の新しい投稿を表示' }))
    await waitForPoll()

    expect(calls).toBe(1)
    expect(server.count('GET /api/timeline/new?tab=following&sinceId=2')).toBe(1)
    expect(screen.queryByRole('button', { name: /新しい投稿を表示/ })).not.toBeInTheDocument()
  })
})
