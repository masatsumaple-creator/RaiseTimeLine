import { Api, expect, test } from '../fixtures'

test.describe('セキュリティ', () => {
  test('未ログインでは保護されたAPIが401を返す', async () => {
    for (const path of ['/api/auth/me', '/api/timeline?tab=all', '/api/users/someone', '/api/search/users?q=a']) {
      const res = await Api.anonymous('get', path)
      expect(res.status, path).toBe(401)
      expect(res.body.code).toBe('UNAUTHORIZED')
    }
    expect((await Api.anonymous('post', '/api/posts')).status).toBe(401)
  })

  test('不正なアクセストークンは401になる', async () => {
    const me = await Api.signup('badtoken')
    const bad = { ...me, user: { ...me.user, accessToken: 'invalid.token.value' } }
    Object.assign(me, { user: bad.user })
    const res = await me.raw('get', '/api/auth/me')
    expect(res.status()).toBe(401)
    await me.dispose()
  })

  test('他人の投稿は編集・削除できない(403)、コメントも削除できない', async () => {
    const owner = await Api.signup('owner')
    const attacker = await Api.signup('attacker')
    const post = await owner.post('守られる投稿')
    const comment = await owner.comment(post.id, '守られるコメント')
    const commentId = comment.comment?.id ?? comment.id

    expect((await attacker.raw('put', `/api/posts/${post.id}`, { body: '改ざん' })).status()).toBe(403)
    expect((await attacker.raw('delete', `/api/posts/${post.id}`)).status()).toBe(403)
    expect((await attacker.raw('delete', `/api/comments/${commentId}`)).status()).toBe(403)

    // 無傷であること
    const res = await owner.raw('get', `/api/posts/${post.id}`)
    expect((await res.json()).body).toBe('守られる投稿')
    await owner.dispose()
    await attacker.dispose()
  })

  test('投稿・コメント・表示名に入れたHTMLは文字として表示され、スクリプトは実行されない', async ({ page }) => {
    const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'
    const attacker = await Api.signup('xss', { displayName: '<b onmouseover=window.__xss=3>名前</b>' })
    const post = await attacker.post(payload)
    await attacker.comment(post.id, payload)

    const dialogs: string[] = []
    page.on('dialog', (d) => {
      dialogs.push(d.message())
      void d.dismiss()
    })

    // 閲覧者として別ユーザーでログイン
    const viewer = await Api.signup('viewer')
    await page.goto('/login')
    await page.getByLabel('メールアドレス').fill(viewer.user.email)
    await page.getByLabel('パスワード').fill(viewer.user.password)
    await page.getByRole('button', { name: 'ログイン', exact: true }).click()
    await page.getByRole('tab', { name: '全体' }).click()

    const card = page.getByRole('article').filter({ hasText: 'window.__xss=1' })
    await expect(card).toBeVisible()
    await expect(card).toContainText(payload) // タグがそのまま文字として見える
    await expect(card.locator('img[src="x"]')).toHaveCount(0)
    await expect(card.getByText('<b onmouseover=window.__xss=3>名前</b>')).toBeVisible()

    await page.goto(`/posts/${post.id}`)
    await expect(page.getByRole('region', { name: 'コメント' })).toContainText(payload)

    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
    expect(dialogs).toEqual([])
    await attacker.dispose()
    await viewer.dispose()
  })

  test('アクセストークンはストレージに保存されない', async ({ page, timeline }) => {
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    expect(stored).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./) // JWT らしき文字列がない
    expect(await page.evaluate(() => document.cookie)).not.toContain('refresh_token') // JS から読めない
    void timeline
  })

  test('リフレッシュトークンのCookieは HttpOnly・SameSite=Strict・Path=/api/auth', async ({ page, context, timeline }) => {
    void timeline
    const cookies = await context.cookies()
    const refresh = cookies.find((c) => c.name === 'refresh_token')
    expect(refresh).toBeDefined()
    expect(refresh).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/auth' })
    void page
  })

  test('エラー応答は共通の形式({code, message})で、内部情報を含まない', async () => {
    const me = await Api.signup('errfmt')
    const res = await me.raw('get', '/api/posts/999999999')
    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body).toMatchObject({ code: 'NOT_FOUND' })
    expect(JSON.stringify(body)).not.toMatch(/Exception|at com\.|org\.springframework|stack/i)
    await me.dispose()
  })

  test('パスワードはAPI応答に含まれない', async () => {
    const me = await Api.signup('nopw')
    const res = await me.raw('get', '/api/auth/me')
    const text = await res.text()
    expect(text).not.toMatch(/password|\$2a\$/i)
    await me.dispose()
  })
})
