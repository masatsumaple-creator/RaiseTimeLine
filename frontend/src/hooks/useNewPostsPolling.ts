import { useCallback, useEffect, useState } from 'react'
import { fetchNewPosts } from '../api/posts'
import type { NewPosts, TimelineTab } from '../api/types'

/** 新着の確認間隔。 */
export const POLL_INTERVAL_MS = 30_000

interface Pending {
  tab: TimelineTab
  data: NewPosts
}

/**
 * baseId(サーバーから受け取った一覧の先頭の投稿 id)より新しい投稿を定期的に確認する。
 * 画面が隠れている間は確認せず、見える状態に戻った時点ですぐ確認する。
 * 見つけた新着は自動では一覧に足さず、呼び出し側が「新着バー」で知らせて利用者の操作で反映する。
 * baseId は自分の投稿では進まないため、結果には自分が投稿して既に一覧にあるもの(known)が混ざる。それは除く。
 */
export function useNewPostsPolling(tab: TimelineTab, baseId: number, known: ReadonlySet<number>, enabled: boolean) {
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const check = () => {
      fetchNewPosts(tab, baseId)
        .then((data) => {
          if (!cancelled) setPending(data.count > 0 ? { tab, data } : null)
        })
        .catch(() => {
          // 一時的な通信失敗は黙って次回に回す
        })
    }
    const tick = () => {
      if (!document.hidden) check()
    }
    const onVisibilityChange = () => {
      if (!document.hidden) check()
    }

    const timer = window.setInterval(tick, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [tab, baseId, enabled])

  const clear = useCallback(() => setPending(null), [])

  const items = pending && pending.tab === tab ? pending.data.items.filter((p) => !known.has(p.id)) : []
  return {
    items,
    count: items.length,
    hasMore: items.length > 0 && (pending?.data.hasMore ?? false),
    clear,
  }
}
