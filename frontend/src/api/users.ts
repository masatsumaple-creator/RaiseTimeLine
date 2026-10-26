import { request } from './client'
import type { FollowResult, TimelinePage, User, UserPage, UserProfile } from './types'

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

export function searchUsers(q: string, cursor?: string | null): Promise<UserPage> {
  const query = `q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
  return request<UserPage>(`/api/search/users?${query}`, { auth: true })
}

export interface UpdateProfileInput {
  displayName: string
  /** 空なら「未設定」になる */
  bio: string
}

export function updateProfile(input: UpdateProfileInput): Promise<User> {
  return request<User>('/api/users/me', { method: 'PUT', body: input, auth: true })
}
