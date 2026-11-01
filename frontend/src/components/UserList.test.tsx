import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserSummary } from '../api/types'
import type { PagedList } from '../hooks/usePagedList'
import { NETWORK_ERROR_MESSAGE } from '../pages/formErrors'
import { ToastProvider } from './ToastProvider'
import { UserList } from './UserList'

function user(id: number, handle: string): UserSummary {
  return { id, handle, displayName: `${handle}さん`, followedByMe: false, isMe: false }
}

function fakeList(overrides: Partial<PagedList<UserSummary>> = {}): PagedList<UserSummary> {
  return {
    items: [],
    status: 'ready',
    more: 'idle',
    hasNext: false,
    loadMore: vi.fn(),
    retry: vi.fn(),
    patch: vi.fn(),
    setItems: vi.fn(),
    ...overrides,
  }
}

function renderList(list: PagedList<UserSummary>) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <UserList list={list} emptyMessage="まだ誰もいません" />
      </ToastProvider>
    </MemoryRouter>,
  )
}

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

beforeEach(() => {
  observers = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('UserList', () => {
  it('読み込み中は「読み込み中…」だけを出す', () => {
    renderList(fakeList({ status: 'loading' }))

    expect(screen.getByText('読み込み中…')).toBeInTheDocument()
    expect(screen.queryByText('まだ誰もいません')).not.toBeInTheDocument()
  })

  it('取得に失敗したら通信エラーと再読み込みボタンを出し、押すと retry を呼ぶ', async () => {
    const retry = vi.fn()
    renderList(fakeList({ status: 'error', retry }))

    expect(screen.getByText(NETWORK_ERROR_MESSAGE)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }))

    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('0 件なら、渡された文言を出す', () => {
    renderList(fakeList({ items: [] }))

    expect(screen.getByText('まだ誰もいません')).toBeInTheDocument()
  })

  it('ユーザーを 1 人 1 行で出し、0 件の文言は出さない', () => {
    renderList(fakeList({ items: [user(1, 'a'), user(2, 'b')] }))

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('@a')).toBeInTheDocument()
    expect(screen.getByText('@b')).toBeInTheDocument()
    expect(screen.queryByText('まだ誰もいません')).not.toBeInTheDocument()
  })

  it('続きがあれば末尾に「読み込み中…」を出し、末尾が見えたら loadMore を呼ぶ', () => {
    const loadMore = vi.fn()
    renderList(fakeList({ items: [user(1, 'a')], hasNext: true, loadMore }))

    expect(screen.getByText('読み込み中…')).toBeInTheDocument()
    observers[0].callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)

    expect(loadMore).toHaveBeenCalledTimes(1)
  })

  it('続きを読み込み中(more が loading)は、末尾を監視しない(二重に呼ばない)', () => {
    renderList(fakeList({ items: [user(1, 'a')], hasNext: true, more: 'loading' }))

    expect(observers).toHaveLength(0)
  })

  it('続きの取得に失敗したら、再試行ボタンを出し、押すと loadMore を呼ぶ', async () => {
    const loadMore = vi.fn()
    renderList(fakeList({ items: [user(1, 'a')], hasNext: true, more: 'error', loadMore }))

    await userEvent.click(screen.getByRole('button', { name: '読み込みに失敗しました。再試行' }))

    expect(loadMore).toHaveBeenCalledTimes(1)
  })

  it('続きが無ければ末尾の表示を出さない', () => {
    renderList(fakeList({ items: [user(1, 'a')], hasNext: false }))

    expect(screen.queryByText('読み込み中…')).not.toBeInTheDocument()
  })
})
