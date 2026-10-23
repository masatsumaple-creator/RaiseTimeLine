import { useEffect, useRef } from 'react'

/**
 * 一覧の末尾(戻り値の ref を付けた要素)が見えたら loadMore を呼ぶ(無限スクロール)。
 * enabled が false の間(続きが無い・読み込み中・失敗中)は監視しない。
 */
export function useInfiniteScroll(enabled: boolean, loadMore: () => void) {
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const target = sentinel.current
    if (!target || !enabled || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: '300px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [enabled, loadMore])
  return sentinel
}
