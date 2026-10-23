import { request } from './client'
import type { LikeResult, NewPosts, Post, TimelinePage, TimelineTab } from './types'

export function fetchTimeline(tab: TimelineTab, cursor?: string | null): Promise<TimelinePage> {
  const query = `tab=${tab}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
  return request<TimelinePage>(`/api/timeline?${query}`, { auth: true })
}

/** sinceId(一覧の先頭の投稿 id)より新しい投稿を取得する。 */
export function fetchNewPosts(tab: TimelineTab, sinceId: number): Promise<NewPosts> {
  return request<NewPosts>(`/api/timeline/new?tab=${tab}&sinceId=${sinceId}`, { auth: true })
}

export function fetchPost(id: number): Promise<Post> {
  return request<Post>(`/api/posts/${id}`, { auth: true })
}

export function createPost(body: string): Promise<Post> {
  return request<Post>('/api/posts', { method: 'POST', body: { body }, auth: true })
}

export function updatePost(id: number, body: string): Promise<Post> {
  return request<Post>(`/api/posts/${id}`, { method: 'PUT', body: { body }, auth: true })
}

export function deletePost(id: number): Promise<void> {
  return request<void>(`/api/posts/${id}`, { method: 'DELETE', auth: true })
}

export function likePost(id: number): Promise<LikeResult> {
  return request<LikeResult>(`/api/posts/${id}/like`, { method: 'PUT', auth: true })
}

export function unlikePost(id: number): Promise<LikeResult> {
  return request<LikeResult>(`/api/posts/${id}/like`, { method: 'DELETE', auth: true })
}
