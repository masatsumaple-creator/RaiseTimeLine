import { act, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './ToastProvider'
import { useToast } from './toast'

function Trigger({ messages }: { messages: string[] }) {
  const show = useToast()
  return (
    <button type="button" onClick={() => messages.forEach(show)}>
      show
    </button>
  )
}

function renderToasts(messages: string[]) {
  render(
    <ToastProvider>
      <Trigger messages={messages} />
    </ToastProvider>,
  )
}

function click() {
  act(() => screen.getByRole('button', { name: 'show' }).click())
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ToastProvider', () => {
  it('最初は何も表示しない', () => {
    renderToasts(['保存しました'])

    expect(screen.queryByText('保存しました')).not.toBeInTheDocument()
  })

  it('show したメッセージを表示する', () => {
    renderToasts(['保存しました'])

    click()

    expect(screen.getByText('保存しました')).toBeInTheDocument()
  })

  it('一定時間(2.6 秒)後に消える', () => {
    renderToasts(['保存しました'])
    click()

    act(() => vi.advanceTimersByTime(2599))
    expect(screen.getByText('保存しました')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('保存しました')).not.toBeInTheDocument()
  })

  it('複数のメッセージを同時に表示し、それぞれ別に消える', () => {
    renderToasts(['一つ目'])
    click()
    act(() => vi.advanceTimersByTime(1000))
    click()

    expect(screen.getAllByText('一つ目')).toHaveLength(2)
    act(() => vi.advanceTimersByTime(1600))
    expect(screen.getAllByText('一つ目')).toHaveLength(1)
  })

  it('スクリーンリーダーに読み上げられるよう aria-live の領域に出す', () => {
    renderToasts(['保存しました'])
    click()

    expect(screen.getByText('保存しました').parentElement).toHaveAttribute('aria-live', 'polite')
  })
})

describe('useToast', () => {
  it('ToastProvider の外で使うとエラーにする', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useToast())).toThrow('ToastProvider')

    spy.mockRestore()
  })
})
