import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import type { Post } from '../api/types'
import { AuthProvider } from '../auth/AuthProvider'
import { tokenStore } from '../auth/tokenStore'
import { ToastProvider } from '../components/ToastProvider'
import { apiError, json, SESSION, stubFetch, type FakeRequest, type Handler } from '../test/fakeServer'

const REFRESH_OK: Handler = () => json(200, SESSION)
const FOLLOWING = 'GET /api/timeline?tab=following'
const ISSUE = 'POST /api/images/upload-url'
const CREATE = 'POST /api/posts'

function page(items: Post[]) {
  return json(200, { items, nextCursor: null })
}

function post(id: number, body: string, imageUrls: string[] = []): Post {
  return {
    id,
    body,
    createdAt: new Date().toISOString(),
    editedAt: null,
    author: SESSION.user,
    likeCount: 0,
    likedByMe: false,
    commentCount: 0,
    images: imageUrls.map((url, sortOrder) => ({ url, sortOrder })),
  }
}

function file(name: string, size = 1000, type = 'image/png'): File {
  return new File([new Uint8Array(size)], name, { type })
}

/** 申し込みごとに、n 番目の署名付き URL とキーを返す。S3 へは、n 番目の URL で PUT する。 */
function uploadHandlers(options: { putStatus?: (n: number) => number } = {}) {
  let issued = 0
  const handlers: Record<string, Handler> = {
    [ISSUE]: () => {
      issued += 1
      return json(200, { uploadUrl: `https://s3.test/upload/${issued}`, imageKey: `posts/1/key-${issued}.png`, expiresIn: 300 })
    },
  }
  for (let n = 1; n <= 12; n++) {
    handlers[`PUT https://s3.test/upload/${n}`] = () => new Response(null, { status: options.putStatus?.(n) ?? 200 })
  }
  return handlers
}

function createdKeys(calls: FakeRequest[]): string[][] {
  return calls.filter((c) => `${c.method} ${c.path}` === CREATE).map((c) => (c.body as { imageKeys: string[] }).imageKeys)
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

async function pickFiles(...files: File[]) {
  await userEvent.upload(await screen.findByLabelText('画像を追加'), files)
}

let previewCounter = 0
let revoked: string[] = []

beforeEach(() => {
  tokenStore.clear()
  previewCounter = 0
  revoked = []
  URL.createObjectURL = vi.fn(() => `blob:draft-${++previewCounter}`)
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url)
  })
  vi.stubGlobal('scrollTo', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('画像を選ぶ', () => {
  it('選ぶとすぐプレビューを出す(この時点では、何も送らない)', async () => {
    const { count } = stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [FOLLOWING]: () => page([]), ...uploadHandlers() })

    renderTimeline()
    await pickFiles(file('a.png'), file('b.png'))

    const list = screen.getByRole('list', { name: '添付する画像' })
    expect(within(list).getAllByRole('img')).toHaveLength(2)
    expect(count(ISSUE)).toBe(0)
  })

  it('画像だけでも、投稿ボタンを押せる(本文も画像も無いときだけ押せない)', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [FOLLOWING]: () => page([]), ...uploadHandlers() })

    renderTimeline()
    const submit = await screen.findByRole('button', { name: '投稿する' })
    expect(submit).toBeDisabled()

    await pickFiles(file('a.png'))
    expect(submit).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: '画像 1 を取り除く' }))
    expect(submit).toBeDisabled()
  })

  it('4 枚まで。5 枚目以降は、メッセージを出して選ばない', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [FOLLOWING]: () => page([]), ...uploadHandlers() })

    renderTimeline()
    await pickFiles(file('1.png'), file('2.png'), file('3.png'), file('4.png'), file('5.png'))

    expect(await screen.findByText('画像は 4 枚までです')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: '添付する画像' })).getAllByRole('img')).toHaveLength(4)
    // 4 枚そろったら、これ以上は選べない
    expect(screen.getByLabelText('画像を追加')).toBeDisabled()
  })

  it('取り除くと、プレビューを解放し、また選べるようになる', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [FOLLOWING]: () => page([]), ...uploadHandlers() })

    renderTimeline()
    await pickFiles(file('1.png'), file('2.png'), file('3.png'), file('4.png'))
    expect(screen.getByLabelText('画像を追加')).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: '画像 2 を取り除く' }))

    expect(revoked).toEqual(['blob:draft-2'])
    expect(within(screen.getByRole('list', { name: '添付する画像' })).getAllByRole('img')).toHaveLength(3)
    expect(screen.getByLabelText('画像を追加')).toBeEnabled()
  })

  it('形式・大きさが合わない画像は、メッセージを出して選ばない(同時に選んだ、合う画像は選ばれる)', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [FOLLOWING]: () => page([]), ...uploadHandlers() })

    renderTimeline()
    await screen.findByLabelText('画像を追加')
    fireEvent.change(screen.getByLabelText('画像を追加'), {
      target: { files: [file('a.gif', 100, 'image/gif'), file('ok.png'), file('big.png', 5 * 1024 * 1024 + 1)] },
    })

    expect(await screen.findByText('JPEG、PNG、WebP の画像を選んでください')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: '添付する画像' })).getAllByRole('img')).toHaveLength(1)
  })

  it('5MB ちょうどの画像は選べる', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [FOLLOWING]: () => page([]), ...uploadHandlers() })

    renderTimeline()
    await pickFiles(file('exact.png', 5 * 1024 * 1024))

    expect(within(screen.getByRole('list', { name: '添付する画像' })).getAllByRole('img')).toHaveLength(1)
    expect(screen.queryByText('画像は 1 枚 5MB 以下にしてください')).not.toBeInTheDocument()
  })

  it('画面を離れるときに、プレビューを解放する', async () => {
    stubFetch({ 'POST /api/auth/refresh': REFRESH_OK, [FOLLOWING]: () => page([]), ...uploadHandlers() })

    const view = renderTimeline()
    await pickFiles(file('a.png'), file('b.png'))
    view.unmount()

    await waitFor(() => expect(revoked.sort()).toEqual(['blob:draft-1', 'blob:draft-2']))
  })
})

describe('投稿する', () => {
  it('画像を S3 へアップロードしてから、選んだ順のキーを添えて投稿し、入力を空にする', async () => {
    const created = post(2, 'こんにちは', ['https://s3.test/get/1.png', 'https://s3.test/get/2.png'])
    const { calls, count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([post(1, '既存の投稿')]),
      [CREATE]: () => json(201, created),
      ...uploadHandlers(),
    })

    renderTimeline()
    await screen.findByText('既存の投稿')
    await userEvent.type(screen.getByLabelText('いまどうしてる?'), '  こんにちは  ')
    await pickFiles(file('a.png'), file('b.png'))
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))

    const articles = await screen.findAllByRole('article')
    expect(articles[0]).toHaveTextContent('こんにちは')
    expect(within(articles[0]).getAllByRole('img', { name: /投稿の画像/ })).toHaveLength(2)
    expect(count(ISSUE)).toBe(2)
    expect(createdKeys(calls)).toEqual([['posts/1/key-1.png', 'posts/1/key-2.png']])
    expect((calls.find((c) => `${c.method} ${c.path}` === CREATE)?.body as { body: string }).body).toBe('こんにちは')
    // 入力と、プレビューが空になる
    expect(screen.getByLabelText('いまどうしてる?')).toHaveValue('')
    expect(screen.queryByRole('list', { name: '添付する画像' })).not.toBeInTheDocument()
    expect(revoked).toHaveLength(2)
  })

  it('画像だけ(本文なし)でも投稿できる', async () => {
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([]),
      [CREATE]: () => json(201, post(2, '', ['https://s3.test/get/1.png'])),
      ...uploadHandlers(),
    })

    renderTimeline()
    await pickFiles(file('a.png'))
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))

    const article = await screen.findByRole('article')
    expect(within(article).getByRole('img', { name: '投稿の画像 1' })).toBeInTheDocument()
    expect((calls.find((c) => `${c.method} ${c.path}` === CREATE)?.body as { body: string }).body).toBe('')
  })

  it('アップロードが終わる順が違っても、キーは選んだ順に並べる', async () => {
    let releaseFirst: (r: Response) => void = () => {}
    const handlers = uploadHandlers()
    handlers['PUT https://s3.test/upload/1'] = () => new Promise<Response>((resolve) => (releaseFirst = resolve))
    const { calls } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([]),
      [CREATE]: () => json(201, post(2, 'x', [])),
      ...handlers,
    })

    renderTimeline()
    await pickFiles(file('first.png'), file('second.png'))
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))
    // 2 枚目が先に終わり、1 枚目があとから終わる
    await waitFor(() => expect(calls.some((c) => c.path === 'https://s3.test/upload/2')).toBe(true))
    releaseFirst(new Response(null, { status: 200 }))

    await waitFor(() => expect(createdKeys(calls)).toHaveLength(1))
    expect(createdKeys(calls)[0]).toEqual(['posts/1/key-1.png', 'posts/1/key-2.png'])
  })

  it('一部のアップロードに失敗したら、投稿せず、その画像に印を付け、再試行では失敗した画像だけやり直す', async () => {
    let failSecond = true
    const handlers = uploadHandlers()
    handlers['PUT https://s3.test/upload/2'] = () => new Response(null, { status: failSecond ? 500 : 200 })
    const { calls, count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([]),
      [CREATE]: () => json(201, post(2, 'x')),
      ...handlers,
    })

    renderTimeline()
    await pickFiles(file('ok.png'), file('ng.png'))
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByText(/アップロードできなかった画像があります/)).toBeInTheDocument()
    expect(screen.getAllByText('送信に失敗')).toHaveLength(1)
    expect(count(CREATE)).toBe(0)
    expect(screen.getByRole('button', { name: '投稿する' })).toBeEnabled()

    failSecond = false
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))

    await screen.findByRole('article')
    // 1 回目の 2 枚 + 失敗した 1 枚だけ(うまくいった 1 枚目は、やり直さない)
    expect(count(ISSUE)).toBe(3)
    expect(createdKeys(calls)).toEqual([['posts/1/key-1.png', 'posts/1/key-3.png']])
  })

  it('アップロードのあとに投稿の送信で失敗しても、再試行ではアップロードをやり直さない', async () => {
    let fail = true
    const { calls, count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([]),
      [CREATE]: () => (fail ? apiError(500, 'INTERNAL', 'サーバーエラー') : json(201, post(2, 'x'))),
      ...uploadHandlers(),
    })

    renderTimeline()
    await pickFiles(file('a.png'), file('b.png'))
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))
    expect(await screen.findByText('サーバーエラー')).toBeInTheDocument()

    fail = false
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))

    await screen.findByRole('article')
    expect(count(ISSUE)).toBe(2)
    expect(createdKeys(calls)).toEqual([
      ['posts/1/key-1.png', 'posts/1/key-2.png'],
      ['posts/1/key-1.png', 'posts/1/key-2.png'],
    ])
  })

  it('サーバーが画像を受け付けなかったら(400)、メッセージを出し、次はアップロードからやり直す', async () => {
    let reject = true
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([]),
      [CREATE]: () =>
        reject
          ? json(400, { code: 'VALIDATION_ERROR', message: 'この画像はすでに使われています', fieldErrors: { imageKeys: 'この画像はすでに使われています' } })
          : json(201, post(2, 'x')),
      ...uploadHandlers(),
    })

    renderTimeline()
    await pickFiles(file('a.png'))
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))
    expect(await screen.findByText('この画像はすでに使われています')).toBeInTheDocument()

    reject = false
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))

    await screen.findByRole('article')
    expect(count(ISSUE)).toBe(2)
  })

  it('署名付き URL の発行に失敗したら(未設定など)、その画像に印を付け、メッセージを出す', async () => {
    const { count } = stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([]),
      [ISSUE]: () => apiError(503, 'IMAGES_NOT_CONFIGURED', '画像のアップロードは現在利用できません'),
    })

    renderTimeline()
    await pickFiles(file('a.png'))
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByText(/アップロードできなかった画像があります/)).toBeInTheDocument()
    expect(screen.getByText('送信に失敗')).toBeInTheDocument()
    expect(count(CREATE)).toBe(0)
  })

  it('投稿中は、画像の追加も取り除きもできない', async () => {
    let release: (r: Response) => void = () => {}
    const handlers = uploadHandlers()
    handlers['PUT https://s3.test/upload/1'] = () => new Promise<Response>((resolve) => (release = resolve))
    stubFetch({
      'POST /api/auth/refresh': REFRESH_OK,
      [FOLLOWING]: () => page([]),
      [CREATE]: () => json(201, post(2, 'x')),
      ...handlers,
    })

    renderTimeline()
    await pickFiles(file('a.png'))
    await userEvent.click(screen.getByRole('button', { name: '投稿する' }))

    expect(await screen.findByRole('button', { name: '投稿中…' })).toBeDisabled()
    expect(screen.getByLabelText('画像を追加')).toBeDisabled()
    expect(screen.getByRole('button', { name: '画像 1 を取り除く' })).toBeDisabled()

    release(new Response(null, { status: 200 }))
    await screen.findByRole('article')
  })
})
