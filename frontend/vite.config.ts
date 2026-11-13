import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // ポートは固定運用(競合時は別ポートへ逃げず、掴んでいるプロセスを止める)
    port: 5173,
    strictPort: true,
    // 開発時も本番(ALB 配下の同一オリジン)と同じ構成にするため、/api をバックエンドへ中継する。
    // これで CORS 設定が不要になり、Path=/api/auth の Cookie もそのまま届く
    proxy: {
      // E2E テストは専用ポートのバックエンドへ向けるため、環境変数で差し替えられる(既定は 8080)
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
