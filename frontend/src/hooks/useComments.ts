import { useCallback } from 'react'
import { fetchComments } from '../api/comments'
import type { Comment } from '../api/types'
import { usePagedList } from './usePagedList'

/** 1 つの投稿のコメント一覧(古い順)。一覧の取得は usePagedList に任せ、追加と削除だけを足す。 */
export function useComments(postId: number) {
  const list = usePagedList<Comment>(`post:${postId}`, (cursor) => fetchComments(postId, cursor))
  const { setItems } = list

  /** 自分のコメントを末尾に足す。続きが未取得のときは、続きを読んだときに並び順どおり入る。 */
  const append = useCallback(
    (comment: Comment) => {
      setItems((items, hasNext) => (hasNext || items.some((c) => c.id === comment.id) ? items : [...items, comment]))
    },
    [setItems],
  )

  const remove = useCallback(
    (id: number) => {
      setItems((items) => items.filter((c) => c.id !== id))
    },
    [setItems],
  )

  return {
    items: list.items,
    // 投稿が無い(404)ときも、コメント一覧としては「取得に失敗した」扱い(投稿の有無は画面側で見ている)
    status: list.status === 'missing' ? ('error' as const) : list.status,
    more: list.more,
    hasNext: list.hasNext,
    loadMore: list.loadMore,
    retry: list.retry,
    append,
    remove,
  }
}
