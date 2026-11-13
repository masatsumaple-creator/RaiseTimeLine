import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser, BrowserContext, CDPSession, Page } from '@playwright/test'

export const RESULTS_DIR = join(__dirname, '..', '..', 'results', 'browser')

export const RUNS = Number(process.env.PERF_RUNS ?? 5)
export const PASSWORD = process.env.PERF_PASSWORD ?? 'PerfTest1234'
export const USERS = Number(process.env.USERS ?? 1000)

// desktop: 制限なし / mobile: CPU 4 倍遅く + Fast 3G 相当(モバイル端末の目安)
export const PROFILE = (process.env.PERF_PROFILE ?? 'desktop') as 'desktop' | 'mobile'

export interface PageMetrics {
  ttfb: number
  fcp: number
  lcp: number
  cls: number
  longTaskCount: number
  longTaskTotalMs: number
  /** 操作から次の描画までの最長(INP の近似) */
  maxInteractionMs: number
  transferKB: number
  requests: number
  jsHeapMB: number
}

/** ページ読み込み前に呼ぶ。LCP / CLS / Long Task / 操作遅延 / フレーム落ちを記録するオブザーバを仕込む。 */
export async function installObservers(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __perf: Record<string, unknown> }
    const perf = { lcp: 0, cls: 0, longTasks: [] as number[], interactions: [] as number[], frames: [] as number[] }
    w.__perf = perf
    const observe = (type: string, cb: (e: PerformanceEntry) => void, extra: object = {}) => {
      try {
        new PerformanceObserver((list) => list.getEntries().forEach(cb)).observe({ type, buffered: true, ...extra } as PerformanceObserverInit)
      } catch {
        /* 未対応の種別は無視 */
      }
    }
    observe('largest-contentful-paint', (e) => {
      perf.lcp = e.startTime
    })
    observe('layout-shift', (e) => {
      const shift = e as PerformanceEntry & { value: number; hadRecentInput: boolean }
      if (!shift.hadRecentInput) perf.cls += shift.value
    })
    observe('longtask', (e) => {
      perf.longTasks.push(e.duration)
    })
    observe(
      'event',
      (e) => {
        perf.interactions.push(e.duration)
      },
      { durationThreshold: 16 },
    )
    // フレーム間隔(50ms 超えをカクつきとして数える)
    let last = performance.now()
    const tick = (now: number) => {
      perf.frames.push(now - last)
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** 現在のページから指標を回収する。 */
export async function collect(page: Page): Promise<PageMetrics & { jankFrames: number }> {
  return page.evaluate(() => {
    const perf = (window as unknown as { __perf: { lcp: number; cls: number; longTasks: number[]; interactions: number[]; frames: number[] } }).__perf
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const transfer = resources.reduce((s, r) => s + r.transferSize, 0) + (nav?.transferSize ?? 0)
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    return {
      ttfb: nav ? nav.responseStart : 0,
      fcp,
      lcp: perf.lcp,
      cls: perf.cls,
      longTaskCount: perf.longTasks.length,
      longTaskTotalMs: perf.longTasks.reduce((s, d) => s + d, 0),
      maxInteractionMs: perf.interactions.reduce((m, d) => Math.max(m, d), 0),
      transferKB: transfer / 1024,
      requests: resources.length + 1,
      jsHeapMB: mem ? mem.usedJSHeapSize / 1024 / 1024 : 0,
      jankFrames: perf.frames.filter((d) => d > 50).length,
    }
  })
}

/** CPU / ネットワークのスロットリング(PERF_PROFILE=mobile のとき)。CDP セッションを返す。 */
export async function applyProfile(context: BrowserContext, page: Page): Promise<CDPSession> {
  const cdp = await context.newCDPSession(page)
  if (PROFILE === 'mobile') {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
  }
  return cdp
}

/** UI からログインする(計測対象外)。 */
export async function loginViaUi(page: Page, n: number) {
  await page.goto('/login')
  await page.locator('#email').fill(`perf_user_${n}@perf.example.test`)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: 'ログイン' }).click()
  await page.waitForURL((url) => url.pathname === '/')
}

/** 1 回ごとに新しいコンテキスト(キャッシュ・Cookie なし)を作って fn を実行する。 */
export async function withFreshPage<T>(browser: Browser, userIndex: number, fn: (page: Page, cdp: CDPSession) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await installObservers(page)
    const cdp = await applyProfile(context, page)
    await loginViaUi(page, userIndex)
    return await fn(page, cdp)
  } finally {
    await context.close()
  }
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]

/** 数値指標ごとに median / p75 / min / max を出す。 */
export function summarize(runs: Record<string, number>[]) {
  const out: Record<string, { median: number; p75: number; min: number; max: number }> = {}
  for (const key of Object.keys(runs[0] ?? {})) {
    const values = runs.map((r) => r[key]).sort((a, b) => a - b)
    out[key] = {
      median: percentile(values, 50),
      p75: percentile(values, 75),
      min: values[0],
      max: values[values.length - 1],
    }
  }
  return out
}

/** results/browser/<name>.<profile>.json に保存し、コンソールにも表で出す。 */
export function report(name: string, runs: Record<string, number>[]) {
  const summary = summarize(runs)
  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(
    join(RESULTS_DIR, `${name}.${PROFILE}.json`),
    JSON.stringify({ name, profile: PROFILE, runs: runs.length, summary, raw: runs }, null, 2),
  )
  const rows = Object.fromEntries(
    Object.entries(summary).map(([k, v]) => [k, { median: +v.median.toFixed(1), p75: +v.p75.toFixed(1), max: +v.max.toFixed(1) }]),
  )
  console.log(`\n[${name}] profile=${PROFILE} runs=${runs.length}`)
  console.table(rows)
  return summary
}
