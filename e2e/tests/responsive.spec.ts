import { expect, loginViaUi, test } from '../fixtures'
import { Api } from '../fixtures/api'

// project "mobile"(Pixel 7: 412x915・タッチ操作)で実行される
test.describe('レスポンシブ(モバイル)', () => {
  test('ログイン→投稿→いいね→コメントまでの主要フローが、タッチ操作で完結する', async ({ page }) => {
    const me = await Api.signup('mobile')
    await loginViaUi(page, me.user.email)

    await page.getByPlaceholder('いまどうしてる?').fill('スマホから投稿')
    await page.getByRole('button', { name: '投稿する' }).tap()
    const card = page.getByRole('article').filter({ hasText: 'スマホから投稿' })
    await expect(card).toBeVisible()

    await card.getByRole('button', { name: /^いいね/ }).tap()
    await expect(card.getByRole('button', { name: /^いいね/ })).toHaveAttribute('aria-pressed', 'true')

    await card.getByText('スマホから投稿').tap()
    await expect(page).toHaveURL(/\/posts\/\d+$/)
    await page.getByPlaceholder('コメントを書く').fill('スマホからコメント')
    await page.getByRole('button', { name: 'コメントする' }).tap()
    await expect(page.getByRole('region', { name: 'コメント' })).toContainText('スマホからコメント')
    await me.dispose()
  })

  for (const path of ['/login', '/signup']) {
    test(`${path} は横スクロールが発生せず、操作要素が画面内に収まる`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('button').first()).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }

  test('ログイン後の主要画面でも横スクロールが発生しない(長い本文・長い表示名を含む)', async ({ page }) => {
    const me = await Api.signup('mobilelong', { displayName: 'とても長い表示名'.repeat(5) })
    await me.post('長い文字列'.repeat(40))
    await me.post('https://example.com/' + 'a'.repeat(200)) // 区切りのない長い文字列
    await loginViaUi(page, me.user.email)
    await expect(page.getByRole('article').first()).toBeVisible()

    for (const path of ['/', '/search', `/users/${me.user.handle}`, '/settings/profile']) {
      await page.goto(path)
      await expect(page.getByRole('main')).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${path} の横はみ出し(px)`).toBeLessThanOrEqual(0)
    }
    await me.dispose()
  })

  test('主要なボタンはタップしやすい大きさ(高さ24px以上)', async ({ page }) => {
    const me = await Api.signup('mobiletap')
    await me.post('サイズ確認')
    await loginViaUi(page, me.user.email)
    await expect(page.getByRole('article').first()).toBeVisible()

    for (const button of [page.getByRole('button', { name: '投稿する' }), page.getByRole('button', { name: /^いいね/ }).first()]) {
      const box = await button.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(24) // WCAG 2.2 の最小ターゲットサイズ(AA)
    }
    await me.dispose()
  })
})
