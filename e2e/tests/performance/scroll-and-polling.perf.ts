import { Api, expect, test } from '../../fixtures'
import {
  DESKTOP,
  MOBILE,
  RUNS,
  collectVitals,
  expectWithin,
  report,
  seedHeavyTimeline,
  timeIt,
  withFreshSession,
} from '../../fixtures/metrics'
import { threshold } from '../../perf-thresholds'

let me: Api
test.beforeAll(async () => {
  me = await seedHeavyTimeline() // フォロー中タブに 70 件
})
test.afterAll(() => me?.dispose())

for (const profile of [DESKTOP, MOBILE]) {
  test(`無限スクロール: 続きの読み込み時間・DOMノード数・JSヒープ [${profile.name}]`, async ({ browser }) => {
    const runs: Record<string, number>[] = []
    for (let i = 0; i < RUNS; i++) {
      const run = await withFreshSession(browser, me, profile, async (page) => {
        const articles = page.getByRole('article')
        await expect(articles).toHaveCount(20)

        await articles.last().scrollIntoViewIfNeeded()
        const page2 = await timeIt(
          async () => undefined,
          () => expect(articles).toHaveCount(40),
        )
        await articles.last().scrollIntoViewIfNeeded()
        const page3 = await timeIt(
          async () => undefined,
          () => expect(articles).toHaveCount(60),
        )
        await articles.last().scrollIntoViewIfNeeded()
        await expect(articles).toHaveCount(70)

        await page.waitForTimeout(300)
        const v = await collectVitals(page)
        return { scrollPage: Math.max(page2, page3), domNodes: v.domNodes, heapMB: v.heapMB, longTaskTotal: v.longTaskTotal, cls: v.cls }
      })
      runs.push(run)
    }
    const summary = report('infinite-scroll', profile, runs)
    expectWithin(summary, 'scrollPage', 'scrollPage', profile)
    expectWithin(summary, 'domNodes', 'domNodes', profile)
    expectWithin(summary, 'heapMB', 'heapMB', profile)
    expectWithin(summary, 'cls', 'cls', profile)
  })
}

test('新着ポーリング: 5分間の呼び出し回数が間隔(30秒)どおりで、メインスレッドを塞がない', async ({ browser }) => {
  await withFreshSession(browser, me, DESKTOP, async (page) => {
    await page.clock.install()
    await page.reload()
    await expect(page.getByRole('article').first()).toBeVisible()

    let calls = 0
    page.on('request', (r) => {
      if (r.url().includes('/api/timeline/new')) calls++
    })
    await page.clock.runFor(5 * 60_000) // 仮想時間で 5 分進める
    await page.waitForTimeout(500) // 発行済みのリクエストが記録されるのを待つ
    const v = await collectVitals(page)
    report('polling', DESKTOP, [{ calls, longTaskTotal: v.longTaskTotal }])

    expect(calls, 'ポーリングが動いていない').toBeGreaterThanOrEqual(5)
    expect(calls, '5分間の呼び出しが多すぎる').toBeLessThanOrEqual(threshold('pollingCalls'))
    expect(v.longTaskTotal).toBeLessThanOrEqual(threshold('longTaskTotal'))
  })
})
