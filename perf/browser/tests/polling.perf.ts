import { test } from '@playwright/test'
import { USERS, loginViaUi, installObservers, applyProfile, report } from '../lib/metrics'

// 新着ポーリング(30 秒間隔)を放置したときの CPU 時間・JS ヒープ・リクエスト数。
// 放置時間は PERF_POLL_SECONDS(既定 65 秒 = ポーリング 2 回)。1 回だけ測る(待ち時間が長いため)。
const SECONDS = Number(process.env.PERF_POLL_SECONDS ?? 65)

test('新着ポーリング放置時の負荷', async ({ browser }) => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await installObservers(page)
    const cdp = await applyProfile(context, page)
    await cdp.send('Performance.enable')
    await loginViaUi(page, (1 % USERS) + 1)
    await page.locator('article').first().waitFor()

    const pollRequests: number[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/timeline/new')) pollRequests.push(Date.now())
    })
    const read = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics')
      const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0
      return { task: get('TaskDuration'), script: get('ScriptDuration'), heap: get('JSHeapUsedSize'), nodes: get('Nodes') }
    }

    const before = await read()
    await page.waitForTimeout(SECONDS * 1000)
    const after = await read()

    report('polling', [
      {
        seconds: SECONDS,
        pollRequests: pollRequests.length,
        cpuTaskMsPerMin: ((after.task - before.task) * 1000 * 60) / SECONDS,
        cpuScriptMsPerMin: ((after.script - before.script) * 1000 * 60) / SECONDS,
        heapGrowthKB: (after.heap - before.heap) / 1024,
        domNodeGrowth: after.nodes - before.nodes,
      },
    ])
  } finally {
    await context.close()
  }
})
