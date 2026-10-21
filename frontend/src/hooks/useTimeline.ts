import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchTimeline } from '../api/posts'
import type { Post, TimelineTab } from '../api/types'

type Status = 'loading' | 'ready' | 'error'
type MoreStatus = 'idle' | 'loading' | 'error'

interface State {
  tab: TimelineTab
  items: Post[]
  nextCursor: string | null
  status: Status
  more: MoreStatus
}

function initialState(tab: TimelineTab): State {
  return { tab, items: [], nextCursor: null, status: 'loading', more: 'idle' }
}

/** 既に一覧にある投稿(id 重複)を除いて、新しい投稿を先頭に足す。 */
function prependUnique(items: Post[], added: Post[]): Post[] {
  const known = new Set(items.map((p) => p.id))
  return [...added.filter((p) => !known.has(p.id)), ...items]
}

/** タイムライン 1 タブ分の一覧。先頭ページの取得、続きの取得(無限スクロール用)、投稿の追加・差し替え・削除を持つ。 */
export function useTimeline(tab: TimelineTab) {
  const [state, setState] = useState<State>(() => initialState(tab))
  const loadingMore = useRef(false)

  // タブが変わったら、前のタブの一覧を引き継がずに最初からにする
  if (state.tab !== tab) setState(initialState(tab))

  const applyFirstPage = useCallback((forTab: TimelineTab, items: Post[], nextCursor: string | null) => {
    setState((s) => (s.tab === forTab ? { ...s, items, nextCursor, status: 'ready', more: 'idle' } : s))
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchTimeline(tab)
      .then((page) => {
        if (!cancelled) applyFirstPage(tab, page.items, page.nextCursor)
      })
      .catch(() => {
        if (!cancelled) setState((s) => (s.tab === tab ? { ...s, status: 'error' } : s))
      })
    return () => {
      cancelled = true
    }
  }, [tab, applyFirstPage])

  /** 一覧を残したまま先頭ページを取り直す。失敗したら false。 */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const page = await fetchTimeline(tab)
      applyFirstPage(tab, page.items, page.nextCursor)
      return true
    } catch {
      return false
    }
  }, [tab, applyFirstPage])

  /** 初回の取得に失敗したときのやり直し。 */
  const retry = useCallback(() => {
    setState((s) => (s.tab === tab ? { ...s, status: 'loading' } : s))
    void refresh().then((ok) => {
      if (!ok) setState((s) => (s.tab === tab ? { ...s, status: 'error' } : s))
    })
  }, [tab, refresh])

  const cursor = state.nextCursor
  const loadMore = useCallback(() => {
    if (cursor === null || loadingMore.current) return
    loadingMore.current = true
    setState((s) => (s.tab === tab ? { ...s, more: 'loading' } : s))
    fetchTimeline(tab, cursor)
      .then((page) => {
        setState((s) =>
          s.tab === tab && s.nextCursor === cursor
            ? {
                ...s,
                items: [...s.items, ...page.items.filter((p) => !s.items.some((known) => known.id === p.id))],
                nextCursor: page.nextCursor,
                more: 'idle',
              }
            : s,
        )
      })
      .catch(() => {
        setState((s) => (s.tab === tab && s.nextCursor === cursor ? { ...s, more: 'error' } : s))
      })
      .finally(() => {
        loadingMore.current = false
      })
  }, [tab, cursor])

  const prepend = useCallback((posts: Post[]) => {
    setState((s) => ({ ...s, items: prependUnique(s.items, posts) }))
  }, [])

  const replace = useCallback((post: Post) => {
    setState((s) => ({ ...s, items: s.items.map((p) => (p.id === post.id ? post : p)) }))
  }, [])

  const remove = useCallback((id: number) => {
    setState((s) => ({ ...s, items: s.items.filter((p) => p.id !== id) }))
  }, [])

  return {
    items: state.items,
    status: state.status,
    more: state.more,
    hasNext: state.nextCursor !== null,
    loadMore,
    refresh,
    retry,
    prepend,
    replace,
    remove,
  }
}
