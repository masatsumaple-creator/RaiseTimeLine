import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStore } from '../auth/tokenStore'
import { apiError, json, stubFetch } from '../test/fakeServer'
import { ApiError } from './client'
import { UploadError, uploadImage } from './images'

const FILE = new File(['png-bytes'], 'a.png', { type: 'image/png' })
const ISSUE = 'POST /api/images/upload-url'
const PUT1 = 'PUT https://s3.test/upload/1'
const PUT2 = 'PUT https://s3.test/upload/2'

function issued(n: number) {
  return () => json(200, { uploadUrl: `https://s3.test/upload/${n}`, imageKey: `avatars/1/key-${n}.png`, expiresIn: 300 })
}

beforeEach(() => {
  tokenStore.set('access-1')
})

afterEach(() => {
  tokenStore.clear()
  vi.unstubAllGlobals()
})

describe('uploadImage', () => {
  it('署名付き URL を取って、S3 へ直接 PUT し、画像のキーを返す', async () => {
    const { calls } = stubFetch({ [ISSUE]: issued(1), [PUT1]: () => new Response(null, { status: 200 }) })

    await expect(uploadImage('avatar', FILE)).resolves.toBe('avatars/1/key-1.png')

    expect(calls[0].body).toEqual({ purpose: 'avatar', contentType: 'image/png', size: FILE.size })
    expect(calls[0].headers.Authorization).toBe('Bearer access-1')
    // S3 へは、署名した Content-Type で送り、アクセストークンは付けない
    expect(calls[1].headers['Content-Type']).toBe('image/png')
    expect(calls[1].headers.Authorization).toBeUndefined()
  })

  it('署名の期限切れ(403)のときだけ、URL を取り直して 1 回やり直す', async () => {
    let issuedCount = 0
    const { count } = stubFetch({
      [ISSUE]: () => issued(++issuedCount)(),
      [PUT1]: () => new Response(null, { status: 403 }),
      [PUT2]: () => new Response(null, { status: 200 }),
    })

    await expect(uploadImage('avatar', FILE)).resolves.toBe('avatars/1/key-2.png')

    expect(count(ISSUE)).toBe(2)
  })

  it('やり直しても 403 なら、失敗にする(何度も繰り返さない)', async () => {
    let issuedCount = 0
    const { count } = stubFetch({
      [ISSUE]: () => issued(++issuedCount)(),
      [PUT1]: () => new Response(null, { status: 403 }),
      [PUT2]: () => new Response(null, { status: 403 }),
    })

    await expect(uploadImage('avatar', FILE)).rejects.toBeInstanceOf(UploadError)

    expect(count(ISSUE)).toBe(2)
  })

  it('403 以外の失敗は、やり直さずに失敗にする', async () => {
    const { count } = stubFetch({ [ISSUE]: issued(1), [PUT1]: () => new Response(null, { status: 500 }) })

    await expect(uploadImage('avatar', FILE)).rejects.toBeInstanceOf(UploadError)

    expect(count(ISSUE)).toBe(1)
  })

  it('通信そのものに失敗したときも、アップロードの失敗にする', async () => {
    stubFetch({
      [ISSUE]: issued(1),
      [PUT1]: () => {
        throw new TypeError('Failed to fetch')
      },
    })

    await expect(uploadImage('avatar', FILE)).rejects.toThrow('画像のアップロードに失敗しました')
  })

  it('署名付き URL の発行のエラーは、サーバーのメッセージを持つ ApiError のまま投げる', async () => {
    stubFetch({ [ISSUE]: () => apiError(503, 'IMAGES_NOT_CONFIGURED', '画像のアップロードは現在利用できません') })

    await expect(uploadImage('avatar', FILE)).rejects.toSatisfy(
      (e) => e instanceof ApiError && e.status === 503 && e.message === '画像のアップロードは現在利用できません',
    )
  })

  it('用途(post)も渡せる', async () => {
    const { calls } = stubFetch({ [ISSUE]: issued(1), [PUT1]: () => new Response(null, { status: 200 }) })

    await uploadImage('post', FILE)

    expect(calls[0].body).toMatchObject({ purpose: 'post' })
  })
})
