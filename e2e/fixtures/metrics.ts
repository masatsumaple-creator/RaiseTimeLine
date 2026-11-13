import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Browser, type BrowserContext, type CDPSession, type Page } from '@playwright/test'
import { threshold, type ThresholdKey } from '../perf-thresholds'
import { Api } from './api'
import { loginViaUi } from './index'

export const RESULTS_DIR = join(__dirname, '..', 'results')
export const RUNS = Number(process.env.PERF_RUNS ?? 5)

export interface WebVitals {
  ttfb: number
  fcp: number
  lcp: number
  cls: number
  longTaskCount: number
  longTaskTotal: number
  domNodes: number
  heapMB: number
}

/** ページ読み込み前に呼ぶ。LCP / CLS / Long Task を記録するオブザーバを仕込む。 */
export async function installObservers(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __perf: { lcp: number; cls: number; longTasks: number[] } }
    const perf = { lcp: 0, cls: 0, longTasks: [] as number[] }
    w.__perf = perf
    const observe = (type: string, cb: (e: PerformanceEntry) => void) => {
      try {
        new PerformanceObserver((list) => list.getEntries().forEach(cb)).observe({ type, buffered: true })
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
  })
}

/** 現在のページから Web Vitals 系の指標を回収する。 */
export async function collectVitals(page: Page): Promise<WebVitals> {
  return page.evaluate(() => {
    const perf = (window as unknown as { __perf: { lcp: number; cls: number; longTasks: number[] } }).__perf
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    return {
      ttfb: nav ? nav.responseStart : 0,
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
      lcp: perf.lcp,
      cls: perf.cls,
      longTaskCount: perf.longTasks.length,
      longTaskTotal: perf.longTasks.reduce((s, d) => s + d, 0),
      domNodes: document.getElementsByTagName('*').length,
      heapMB: mem ? mem.usedJSHeapSize / 1024 / 1024 : 0,
    }
  })
}

export interface Profile {
  name: 'desktop' | 'mobile-throttled'
  /** 閾値に掛ける倍率 */
  scale: number
}

export const DESKTOP: Profile = { name: 'desktop', scale: 1 }
// CPU 4 倍遅く + Fast 3G 相当。モバイル端末の目安なので、閾値は 3 倍まで許容する
export const MOBILE: Profile = { name: 'mobile-throttled', scale: 3 }

async function applyProfile(context: BrowserContext, page: Page, profile: Profile): Promise<CDPSession> {
  const cdp = await context.newCDPSession(page)
  if (profile.name === 'mobile-throttled') {
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

/** 1 回ごとに新しいコンテキスト(キャッシュ・Cookie なし)で、ログイン済みのページを作って fn を実行する。 */
export async function withFreshSession<T>(
  browser: Browser,
  user: Api,
  profile: Profile,
  fn: (page: Page, cdp: CDPSession) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP' })
  try {
    const page = await context.newPage()
    await installObservers(page)
    await loginViaUi(page, user.user.email) // ログインは計測対象外(スロットリング前に済ませる)
    const cdp = await applyProfile(context, page, profile)
    return await fn(page, cdp)
  } finally {
    await context.close()
  }
}

/** action を実行し、done が満たされるまでの時間(ms)を返す。 */
export async function timeIt(action: () => Promise<unknown>, done: () => Promise<unknown>): Promise<number> {
  const start = performance.now()
  await action()
  await done()
  return performance.now() - start
}

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]

export interface Summary {
  median: number
  p75: number
  min: number
  max: number
}

/** 数値指標ごとに median / p75 / min / max を出す。 */
export function summarize(runs: Record<string, number>[]): Record<string, Summary> {
  const out: Record<string, Summary> = {}
  for (const key of Object.keys(runs[0] ?? {})) {
    const values = runs.map((r) => r[key]).sort((a, b) => a - b)
    out[key] = { median: percentile(values, 50), p75: percentile(values, 75), min: values[0], max: values[values.length - 1] }
  }
  return out
}

/** results/<name>.<profile>.json に保存し、コンソールにも表で出す。 */
export function report(name: string, profile: Profile, runs: Record<string, number>[]) {
  const summary = summarize(runs)
  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(
    join(RESULTS_DIR, `${name}.${profile.name}.json`),
    JSON.stringify({ name, profile: profile.name, runs: runs.length, summary, raw: runs }, null, 2),
  )
  const rows = Object.fromEntries(
    Object.entries(summary).map(([k, v]) => [k, { median: +v.median.toFixed(1), p75: +v.p75.toFixed(1), max: +v.max.toFixed(1) }]),
  )
  console.log(`\n[${name}] profile=${profile.name} runs=${runs.length}`)
  console.table(rows)
  return summary
}

/** 指標の p75 が閾値以内であることを確認する。 */
export function expectWithin(summary: Record<string, Summary>, metric: string, key: ThresholdKey, profile: Profile) {
  const limit = threshold(key, profile.scale)
  expect(summary[metric].p75, `${metric} の p75 が閾値 ${limit} を超えた`).toBeLessThanOrEqual(limit)
}

/** 計測用データ: 本人 + フォロー先 5 人(各 12 件)+ 本人 10 件の投稿 = フォロー中タブに 70 件。 */
export async function seedHeavyTimeline(): Promise<Api> {
  const me = await Api.signup('perf')
  const friends = await Promise.all(Array.from({ length: 5 }, (_, i) => Api.signup(`perff${i}`)))
  for (const f of friends) await me.follow(f.user.handle)
  await Promise.all(friends.map((f) => f.postMany(12, `${f.user.displayName} の投稿`)))
  await me.postMany(10, '自分の投稿')
  await Promise.all(friends.map((f) => f.dispose()))
  return me
}
