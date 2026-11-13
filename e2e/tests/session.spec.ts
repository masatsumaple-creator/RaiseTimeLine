import { Api, expect, openAs, test } from '../fixtures'

test.describe('セッション(アクセストークンはメモリのみ、リフレッシュはHttpOnly Cookie)', () => {
  test('リロードしてもリフレッシュトークンでログイン状態が復元される', async ({ page, timeline, me }) => {
    await page.reload()
    await expect(timeline.bodyInput).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('link', { name: me.user.displayName })).toBeVisible()
  })

  test('アクセストークンが期限切れ(401)でも、自動でリフレッシュして再試行され画面は止まらない', async ({ page, timeline, me }) => {
    await me.post('期限切れの後でも見える投稿')

    let rejected = 0
    await page.route('**/api/timeline?*', async (route) => {
      // 最初の 1 回だけ 401 にする(期限切れを再現)
      if (rejected++ === 0) {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'ログインが必要です' }) })
      } else {
        await route.continue()
      }
    })
    const refreshed = page.waitForResponse((r) => r.url().includes('/api/auth/refresh') && r.status() === 200)
    await timeline.selectTab('全体') // 取得し直しが走る
    await refreshed

    await expect(timeline.card('期限切れの後でも見える投稿')).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    expect(rejected).toBeGreaterThanOrEqual(2) // 401 のあと、再試行された
  })

  test('リフレッシュも失敗したらログイン画面へ戻る', async ({ page, context, timeline }) => {
    await context.clearCookies() // リフレッシュトークンを失う
    await page.route('**/api/timeline?*', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'ログインが必要です' }) }),
    )
    await timeline.tab('全体').click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('ログアウトするとリフレッシュトークンが失効し、リロードしてもログインに戻れない', async ({ page, timeline }) => {
    await page.getByRole('button', { name: 'ログアウト' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.reload()
    await expect(page).toHaveURL(/\/login$/)
    void timeline
  })

  test('2人のユーザーが別々のブラウザコンテキストで独立してログインできる', async ({ browser, me }) => {
    const other = await Api.signup('second')
    const a = await openAs(browser, me)
    const b = await openAs(browser, other)

    await expect(a.page.getByRole('link', { name: me.user.displayName })).toBeVisible()
    await expect(b.page.getByRole('link', { name: other.user.displayName })).toBeVisible()

    // 片方のログアウトが、もう片方に影響しない
    await a.page.getByRole('button', { name: 'ログアウト' }).click()
    await expect(a.page).toHaveURL(/\/login$/)
    await b.page.reload()
    await expect(b.page.getByRole('link', { name: other.user.displayName })).toBeVisible()

    await a.context.close()
    await b.context.close()
    await other.dispose()
  })

  test('サーバーに接続できないときは、エラーと再読み込みボタンを表示し、復旧後に読み込める', async ({ page, timeline, me }) => {
    await me.post('復旧後に見える投稿')
    let offline = true
    await page.route('**/api/timeline?*', (route) => (offline ? route.abort('connectionrefused') : route.continue()))

    await timeline.tab('全体').click()
    await expect(page.getByText('通信に失敗しました。しばらくしてからやり直してください')).toBeVisible()

    offline = false
    await page.getByRole('button', { name: '再読み込み' }).click()
    await expect(timeline.card('復旧後に見える投稿')).toBeVisible()
  })
})
