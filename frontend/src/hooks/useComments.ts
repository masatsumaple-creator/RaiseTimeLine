import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchComments } from '../api/comments'
import type { Comment } from '../api/types'

type Status = 'loading' | 'ready' | 'error'
type MoreStatus = 'idle' | 'loading' | 'error'

interface State {
  postId: number
  items: Comment[]
  nextCursor: string | null
  status: Status
  more: MoreStatus
}

function initialState(postId: number): State {
  return { postId, items: [], nextCursor: null, status: 'loading', more: 'idle' }
}

/** 1 つの投稿のコメント一覧(古い順)。先頭ページの取得、続きの取得(無限スクロール用)、追加・削除を持つ。 */
export function useComments(postId: number) {
  const [state, setState] = useState<State>(() => initialState(postId))
  const loadingMore = useRef(false)

  // 別の投稿に移ったら、前の投稿の一覧を引き継がずに最初からにする
  if (state.postId !== postId) setState(initialState(postId))

  const load = useCallback(() => {
    let cancelled = false
    fetchComments(postId)
      .then((page) => {
        if (!cancelled) {
          setState((s) =>
            s.postId === postId
              ? { ...s, items: page.items, nextCursor: page.nextCursor, status: 'ready', more: 'idle' }
              : s,
          )
        }
      })
      .catch(() => {
        if (!cancelled) setState((s) => (s.postId === postId ? { ...s, status: 'error' } : s))
      })
    return () => {
      cancelled = true
    }
  }, [postId])

  useEffect(() => load(), [load])

  /** 初回の取得に失敗したときのやり直し。 */
  const retry = useCallback(() => {
    setState((s) => (s.postId === postId ? { ...s, status: 'loading' } : s))
    load()
  }, [postId, load])

  const cursor = state.nextCursor
  const loadMore = useCallback(() => {
    if (cursor === null || loadingMore.current) return
    loadingMore.current = true
    setState((s) => (s.postId === postId ? { ...s, more: 'loading' } : s))
    fetchComments(postId, cursor)
      .then((page) => {
        setState((s) =>
          s.postId === postId && s.nextCursor === cursor
            ? {
                ...s,
                items: [...s.items, ...page.items.filter((c) => !s.items.some((known) => known.id === c.id))],
                nextCursor: page.nextCursor,
                more: 'idle',
              }
            : s,
        )
      })
      .catch(() => {
        setState((s) => (s.postId === postId && s.nextCursor === cursor ? { ...s, more: 'error' } : s))
      })
      .finally(() => {
        loadingMore.current = false
      })
  }, [postId, cursor])

  /** 自分のコメントを末尾に足す。続きが未取得のときは、続きを読んだときに並び順どおり入る。 */
  const append = useCallback((comment: Comment) => {
    setState((s) =>
      s.nextCursor !== null || s.items.some((c) => c.id === comment.id)
        ? s
        : { ...s, items: [...s.items, comment] },
    )
  }, [])

  const remove = useCallback((id: number) => {
    setState((s) => ({ ...s, items: s.items.filter((c) => c.id !== id) }))
  }, [])

  return {
    items: state.items,
    status: state.status,
    more: state.more,
    hasNext: state.nextCursor !== null,
    loadMore,
    retry,
    append,
    remove,
  }
}
