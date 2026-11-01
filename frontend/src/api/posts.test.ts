import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { json, noContent, stubFetch } from '../test/fakeServer'
import {
  createPost,
  deletePost,
  fetchNewPosts,
  fetchPost,
  fetchTimeline,
  likePost,
  unlikePost,
  updatePost,
} from './posts'

beforeEach(() => {
  tokenStore.set('access-1')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('fetchTimeline', () => {
  it('タブだけを指定すると cursor 無しで取得する', async () => {
    const server = stubFetch({ 'GET /api/timeline?tab=following': () => json(200, { items: [], nextCursor: null }) })

    const page = await fetchTimeline('following')

    expect(page).toEqual({ items: [], nextCursor: null })
    expect(server.calls[0].headers.Authorization).toBe('Bearer access-1')
  })

  it('cursor は URL エンコードして付ける', async () => {
    const server = stubFetch({
      'GET /api/timeline?tab=all&cursor=a%20b%2Bc%3D': () => json(200, { items: [], nextCursor: null }),
    })

    await fetchTimeline('all', 'a b+c=')

    expect(server.count('GET /api/timeline?tab=all&cursor=a%20b%2Bc%3D')).toBe(1)
  })

  it('cursor が null や空なら付けない', async () => {
    const server = stubFetch({ 'GET /api/timeline?tab=all': () => json(200, { items: [], nextCursor: null }) })

    await fetchTimeline('all', null)
    await fetchTimeline('all', '')

    expect(server.count('GET /api/timeline?tab=all')).toBe(2)
  })
})

describe('fetchNewPosts', () => {
  it('タブと sinceId を付けて新着を取得する', async () => {
    const server = stubFetch({
      'GET /api/timeline/new?tab=following&sinceId=42': () => json(200, { count: 0, hasMore: false, items: [] }),
    })

    const result = await fetchNewPosts('following', 42)

    expect(result.count).toBe(0)
    expect(server.calls).toHaveLength(1)
  })
})

describe('fetchPost', () => {
  it('投稿を ID で取得する', async () => {
    stubFetch({ 'GET /api/posts/7': () => json(200, { id: 7 }) })

    expect(await fetchPost(7)).toEqual({ id: 7 })
  })
})

describe('createPost', () => {
  it('本文と画像のキーを POST する', async () => {
    const server = stubFetch({ 'POST /api/posts': () => json(201, { id: 1 }) })

    await createPost('こんにちは', ['post/1/a.png'])

    expect(server.calls[0].body).toEqual({ body: 'こんにちは', imageKeys: ['post/1/a.png'] })
  })

  it('画像を省略すると空の配列を送る', async () => {
    const server = stubFetch({ 'POST /api/posts': () => json(201, { id: 1 }) })

    await createPost('本文のみ')

    expect(server.calls[0].body).toEqual({ body: '本文のみ', imageKeys: [] })
  })
})

describe('updatePost / deletePost', () => {
  it('updatePost は本文を PUT する', async () => {
    const server = stubFetch({ 'PUT /api/posts/3': () => json(200, { id: 3, body: '新' }) })

    const post = await updatePost(3, '新')

    expect(server.calls[0].body).toEqual({ body: '新' })
    expect(post.body).toBe('新')
  })

  it('deletePost は DELETE して、何も返さない', async () => {
    const server = stubFetch({ 'DELETE /api/posts/3': () => noContent() })

    await expect(deletePost(3)).resolves.toBeUndefined()
    expect(server.calls[0].method).toBe('DELETE')
  })
})

describe('likePost / unlikePost', () => {
  it('likePost は PUT で、結果(いいね数と済み)を返す', async () => {
    stubFetch({ 'PUT /api/posts/3/like': () => json(200, { likeCount: 5, likedByMe: true }) })

    expect(await likePost(3)).toEqual({ likeCount: 5, likedByMe: true })
  })

  it('unlikePost は DELETE で、結果を返す', async () => {
    stubFetch({ 'DELETE /api/posts/3/like': () => json(200, { likeCount: 4, likedByMe: false }) })

    expect(await unlikePost(3)).toEqual({ likeCount: 4, likedByMe: false })
  })
})
