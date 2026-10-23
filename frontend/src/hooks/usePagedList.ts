import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'

/** missing: 一覧の持ち主が存在しない(404) */
type Status = 'loading' | 'ready' | 'error' | 'missing'
type MoreStatus = 'idle' | 'loading' | 'error'

interface Page<T> {
  items: T[]
  /** null なら最後のページ */
  nextCursor: string | null
}

interface State<T> {
  key: string
  items: T[]
  nextCursor: string | null
  status: Status
  more: MoreStatus
}

function initialState<T>(key: string): State<T> {
  return { key, items: [], nextCursor: null, status: 'loading', more: 'idle' }
}

/**
 * id を持つ行の一覧(フォロー中 / フォロワー)。先頭ページの取得、続きの取得(無限スクロール用)、
 * 行の差し替えを持つ。key が変わると最初からにする。fetchPage は cursor が無ければ先頭ページを取得する。
 */
export function usePagedList<T extends { id: number }>(key: string, fetchPage: (cursor?: string | null) => Promise<Page<T>>) {
  const [state, setState] = useState<State<T>>(() => initialState<T>(key))
  const loadingMore = useRef(false)
  const fetchRef = useRef(fetchPage)
  useEffect(() => {
    fetchRef.current = fetchPage
  })

  // key が変わったら、前の一覧を引き継がずに最初からにする
  if (state.key !== key) setState(initialState<T>(key))

  const load = useCallback(() => {
    let cancelled = false
    fetchRef
      .current()
      .then((page) => {
        if (!cancelled) {
          setState((s) =>
            s.key === key ? { ...s, items: page.items, nextCursor: page.nextCursor, status: 'ready', more: 'idle' } : s,
          )
        }
      })
      .catch((e) => {
        if (!cancelled) {
          const status = e instanceof ApiError && e.status === 404 ? 'missing' : 'error'
          setState((s) => (s.key === key ? { ...s, status } : s))
        }
      })
    return () => {
      cancelled = true
    }
  }, [key])

  useEffect(() => load(), [load])

  /** 初回の取得に失敗したときのやり直し。 */
  const retry = useCallback(() => {
    setState((s) => (s.key === key ? { ...s, status: 'loading' } : s))
    load()
  }, [key, load])

  const cursor = state.nextCursor
  const loadMore = useCallback(() => {
    if (cursor === null || loadingMore.current) return
    loadingMore.current = true
    setState((s) => (s.key === key ? { ...s, more: 'loading' } : s))
    fetchRef
      .current(cursor)
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

  const patch = useCallback((id: number, change: Partial<T>) => {
    setState((s) => ({ ...s, items: s.items.map((item) => (item.id === id ? { ...item, ...change } : item)) }))
  }, [])

  return {
    items: state.items,
    status: state.status,
    more: state.more,
    hasNext: state.nextCursor !== null,
    loadMore,
    retry,
    patch,
  }
}
