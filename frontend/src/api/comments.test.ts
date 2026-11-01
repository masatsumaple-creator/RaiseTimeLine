import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { json, stubFetch } from '../test/fakeServer'
import { createComment, deleteComment, fetchComments } from './comments'

beforeEach(() => {
  tokenStore.set('access-1')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('fetchComments', () => {
  it('cursor が無ければ付けずに取得する', async () => {
    const server = stubFetch({ 'GET /api/posts/3/comments': () => json(200, { items: [], nextCursor: null }) })

    await fetchComments(3)

    expect(server.calls[0].headers.Authorization).toBe('Bearer access-1')
  })

  it('cursor は URL エンコードして付ける', async () => {
    const server = stubFetch({
      'GET /api/posts/3/comments?cursor=x%2By': () => json(200, { items: [], nextCursor: null }),
    })

    await fetchComments(3, 'x+y')

    expect(server.calls).toHaveLength(1)
  })
})

describe('createComment', () => {
  it('本文を POST して、作成したコメントとコメント数を返す', async () => {
    const server = stubFetch({
      'POST /api/posts/3/comments': () => json(201, { comment: { id: 9 }, commentCount: 4 }),
    })

    const result = await createComment(3, 'いいね')

    expect(server.calls[0].body).toEqual({ body: 'いいね' })
    expect(result).toEqual({ comment: { id: 9 }, commentCount: 4 })
  })
})

describe('deleteComment', () => {
  it('DELETE して、削除後のコメント数を返す', async () => {
    const server = stubFetch({ 'DELETE /api/comments/9': () => json(200, { commentCount: 2 }) })

    expect(await deleteComment(9)).toEqual({ commentCount: 2 })
    expect(server.calls[0].method).toBe('DELETE')
  })
})
