import { useCallback, useEffect, useRef, useState } from 'react'
import type { Post, TimelinePage } from '../api/types'

type FetchPage = (cursor?: string | null) => Promise<TimelinePage>
type Status = 'loading' | 'ready' | 'error'
type MoreStatus = 'idle' | 'loading' | 'error'

interface State {
  key: string
  items: Post[]
  nextCursor: string | null
  /** サーバーから受け取った一覧の先頭の投稿 id(新着確認の基準)。自分の投稿では進めない */
  baseId: number
  status: Status
  more: MoreStatus
}

function initialState(key: string): State {
  return { key, items: [], nextCursor: null, baseId: 0, status: 'loading', more: 'idle' }
}

/** 既に一覧にある投稿(id 重複)を除いて足し、並び順(id の新しい順)を保つ。 */
function mergeNewer(items: Post[], added: Post[]): Post[] {
  const known = new Set(items.map((p) => p.id))
  return [...added.filter((p) => !known.has(p.id)), ...items].sort((a, b) => b.id - a.id)
}

/**
 * 投稿一覧 1 件分(タイムラインの 1 タブ、ユーザーの投稿一覧など)。key が変わると最初からにする。
 * 先頭ページの取得、続きの取得(無限スクロール用)、投稿の追加・差し替え・削除を持つ。
 * fetchPage は key が表す一覧のページ(cursor が無ければ先頭)を取得する。
 */
export function useTimeline(key: string, fetchPage: FetchPage) {
  const [state, setState] = useState<State>(() => initialState(key))
  const loadingMore = useRef(false)
  const fetchRef = useRef(fetchPage)
  useEffect(() => {
    fetchRef.current = fetchPage
  })

  // key が変わったら、前の一覧を引き継がずに最初からにする
  if (state.key !== key) setState(initialState(key))

  const applyFirstPage = useCallback((forKey: string, items: Post[], nextCursor: string | null) => {
    setState((s) =>
      s.key === forKey ? { ...s, items, nextCursor, baseId: items[0]?.id ?? 0, status: 'ready', more: 'idle' } : s,
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchRef.current()
      .then((page) => {
        if (!cancelled) applyFirstPage(key, page.items, page.nextCursor)
      })
      .catch(() => {
        if (!cancelled) setState((s) => (s.key === key ? { ...s, status: 'error' } : s))
      })
    return () => {
      cancelled = true
    }
  }, [key, applyFirstPage])

  /** 一覧を残したまま先頭ページを取り直す。失敗したら false。 */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const page = await fetchRef.current()
      applyFirstPage(key, page.items, page.nextCursor)
      return true
    } catch {
      return false
    }
  }, [key, applyFirstPage])

  /** 初回の取得に失敗したときのやり直し。 */
  const retry = useCallback(() => {
    setState((s) => (s.key === key ? { ...s, status: 'loading' } : s))
    void refresh().then((ok) => {
      if (!ok) setState((s) => (s.key === key ? { ...s, status: 'error' } : s))
    })
  }, [key, refresh])

  const cursor = state.nextCursor
  const loadMore = useCallback(() => {
    if (cursor === null || loadingMore.current) return
    loadingMore.current = true
    setState((s) => (s.key === key ? { ...s, more: 'loading' } : s))
    fetchRef.current(cursor)
      .then((page) => {
        setState((s) =>
          s.key === key && s.nextCursor === cursor
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
        setState((s) => (s.key === key && s.nextCursor === cursor ? { ...s, more: 'error' } : s))
      })
      .finally(() => {
        loadingMore.current = false
      })
  }, [key, cursor])

  /** サーバーから受け取った新着を先頭側に足す。新着確認の基準も進める。 */
  const prepend = useCallback((posts: Post[]) => {
    setState((s) => ({
      ...s,
      items: mergeNewer(s.items, posts),
      baseId: Math.max(s.baseId, ...posts.map((p) => p.id)),
    }))
  }, [])

  /**
   * 自分の投稿を先頭に足す。新着確認の基準は進めない。
   * 進めると、自分の投稿の直前に届いた他のユーザーの投稿が、新着として見つからなくなる。
   */
  const prependOwn = useCallback((post: Post) => {
    setState((s) => ({ ...s, items: mergeNewer(s.items, [post]) }))
  }, [])

  const replace = useCallback((post: Post) => {
    setState((s) => ({ ...s, items: s.items.map((p) => (p.id === post.id ? post : p)) }))
  }, [])

  const remove = useCallback((id: number) => {
    setState((s) => ({ ...s, items: s.items.filter((p) => p.id !== id) }))
  }, [])

  return {
    items: state.items,
    baseId: state.baseId,
    status: state.status,
    more: state.more,
    hasNext: state.nextCursor !== null,
    loadMore,
    refresh,
    retry,
    prepend,
    prependOwn,
    replace,
    remove,
  }
}
