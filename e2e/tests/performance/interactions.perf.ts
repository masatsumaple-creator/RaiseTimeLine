import { Api, expect, test } from '../../fixtures'
import { DESKTOP, MOBILE, RUNS, expectWithin, report, seedHeavyTimeline, timeIt, withFreshSession } from '../../fixtures/metrics'

let me: Api
let stranger: Api
test.beforeAll(async () => {
  me = await seedHeavyTimeline()
  stranger = await Api.signup('perfstranger')
  await stranger.post('PERF-全体タブだけに出る投稿')
})
test.afterAll(async () => {
  await me?.dispose()
  await stranger?.dispose()
})

for (const profile of [DESKTOP, MOBILE]) {
  test(`操作の応答時間(投稿・いいね・タブ切替・検索) [${profile.name}]`, async ({ browser }) => {
    const runs: Record<string, number>[] = []
    for (let i = 0; i < RUNS; i++) {
      const run = await withFreshSession(browser, me, profile, async (page) => {
        const articles = page.getByRole('article')
        await expect(articles.first()).toBeVisible()

        // 投稿 → 先頭にカードが出る
        const body = `計測用の投稿 ${Date.now()}-${i}`
        await page.getByPlaceholder('いまどうしてる?').fill(body)
        const postToCard = await timeIt(
          () => page.getByRole('button', { name: '投稿する' }).click(),
          () => expect(articles.first()).toContainText(body),
        )

        // いいね → aria-pressed が変わる
        const like = articles.first().getByRole('button', { name: /^いいね/ })
        const likeMs = await timeIt(
          () => like.click(),
          () => expect(like).toHaveAttribute('aria-pressed', 'true'),
        )

        // タブ切替(フォロー中 → 全体): 全体にしか出ない投稿が現れる
        const tabSwitch = await timeIt(
          () => page.getByRole('tab', { name: '全体' }).click(),
          () => expect(articles.filter({ hasText: 'PERF-全体タブだけに出る投稿' })).toBeVisible(),
        )

        // 検索: 入力から結果表示まで(デバウンスを含む)
        await page.getByRole('link', { name: 'ユーザー検索' }).click()
        const input = page.getByPlaceholder('@ハンドルまたは表示名で探す')
        await expect(input).toBeVisible()
        const search = await timeIt(
          () => input.fill(stranger.user.handle),
          () => expect(page.getByRole('link', { name: stranger.user.displayName, exact: true })).toBeVisible(),
        )

        return { postToCard, like: likeMs, tabSwitch, search }
      })
      runs.push(run)
    }
    const summary = report('interactions', profile, runs)
    expectWithin(summary, 'postToCard', 'postToCard', profile)
    expectWithin(summary, 'like', 'like', profile)
    expectWithin(summary, 'tabSwitch', 'tabSwitch', profile)
    expectWithin(summary, 'search', 'search', profile)
  })
}
