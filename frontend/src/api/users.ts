import { request } from './client'
import type { FollowResult, TimelinePage, UserPage, UserProfile } from './types'

export function fetchProfile(handle: string): Promise<UserProfile> {
  return request<UserProfile>(`/api/users/${encodeURIComponent(handle)}`, { auth: true })
}

export function fetchUserPosts(handle: string, cursor?: string | null): Promise<TimelinePage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return request<TimelinePage>(`/api/users/${encodeURIComponent(handle)}/posts${query}`, { auth: true })
}

export function followUser(handle: string): Promise<FollowResult> {
  return request<FollowResult>(`/api/users/${encodeURIComponent(handle)}/follow`, { method: 'PUT', auth: true })
}

export function unfollowUser(handle: string): Promise<FollowResult> {
  return request<FollowResult>(`/api/users/${encodeURIComponent(handle)}/follow`, { method: 'DELETE', auth: true })
}

export type FollowListKind = 'following' | 'followers'

export function fetchFollowList(kind: FollowListKind, handle: string, cursor?: string | null): Promise<UserPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return request<UserPage>(`/api/users/${encodeURIComponent(handle)}/${kind}${query}`, { auth: true })
}
