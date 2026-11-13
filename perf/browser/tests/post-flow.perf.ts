import { test } from '@playwright/test'
import { RUNS, USERS, report, withFreshPage } from '../lib/metrics'

// 投稿 → 一覧に出るまで、いいね → 件数が変わるまで の体感時間。
// 作った投稿は本文が [perf-run] で始まるので、後始末(cleanup/run-data.sql)で消える。いいねは付けて外す。
test('投稿・いいねの反映時間', async ({ browser }) => {
  const runs: Record<string, number>[] = []
  for (let i = 0; i < RUNS; i++) {
    const result = await withFreshPage(browser, (i % USERS) + 1, async (page) => {
      await page.goto('/')
      await page.locator('article').first().waitFor()

      const text = `[perf-run] browser post ${Date.now()}-${i}`
      await page.getByPlaceholder('いまどうしてる?').fill(text)
      const t0 = Date.now()
      await page.getByRole('button', { name: '投稿する' }).click()
      await page.locator('article', { hasText: text }).first().waitFor()
      const postToVisible = Date.now() - t0

      // 先頭の投稿のいいね(押す → 戻す)。すでにいいね済みなら、戻す → 押すの順で差し引き 0 にする
      const like = page.locator('article').first().getByRole('button', { name: /^いいね/ })
      const label = async () => (await like.getAttribute('aria-label')) ?? ''
      const toggle = async () => {
        const before = await label()
        const t = Date.now()
        await like.click()
        await page.waitForFunction(
          ([sel, prev]) => document.querySelector(sel)?.getAttribute('aria-label') !== prev,
          ['article:first-of-type button[aria-label^="いいね"]', before] as const,
        )
        return Date.now() - t
      }
      const likeToggle1 = await toggle()
      const likeToggle2 = await toggle()
      return { postToVisible, likeToggle1, likeToggle2 }
    })
    runs.push(result)
  }
  report('post-flow', runs)
})
