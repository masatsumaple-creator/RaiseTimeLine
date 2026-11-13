import { Api, expect, test } from '../../fixtures'
import {
  DESKTOP,
  MOBILE,
  RUNS,
  collectVitals,
  expectWithin,
  installObservers,
  report,
  seedHeavyTimeline,
  timeIt,
  withFreshSession,
} from '../../fixtures/metrics'
import type { WebVitals } from '../../fixtures/metrics'

let me: Api
test.beforeAll(async () => {
  me = await seedHeavyTimeline()
})
test.afterAll(() => me?.dispose())

for (const profile of [DESKTOP, MOBILE]) {
  test.describe(`ページ読み込み [${profile.name}]`, () => {
    test('ログイン画面: 表示完了までの時間と Web Vitals', async ({ browser }) => {
      const runs: Record<string, number>[] = []
      for (let i = 0; i < RUNS; i++) {
        const context = await browser.newContext({ locale: 'ja-JP' })
        const page = await context.newPage()
        await installObservers(page)
        const cdp = await context.newCDPSession(page)
        if (profile.scale > 1) {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
          await cdp.send('Network.enable')
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750 })
        }
        const ready = await timeIt(
          () => page.goto('/login'),
          () => expect(page.getByLabel('メールアドレス')).toBeVisible(),
        )
        await page.waitForTimeout(500) // LCP / CLS が落ち着くのを待つ
        const v: WebVitals = await collectVitals(page)
        runs.push({ ready, ttfb: v.ttfb, fcp: v.fcp, lcp: v.lcp, cls: v.cls, longTaskTotal: v.longTaskTotal })
        await context.close()
      }
      const summary = report('login-page-load', profile, runs)
      expectWithin(summary, 'ready', 'loginPageReady', profile)
      expectWithin(summary, 'ttfb', 'ttfb', profile)
      expectWithin(summary, 'fcp', 'fcp', profile)
      expectWithin(summary, 'lcp', 'lcp', profile)
      expectWithin(summary, 'cls', 'cls', profile)
      expectWithin(summary, 'longTaskTotal', 'longTaskTotal', profile)
    })

    test(`タイムライン再読み込み(投稿${70}件の環境): 最初の投稿が出るまでと Web Vitals`, async ({ browser }) => {
      const runs: Record<string, number>[] = []
      for (let i = 0; i < RUNS; i++) {
        const run = await withFreshSession(browser, me, profile, async (page) => {
          const ready = await timeIt(
            () => page.reload(), // リフレッシュトークンでの復元 → タイムライン取得 → 描画
            () => expect(page.getByRole('article').first()).toBeVisible(),
          )
          await page.waitForTimeout(500)
          const v = await collectVitals(page)
          return { ready, ttfb: v.ttfb, fcp: v.fcp, lcp: v.lcp, cls: v.cls, longTaskTotal: v.longTaskTotal, domNodes: v.domNodes }
        })
        runs.push(run)
      }
      const summary = report('timeline-load', profile, runs)
      expectWithin(summary, 'ready', 'timelineReady', profile)
      expectWithin(summary, 'lcp', 'lcp', profile)
      expectWithin(summary, 'cls', 'cls', profile)
      expectWithin(summary, 'longTaskTotal', 'longTaskTotal', profile)
    })

    test('ログイン送信からタイムライン表示までの時間', async ({ browser }) => {
      const runs: Record<string, number>[] = []
      for (let i = 0; i < RUNS; i++) {
        const context = await browser.newContext({ locale: 'ja-JP' })
        const page = await context.newPage()
        await page.goto('/login')
        await page.getByLabel('メールアドレス').fill(me.user.email)
        await page.getByLabel('パスワード').fill(me.user.password)
        if (profile.scale > 1) {
          const cdp = await context.newCDPSession(page)
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
        }
        const loginToTimeline = await timeIt(
          () => page.getByRole('button', { name: 'ログイン', exact: true }).click(),
          () => expect(page.getByRole('article').first()).toBeVisible(),
        )
        runs.push({ loginToTimeline })
        await context.close()
      }
      const summary = report('login-to-timeline', profile, runs)
      expectWithin(summary, 'loginToTimeline', 'loginToTimeline', profile)
    })
  })
}
