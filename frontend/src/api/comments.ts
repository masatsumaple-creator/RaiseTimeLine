import { request } from './client'
import type { CommentCreated, CommentPage } from './types'

export function fetchComments(postId: number, cursor?: string | null): Promise<CommentPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return request<CommentPage>(`/api/posts/${postId}/comments${query}`, { auth: true })
}

export function createComment(postId: number, body: string): Promise<CommentCreated> {
  return request<CommentCreated>(`/api/posts/${postId}/comments`, { method: 'POST', body: { body }, auth: true })
}

/** 削除後の、その投稿のコメント数を返す。 */
export function deleteComment(id: number): Promise<{ commentCount: number }> {
  return request<{ commentCount: number }>(`/api/comments/${id}`, { method: 'DELETE', auth: true })
}
