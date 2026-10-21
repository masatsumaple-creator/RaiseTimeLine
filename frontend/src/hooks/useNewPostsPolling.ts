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
 * 一覧の先頭(topId)より新しい投稿を定期的に確認する。
 * 画面が隠れている間は確認せず、見える状態に戻った時点ですぐ確認する。
 * 見つけた新着は自動では一覧に足さず、呼び出し側が「新着バー」で知らせて利用者の操作で反映する。
 */
export function useNewPostsPolling(tab: TimelineTab, topId: number, enabled: boolean) {
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const check = () => {
      fetchNewPosts(tab, topId)
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
  }, [tab, topId, enabled])

  const clear = useCallback(() => setPending(null), [])

  // 自分の投稿などで既に一覧に入ったものは、新着として数えない
  const items = pending && pending.tab === tab ? pending.data.items.filter((p) => p.id > topId) : []
  return {
    items,
    count: items.length,
    hasMore: items.length > 0 && (pending?.data.hasMore ?? false),
    clear,
  }
}
