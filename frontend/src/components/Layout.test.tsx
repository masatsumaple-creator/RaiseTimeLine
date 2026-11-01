import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext'
import { Layout } from './Layout'
import { ToastProvider } from './ToastProvider'

describe('Layout', () => {
  it('共通のヘッダーと、その下に今の画面(Outlet)を表示する', () => {
    render(
      <AuthContext.Provider
        value={{
          status: 'anonymous',
          user: null,
          login: vi.fn(),
          signup: vi.fn(),
          logout: vi.fn(),
          updateUser: vi.fn(),
        }}
      >
        <ToastProvider>
          <MemoryRouter initialEntries={['/page']}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/page" element={<p>画面の中身</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthContext.Provider>,
    )

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('画面の中身')
  })
})
