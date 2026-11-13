import { defineConfig, devices } from '@playwright/test'

export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174)
export const API_PORT = Number(process.env.E2E_API_PORT ?? 8081)
// 性能テスト(npm run test:perf)は、開発サーバー(バンドルなし・未圧縮)ではなく本番ビルドを配信して計測する
export const PERF_WEB_PORT = Number(process.env.E2E_PERF_WEB_PORT ?? 5175)
const perfOnly = process.env.E2E_PERF === '1'

// 事前に `npm run db:up` で E2E 用 DB(5434)を起動しておく。バックエンドとフロントは webServer が起動する
// (開発サーバーとはポートが違うので共存できる)。
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
  },
  projects: [
    {
      name: 'functional',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /responsive\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      // 計測のブレを抑えるため直列。通常の `npm test` には含めない(npm run test:perf)
      name: 'perf',
      testMatch: /.*\.perf\.ts/,
      fullyParallel: false,
      workers: 1,
      timeout: 180_000,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, trace: 'off', baseURL: `http://localhost:${PERF_WEB_PORT}` },
    },
  ],
  webServer: [
    {
      command: 'node scripts/run-backend.mjs',
      url: `http://localhost:${API_PORT}/api/v3/api-docs`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore', // アクセスログが大量に出るので捨てる(起動失敗時は stderr に出る)
    },
    perfOnly
      ? {
          // 本番ビルドを作って配信する(/api は preview の proxy 設定=vite.config.ts の server.proxy でバックエンドへ中継)
          command: `npm run build && npx vite preview --port ${PERF_WEB_PORT} --strictPort`,
          cwd: '../frontend',
          url: `http://localhost:${PERF_WEB_PORT}/login`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
        }
      : {
          command: `npx vite --port ${WEB_PORT}`,
          cwd: '../frontend',
          url: `http://localhost:${WEB_PORT}/login`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
        },
  ],
})
