import { defineConfig } from '@playwright/test'

// 計測のブレを抑えるため直列・リトライなし。トレースは計測に影響するので PERF_TRACE=1 のときだけ取る。
// 事前に perf DB を向いたバックエンド(8080)と、フロント(5173: npm run dev か build + preview)を起動しておく。
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.perf\.ts/,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  outputDir: './test-results',
  globalTeardown: './lib/global-teardown.ts',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    headless: true,
    trace: process.env.PERF_TRACE ? 'on' : 'off',
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
