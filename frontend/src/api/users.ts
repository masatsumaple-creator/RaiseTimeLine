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
  /** 新しいアイコンのキー(S3 へアップロード済みの画像)。無ければアイコンは変えない */
  avatarKey?: string
  /** true ならアイコンを削除する(avatarKey とは同時に指定できない) */
  removeAvatar?: boolean
}

export function updateProfile(input: UpdateProfileInput): Promise<User> {
  return request<User>('/api/users/me', { method: 'PUT', body: input, auth: true })
}
