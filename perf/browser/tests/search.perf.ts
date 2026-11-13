import { test } from '@playwright/test'
import { RUNS, USERS, collect, report, withFreshPage } from '../lib/metrics'

// ユーザー検索: 入力してから結果が出るまで。画面側に 300ms 前後のデバウンスがあるので、その分を含んだ値になる。
const TERMS = ['perf_user_1', 'Perf User 12', 'user_99']

test('検索: 入力から結果表示まで', async ({ browser }) => {
  const runs: Record<string, number>[] = []
  for (let i = 0; i < RUNS; i++) {
    const result = await withFreshPage(browser, (i % USERS) + 1, async (page) => {
      await page.goto('/search')
      const input = page.locator('#search-input')
      await input.waitFor()
      const typed: number[] = []
      for (const term of TERMS) {
        await input.fill('')
        const t0 = Date.now()
        await input.fill(term)
        await page.locator('li.user-row').first().waitFor()
        typed.push(Date.now() - t0)
      }
      const m = await collect(page)
      return {
        searchToResultAvg: typed.reduce((a, b) => a + b, 0) / typed.length,
        maxInteractionMs: m.maxInteractionMs,
        longTaskTotalMs: m.longTaskTotalMs,
      }
    })
    runs.push(result)
  }
  report('search', runs)
})
