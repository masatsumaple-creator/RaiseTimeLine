import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSummary } from '../api/types'
import { tokenStore } from '../auth/tokenStore'
import { apiError, json, stubFetch } from '../test/fakeServer'
import { ToastProvider } from './ToastProvider'
import { UserRow } from './UserRow'

function user(overrides: Partial<UserSummary> = {}): UserSummary {
  return { id: 2, handle: 'suzuki', displayName: '鈴木', followedByMe: false, isMe: false, ...overrides }
}

function renderRow(u: UserSummary, onChange = vi.fn()) {
  render(
    <MemoryRouter>
      <ToastProvider>
        <ul>
          <UserRow user={u} onChange={onChange} />
        </ul>
      </ToastProvider>
    </MemoryRouter>,
  )
  return onChange
}

beforeEach(() => {
  tokenStore.set('access-1')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('表示', () => {
  it('表示名と @ハンドルを出し、プロフィールへのリンクにする', () => {
    renderRow(user())

    expect(screen.getByText('@suzuki')).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toHaveAttribute('href', '/users/suzuki')
    expect(screen.getByRole('link', { name: '鈴木' })).toBeInTheDocument()
  })

  it('自己紹介は 1 行目だけ出す', () => {
    renderRow(user({ bio: '一行目\n二行目' }))

    expect(screen.getByText('一行目')).toBeInTheDocument()
    expect(screen.queryByText(/二行目/)).not.toBeInTheDocument()
  })

  it('自己紹介が無ければ何も出さない', () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <ul>
            <UserRow user={user()} onChange={vi.fn()} />
          </ul>
        </ToastProvider>
      </MemoryRouter>,
    )

    expect(container.querySelector('.user-row-bio')).toBeNull()
  })

  it('自分自身の行にはフォローボタンを出さない', () => {
    renderRow(user({ isMe: true }))

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('フォローボタン', () => {
  it('未フォローなら「フォロー」で、押されていない状態', () => {
    renderRow(user())

    const button = screen.getByRole('button', { name: '鈴木をフォロー' })
    expect(button).toHaveTextContent('フォロー')
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('フォロー済みなら「フォロー中」で、押されている状態', () => {
    renderRow(user({ followedByMe: true }))

    const button = screen.getByRole('button', { name: '鈴木をフォロー解除' })
    expect(button).toHaveTextContent('フォロー中')
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('フォローすると、その場で onChange に反映し、サーバーの結果で確定する', async () => {
    const server = stubFetch({ 'PUT /api/users/suzuki/follow': () => json(200, { followedByMe: true, followerCount: 3 }) })
    const onChange = renderRow(user())

    await userEvent.click(screen.getByRole('button', { name: '鈴木をフォロー' }))

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    expect(server.count('PUT /api/users/suzuki/follow')).toBe(1)
    expect(onChange).toHaveBeenNthCalledWith(1, 2, { followedByMe: true })
    expect(onChange).toHaveBeenNthCalledWith(2, 2, { followedByMe: true })
  })

  it('フォロー中の行で押すと解除する', async () => {
    const server = stubFetch({
      'DELETE /api/users/suzuki/follow': () => json(200, { followedByMe: false, followerCount: 2 }),
    })
    const onChange = renderRow(user({ followedByMe: true }))

    await userEvent.click(screen.getByRole('button', { name: '鈴木をフォロー解除' }))

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    expect(server.count('DELETE /api/users/suzuki/follow')).toBe(1)
    expect(onChange).toHaveBeenLastCalledWith(2, { followedByMe: false })
  })

  it('失敗したら元の状態に戻し、メッセージを出す', async () => {
    stubFetch({ 'PUT /api/users/suzuki/follow': () => apiError(500, 'INTERNAL_ERROR', 'エラー') })
    const onChange = renderRow(user())

    await userEvent.click(screen.getByRole('button', { name: '鈴木をフォロー' }))

    expect(await screen.findByText('フォローの操作に失敗しました')).toBeInTheDocument()
    expect(onChange).toHaveBeenLastCalledWith(2, { followedByMe: false })
  })
})
