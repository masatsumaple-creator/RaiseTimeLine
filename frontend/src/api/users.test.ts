import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { json, stubFetch } from '../test/fakeServer'
import {
  fetchFollowList,
  fetchProfile,
  fetchUserPosts,
  followUser,
  searchUsers,
  unfollowUser,
  updateProfile,
} from './users'

beforeEach(() => {
  tokenStore.set('access-1')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('fetchProfile', () => {
  it('ハンドルを URL エンコードして取得する', async () => {
    const server = stubFetch({ 'GET /api/users/a%2Fb': () => json(200, { handle: 'a/b' }) })

    await fetchProfile('a/b')

    expect(server.calls[0].headers.Authorization).toBe('Bearer access-1')
  })
})

describe('fetchUserPosts', () => {
  it('cursor 無しで取得し、あれば URL エンコードして付ける', async () => {
    const server = stubFetch({
      'GET /api/users/alice/posts': () => json(200, { items: [], nextCursor: null }),
      'GET /api/users/alice/posts?cursor=a%3Db': () => json(200, { items: [], nextCursor: null }),
    })

    await fetchUserPosts('alice')
    await fetchUserPosts('alice', 'a=b')

    expect(server.calls.map((c) => c.path)).toEqual(['/api/users/alice/posts', '/api/users/alice/posts?cursor=a%3Db'])
  })
})

describe('followUser / unfollowUser', () => {
  it('followUser は PUT、unfollowUser は DELETE で、結果を返す', async () => {
    const server = stubFetch({
      'PUT /api/users/bob/follow': () => json(200, { followedByMe: true, followerCount: 3 }),
      'DELETE /api/users/bob/follow': () => json(200, { followedByMe: false, followerCount: 2 }),
    })

    expect(await followUser('bob')).toEqual({ followedByMe: true, followerCount: 3 })
    expect(await unfollowUser('bob')).toEqual({ followedByMe: false, followerCount: 2 })
    expect(server.calls.map((c) => c.method)).toEqual(['PUT', 'DELETE'])
  })
})

describe('fetchFollowList', () => {
  it('following / followers を取り分ける', async () => {
    const server = stubFetch({
      'GET /api/users/alice/following': () => json(200, { items: [], nextCursor: null }),
      'GET /api/users/alice/followers?cursor=c1': () => json(200, { items: [], nextCursor: null }),
    })

    await fetchFollowList('following', 'alice')
    await fetchFollowList('followers', 'alice', 'c1')

    expect(server.calls).toHaveLength(2)
  })
})

describe('searchUsers', () => {
  it('検索語を URL エンコードして付け、cursor があれば続けて付ける', async () => {
    const server = stubFetch({
      'GET /api/search/users?q=%E7%94%B0%E6%9D%91%20%26%20x': () => json(200, { items: [], nextCursor: null }),
      'GET /api/search/users?q=a&cursor=n%201': () => json(200, { items: [], nextCursor: null }),
    })

    await searchUsers('田村 & x')
    await searchUsers('a', 'n 1')

    expect(server.calls).toHaveLength(2)
  })
})

describe('updateProfile', () => {
  it('入力をそのまま PUT する', async () => {
    const server = stubFetch({ 'PUT /api/users/me': () => json(200, { id: 1, handle: 'alice', displayName: '新' }) })

    const user = await updateProfile({ displayName: '新', bio: '', avatarKey: 'avatar/1/a.png' })

    expect(server.calls[0].body).toEqual({ displayName: '新', bio: '', avatarKey: 'avatar/1/a.png' })
    expect(user.displayName).toBe('新')
  })

  it('アイコンの削除(removeAvatar)も送れる', async () => {
    const server = stubFetch({ 'PUT /api/users/me': () => json(200, { id: 1, handle: 'alice', displayName: '新' }) })

    await updateProfile({ displayName: '新', bio: 'x', removeAvatar: true })

    expect(server.calls[0].body).toEqual({ displayName: '新', bio: 'x', removeAvatar: true })
  })
})
