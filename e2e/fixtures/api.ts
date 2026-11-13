import { request, type APIRequestContext } from '@playwright/test'
import { API_PORT } from '../playwright.config'
import { uniqueUser, type TestUser } from './data'

export const API_BASE = `http://localhost:${API_PORT}`

export interface ApiUser extends TestUser {
  id: number
  accessToken: string
}

export interface ApiPost {
  id: number
  body: string
}

/** API を直接叩いてシナリオの前提データを作るクライアント(画面操作は使わない)。 */
export class Api {
  private constructor(
    private readonly ctx: APIRequestContext,
    readonly user: ApiUser,
  ) {}

  /** 一意なユーザーを API で登録し、そのユーザーとして操作するクライアントを返す。 */
  static async signup(label = 'u', overrides: Partial<TestUser> = {}): Promise<Api> {
    const info = { ...uniqueUser(label), ...overrides }
    const ctx = await request.newContext({ baseURL: API_BASE })
    const res = await ctx.post('/api/auth/signup', { data: info })
    if (res.status() !== 201) throw new Error(`signup failed: ${res.status()} ${await res.text()}`)
    const body = await res.json()
    return new Api(ctx, { ...info, id: body.user.id, accessToken: body.accessToken })
  }

  private get auth() {
    return { Authorization: `Bearer ${this.user.accessToken}` }
  }

  async post(body: string): Promise<ApiPost> {
    const res = await this.ctx.post('/api/posts', { data: { body, imageKeys: [] }, headers: this.auth })
    if (res.status() !== 201) throw new Error(`post failed: ${res.status()} ${await res.text()}`)
    return res.json()
  }

  /** 本文を連番にして n 件投稿する(古い順に作るので、最後の 1 件が最新)。 */
  async postMany(n: number, prefix = '投稿'): Promise<ApiPost[]> {
    const out: ApiPost[] = []
    for (let i = 1; i <= n; i++) out.push(await this.post(`${prefix} ${i}`))
    return out
  }

  async follow(handle: string) {
    const res = await this.ctx.put(`/api/users/${handle}/follow`, { headers: this.auth })
    if (!res.ok()) throw new Error(`follow failed: ${res.status()}`)
  }

  async comment(postId: number, body: string) {
    const res = await this.ctx.post(`/api/posts/${postId}/comments`, { data: { body }, headers: this.auth })
    if (!res.ok()) throw new Error(`comment failed: ${res.status()} ${await res.text()}`)
    return res.json()
  }

  /** 任意のリクエストをこのユーザーのトークンで送る(権限テスト用)。 */
  raw(method: 'put' | 'delete' | 'get', path: string, data?: unknown) {
    return this.ctx[method](path, { headers: this.auth, data })
  }

  /** トークンなしのリクエスト(認証テスト用)。 */
  static async anonymous(method: 'get' | 'post', path: string): Promise<{ status: number; body: { code?: string } }> {
    const ctx = await request.newContext({ baseURL: API_BASE })
    try {
      const res = await ctx[method](path)
      return { status: res.status(), body: await res.json().catch(() => ({})) }
    } finally {
      await ctx.dispose()
    }
  }

  dispose() {
    return this.ctx.dispose()
  }
}
