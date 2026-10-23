import { request } from './client'
import type { TimelinePage, UserProfile } from './types'

export function fetchProfile(handle: string): Promise<UserProfile> {
  return request<UserProfile>(`/api/users/${encodeURIComponent(handle)}`, { auth: true })
}

export function fetchUserPosts(handle: string, cursor?: string | null): Promise<TimelinePage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
  return request<TimelinePage>(`/api/users/${encodeURIComponent(handle)}/posts${query}`, { auth: true })
}
