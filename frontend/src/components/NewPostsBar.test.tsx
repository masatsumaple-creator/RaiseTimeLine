import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewPostsBar } from './NewPostsBar'

describe('NewPostsBar', () => {
  it('件数を出す', () => {
    render(<NewPostsBar count={3} hasMore={false} onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: '3件の新しい投稿を表示' })).toBeInTheDocument()
  })

  it('件数が上限を超えているときは「以上」を付ける', () => {
    render(<NewPostsBar count={50} hasMore onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: '50件以上の新しい投稿を表示' })).toBeInTheDocument()
  })

  it('押すと onClick が呼ばれる', async () => {
    const onClick = vi.fn()
    render(<NewPostsBar count={1} hasMore={false} onClick={onClick} />)

    await userEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
