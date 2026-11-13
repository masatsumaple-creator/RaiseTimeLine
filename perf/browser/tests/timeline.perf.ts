import { test } from '@playwright/test'
import { RUNS, USERS, collect, report, withFreshPage } from '../lib/metrics'

// ログイン済みの状態でタイムラインを開き直し(キャッシュなし)、初回表示と無限スクロールを計測する。
test('タイムライン: 初回表示と無限スクロール', async ({ browser }) => {
  const runs: Record<string, number>[] = []
  for (let i = 0; i < RUNS; i++) {
    const userIndex = (i % USERS) + 1
    const result = await withFreshPage(browser, userIndex, async (page) => {
      // ログイン直後ではなく、読み直した状態(リフレッシュトークンでの復帰 + タイムライン取得)を測る
      const start = Date.now()
      await page.goto('/')
      await page.locator('article').first().waitFor()
      const timeToFirstPost = Date.now() - start

      // 無限スクロール 5 回: 末尾までスクロールし、件数が増えるまでの時間を測る
      const scrollLoads: number[] = []
      for (let s = 0; s < 5; s++) {
        const before = await page.locator('article').count()
        const t0 = Date.now()
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await page.waitForFunction((n) => document.querySelectorAll('article').length > n, before, { timeout: 15_000 })
        scrollLoads.push(Date.now() - t0)
      }
      const m = await collect(page)
      return {
        timeToFirstPost,
        scrollLoadAvg: scrollLoads.reduce((a, b) => a + b, 0) / scrollLoads.length,
        scrollLoadMax: Math.max(...scrollLoads),
        articles: await page.locator('article').count(),
        ...m,
      }
    })
    runs.push(result)
  }
  report('timeline', runs)
})
