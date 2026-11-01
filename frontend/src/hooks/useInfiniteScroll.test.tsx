import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInfiniteScroll } from './useInfiniteScroll'

interface Observer {
  callback: IntersectionObserverCallback
  options?: IntersectionObserverInit
  observed: Element[]
  disconnected: boolean
}

let observers: Observer[] = []

class FakeIntersectionObserver {
  private readonly entry: Observer
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.entry = { callback, options, observed: [], disconnected: false }
    observers.push(this.entry)
  }
  observe(target: Element) {
    this.entry.observed.push(target)
  }
  unobserve() {}
  disconnect() {
    this.entry.disconnected = true
  }
}

function Sentinel({ enabled, loadMore }: { enabled: boolean; loadMore: () => void }) {
  const ref = useInfiniteScroll(enabled, loadMore)
  return <div ref={ref} data-testid="end" />
}

function intersect(isIntersecting: boolean) {
  act(() => {
    const live = observers.filter((o) => !o.disconnected)
    for (const o of live) {
      o.callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver)
    }
  })
}

beforeEach(() => {
  observers = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useInfiniteScroll', () => {
  it('enabled のとき、末尾の要素を監視する(手前 300px で先読みする)', () => {
    const { getByTestId } = render(<Sentinel enabled loadMore={vi.fn()} />)

    expect(observers).toHaveLength(1)
    expect(observers[0].observed).toEqual([getByTestId('end')])
    expect(observers[0].options).toMatchObject({ rootMargin: '300px' })
  })

  it('末尾が見えたら loadMore を呼ぶ', () => {
    const loadMore = vi.fn()
    render(<Sentinel enabled loadMore={loadMore} />)

    intersect(true)

    expect(loadMore).toHaveBeenCalledTimes(1)
  })

  it('末尾が見えていない通知では呼ばない', () => {
    const loadMore = vi.fn()
    render(<Sentinel enabled loadMore={loadMore} />)

    intersect(false)

    expect(loadMore).not.toHaveBeenCalled()
  })

  it('enabled が false の間は監視しない', () => {
    render(<Sentinel enabled={false} loadMore={vi.fn()} />)

    expect(observers).toHaveLength(0)
  })

  it('enabled が false になったら監視をやめる', () => {
    const loadMore = vi.fn()
    const { rerender } = render(<Sentinel enabled loadMore={loadMore} />)

    rerender(<Sentinel enabled={false} loadMore={loadMore} />)

    expect(observers[0].disconnected).toBe(true)
  })

  it('アンマウントしたら監視をやめる', () => {
    const { unmount } = render(<Sentinel enabled loadMore={vi.fn()} />)

    unmount()

    expect(observers[0].disconnected).toBe(true)
  })

  it('IntersectionObserver が使えない環境でも落ちない', () => {
    vi.stubGlobal('IntersectionObserver', undefined)

    expect(() => render(<Sentinel enabled loadMore={vi.fn()} />)).not.toThrow()
  })
})
