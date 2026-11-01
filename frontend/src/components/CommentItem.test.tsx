import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Comment } from '../api/types'
import { CommentItem } from './CommentItem'

const comment: Comment = {
  id: 9,
  postId: 3,
  body: 'いいですね',
  createdAt: '2026-01-01T00:00:00Z',
  author: { id: 2, handle: 'suzuki', displayName: '鈴木' },
  mine: false,
}

describe('CommentItem', () => {
  it('本文・表示名・@ハンドルを出す', () => {
    render(<CommentItem comment={comment} busy={false} onDelete={vi.fn()} />)

    expect(screen.getByText('いいですね')).toBeInTheDocument()
    expect(screen.getByText('鈴木')).toBeInTheDocument()
    expect(screen.getByText('@suzuki')).toBeInTheDocument()
  })

  it('投稿日時を <time> に ISO 形式で持たせる', () => {
    const { container } = render(<CommentItem comment={comment} busy={false} onDelete={vi.fn()} />)

    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-01-01T00:00:00Z')
  })

  it('他人のコメントには削除ボタンを出さない', () => {
    render(<CommentItem comment={comment} busy={false} onDelete={vi.fn()} />)

    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument()
  })

  it('自分のコメントには削除ボタンを出し、押すとそのコメントで onDelete が呼ばれる', async () => {
    const onDelete = vi.fn()
    const mine = { ...comment, mine: true }
    render(<CommentItem comment={mine} busy={false} onDelete={onDelete} />)

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(onDelete).toHaveBeenCalledWith(mine)
  })

  it('処理中(busy)は削除ボタンを無効にする', () => {
    render(<CommentItem comment={{ ...comment, mine: true }} busy onDelete={vi.fn()} />)

    expect(screen.getByRole('button', { name: '削除' })).toBeDisabled()
  })

  it('本文の HTML は解釈せず、文字として表示する', () => {
    render(<CommentItem comment={{ ...comment, body: '<b>強調</b>' }} busy={false} onDelete={vi.fn()} />)

    expect(screen.getByText('<b>強調</b>')).toBeInTheDocument()
  })
})
