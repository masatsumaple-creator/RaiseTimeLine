import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '../api/types'
import { tokenStore } from '../auth/tokenStore'
import { apiError, json, noContent, stubFetch } from '../test/fakeServer'
import { PostCard } from './PostCard'
import { ToastProvider } from './ToastProvider'

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 7,
    body: 'こんにちは',
    createdAt: new Date().toISOString(),
    editedAt: null,
    author: { id: 2, handle: 'suzuki', displayName: '鈴木' },
    likeCount: 2,
    likedByMe: false,
    commentCount: 3,
    images: [],
    ...overrides,
  }
}

interface Options {
  mine?: boolean
  detail?: boolean
}

function setup(p: Post = post(), { mine = false, detail = false }: Options = {}) {
  const onUpdated = vi.fn()
  const onDeleted = vi.fn()
  render(
    <MemoryRouter initialEntries={['/']}>
      <ToastProvider>
        <Routes>
          <Route
            path="/"
            element={<PostCard post={p} mine={mine} detail={detail} onUpdated={onUpdated} onDeleted={onDeleted} />}
          />
          <Route path="/posts/:id" element={<p>投稿詳細画面</p>} />
          <Route path="/users/:handle" element={<p>プロフィール画面</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )
  return { onUpdated, onDeleted }
}

beforeEach(() => {
  tokenStore.set('access-1')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('表示', () => {
  it('著者・本文・ハンドル・いいね数・コメント数を出す', () => {
    setup()

    expect(screen.getByText('鈴木')).toBeInTheDocument()
    expect(screen.getByText('@suzuki')).toBeInTheDocument()
    expect(screen.getByText('こんにちは')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'いいね 2 件' })).toHaveTextContent('♡ 2')
    expect(screen.getByRole('link', { name: 'コメント 3 件。コメントする' })).toHaveTextContent('💬 3')
  })

  it('編集されていれば「(編集済み)」を出し、されていなければ出さない', () => {
    setup(post({ editedAt: '2026-01-02T00:00:00Z' }))
    expect(screen.getByText('(編集済み)')).toBeInTheDocument()
  })

  it('編集されていなければ「(編集済み)」を出さない', () => {
    setup()
    expect(screen.queryByText('(編集済み)')).not.toBeInTheDocument()
  })

  it('本文が空(画像だけの投稿)なら、本文の段落を出さない', () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <PostCard post={post({ body: '' })} mine={false} onUpdated={vi.fn()} onDeleted={vi.fn()} />
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(container.querySelector('.post-body')).toBeNull()
  })

  it('いいね済みなら ♥ で、押されている状態にする', () => {
    setup(post({ likedByMe: true }))

    const button = screen.getByRole('button', { name: 'いいね 2 件' })
    expect(button).toHaveTextContent('♥ 2')
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('他人の投稿には編集・削除を出さず、自分の投稿には出す', () => {
    setup()
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('自分の投稿には編集・削除を出す', () => {
    setup(post(), { mine: true })
    expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument()
  })

  it('本文の HTML は解釈せず、文字として表示する', () => {
    setup(post({ body: '<script>alert(1)</script>' }))

    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
  })
})

describe('移動', () => {
  it('カードを押すと投稿の詳細へ移動する', async () => {
    setup()

    await userEvent.click(screen.getByText('こんにちは'))

    expect(screen.getByText('投稿詳細画面')).toBeInTheDocument()
  })

  it('著者の名前を押すと、プロフィールへ移動する(詳細には移動しない)', async () => {
    setup()

    await userEvent.click(screen.getByRole('link', { name: '鈴木' }))

    expect(screen.getByText('プロフィール画面')).toBeInTheDocument()
  })

  it('文字を選択している最中のクリックでは移動しない', async () => {
    setup()
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '選択中' } as Selection)

    await userEvent.click(screen.getByText('こんにちは'))

    expect(screen.queryByText('投稿詳細画面')).not.toBeInTheDocument()
  })

  it('詳細画面での表示では、カードを押しても移動せず、コメント数はリンクにしない', async () => {
    setup(post(), { detail: true })

    await userEvent.click(screen.getByText('こんにちは'))

    expect(screen.queryByText('投稿詳細画面')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /コメントする/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('コメント 3 件')).toBeInTheDocument()
  })
})

describe('いいね', () => {
  it('押した直後に件数を増やし(楽観的更新)、サーバーの結果で確定する', async () => {
    const server = stubFetch({ 'PUT /api/posts/7/like': () => json(200, { likeCount: 3, likedByMe: true }) })
    const { onUpdated } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'いいね 2 件' }))

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(2))
    expect(server.count('PUT /api/posts/7/like')).toBe(1)
    expect(onUpdated).toHaveBeenNthCalledWith(1, expect.objectContaining({ likedByMe: true, likeCount: 3 }))
    expect(onUpdated).toHaveBeenNthCalledWith(2, expect.objectContaining({ likedByMe: true, likeCount: 3 }))
  })

  it('いいね済みで押すと取り消す(件数を減らす)', async () => {
    const server = stubFetch({ 'DELETE /api/posts/7/like': () => json(200, { likeCount: 1, likedByMe: false }) })
    const { onUpdated } = setup(post({ likedByMe: true }))

    await userEvent.click(screen.getByRole('button', { name: 'いいね 2 件' }))

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(2))
    expect(server.count('DELETE /api/posts/7/like')).toBe(1)
    expect(onUpdated).toHaveBeenNthCalledWith(1, expect.objectContaining({ likedByMe: false, likeCount: 1 }))
  })

  it('取り消しでも、件数は 0 未満にならない', async () => {
    stubFetch({ 'DELETE /api/posts/7/like': () => json(200, { likeCount: 0, likedByMe: false }) })
    const { onUpdated } = setup(post({ likedByMe: true, likeCount: 0 }))

    await userEvent.click(screen.getByRole('button', { name: 'いいね 0 件' }))

    expect(onUpdated).toHaveBeenNthCalledWith(1, expect.objectContaining({ likeCount: 0 }))
  })

  it('失敗したら元に戻し、メッセージを出す', async () => {
    stubFetch({ 'PUT /api/posts/7/like': () => apiError(500, 'INTERNAL_ERROR', 'エラー') })
    const { onUpdated } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'いいね 2 件' }))

    expect(await screen.findByText('いいねに失敗しました')).toBeInTheDocument()
    expect(onUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ likedByMe: false, likeCount: 2 }))
  })

  it('投稿が消えていた(404)ら、一覧から取り除く', async () => {
    stubFetch({ 'PUT /api/posts/7/like': () => apiError(404, 'NOT_FOUND', 'なし') })
    const { onDeleted } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'いいね 2 件' }))

    expect(await screen.findByText('投稿が見つかりません')).toBeInTheDocument()
    expect(onDeleted).toHaveBeenCalledWith(7)
  })
})

describe('編集', () => {
  async function startEdit(p: Post = post()) {
    const handlers = setup(p, { mine: true })
    await userEvent.click(screen.getByRole('button', { name: '編集' }))
    return handlers
  }

  it('編集を押すと、今の本文が入った入力欄と残り文字数を出す', async () => {
    await startEdit()

    expect(screen.getByLabelText('投稿を編集')).toHaveValue('こんにちは')
    expect(screen.getByText('残り 275 文字')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'いいね 2 件' })).not.toBeInTheDocument()
  })

  it('保存すると、前後の空白を除いた本文で更新し、編集を終える', async () => {
    const server = stubFetch({ 'PUT /api/posts/7': () => json(200, post({ body: '新しい本文' })) })
    const { onUpdated } = await startEdit()

    const textarea = screen.getByLabelText('投稿を編集')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, '  新しい本文  ')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ body: '新しい本文' })))
    expect(server.calls[0].body).toEqual({ body: '新しい本文' })
    expect(screen.queryByLabelText('投稿を編集')).not.toBeInTheDocument()
  })

  it('キャンセルすると、更新せずに編集を終える', async () => {
    const server = stubFetch({})
    const { onUpdated } = await startEdit()

    await userEvent.type(screen.getByLabelText('投稿を編集'), '追記')
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByLabelText('投稿を編集')).not.toBeInTheDocument()
    expect(onUpdated).not.toHaveBeenCalled()
    expect(server.calls).toHaveLength(0)
  })

  it('本文を空にすると、画像が無い投稿では保存できない', async () => {
    await startEdit()

    await userEvent.clear(screen.getByLabelText('投稿を編集'))

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('画像のある投稿は、本文を空にしても保存できる', async () => {
    await startEdit(post({ images: [{ url: 'https://s3.test/1.png', sortOrder: 0 }] }))

    await userEvent.clear(screen.getByLabelText('投稿を編集'))

    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('281 文字以上は保存できず、残り文字数が負になる', async () => {
    await startEdit()

    const textarea = screen.getByLabelText('投稿を編集')
    await userEvent.clear(textarea)
    await userEvent.click(textarea)
    await userEvent.paste('あ'.repeat(281))

    expect(screen.getByText('残り -1 文字')).toBeInTheDocument()
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('サーバーのエラーは入力欄の下に出し、編集を続けられる', async () => {
    stubFetch({ 'PUT /api/posts/7': () => apiError(400, 'VALIDATION_ERROR', '入力NG', { body: 'サーバー側の本文エラー' }) })
    const { onUpdated } = await startEdit()

    await userEvent.type(screen.getByLabelText('投稿を編集'), '追記')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('サーバー側の本文エラー')).toBeInTheDocument()
    expect(screen.getByLabelText('投稿を編集')).toBeInTheDocument()
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('保存の最中に投稿が消えていた(404)ら、一覧から取り除く', async () => {
    stubFetch({ 'PUT /api/posts/7': () => apiError(404, 'NOT_FOUND', 'なし') })
    const { onDeleted } = await startEdit()

    await userEvent.type(screen.getByLabelText('投稿を編集'), '追記')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(7))
  })

  it('再度編集を始めると、前回の入力ではなく今の本文から始まる', async () => {
    await startEdit()
    await userEvent.type(screen.getByLabelText('投稿を編集'), '破棄する追記')
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    await userEvent.click(screen.getByRole('button', { name: '編集' }))

    expect(screen.getByLabelText('投稿を編集')).toHaveValue('こんにちは')
  })
})

describe('削除', () => {
  it('確認でキャンセルしたら、何もしない', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const server = stubFetch({})
    const { onDeleted } = setup(post(), { mine: true })

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(server.calls).toHaveLength(0)
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('確認して削除すると、トーストを出して一覧から取り除く', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const server = stubFetch({ 'DELETE /api/posts/7': () => noContent() })
    const { onDeleted } = setup(post(), { mine: true })

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(7))
    expect(server.count('DELETE /api/posts/7')).toBe(1)
    expect(screen.getByText('投稿を削除しました')).toBeInTheDocument()
  })

  it('削除に失敗したら、一覧には残し、メッセージを出して再度押せるようにする', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubFetch({ 'DELETE /api/posts/7': () => apiError(500, 'INTERNAL_ERROR', 'サーバーでエラーが発生しました') })
    const { onDeleted } = setup(post(), { mine: true })

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(await screen.findByText('サーバーでエラーが発生しました')).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '削除' })).toBeEnabled()
  })

  it('すでに消えていた(404)ら、一覧から取り除く', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubFetch({ 'DELETE /api/posts/7': () => apiError(404, 'NOT_FOUND', 'なし') })
    const { onDeleted } = setup(post(), { mine: true })

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(7))
    expect(screen.getByText('投稿が見つかりません')).toBeInTheDocument()
  })
})
