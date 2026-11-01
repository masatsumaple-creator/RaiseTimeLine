import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { NotFoundPage } from './NotFoundPage'

describe('NotFoundPage', () => {
  it('見つからないことを伝え、ホームへのリンクを出す', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'ページが見つかりません' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ホームへ' })).toHaveAttribute('href', '/')
  })
})
