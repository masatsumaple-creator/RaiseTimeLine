// Playwright の webServer から呼ぶ。E2E 専用の DB・ポートでバックエンドを起動する(Windows / Unix 両対応)。
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const backendDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'backend')
const win = process.platform === 'win32'
// shell 経由で起動する(Windows は .\gradlew.bat。引数を渡さず 1 本のコマンド文字列にして、警告も避ける)
const child = spawn(win ? '.\\gradlew.bat bootRun' : './gradlew bootRun', {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    SERVER_PORT: process.env.E2E_API_PORT ?? '8081',
    DB_URL: process.env.E2E_DB_URL ?? 'jdbc:postgresql://localhost:5434/raisetimeline_e2e',
    // 画像(S3)は E2E の対象外。バケット未設定のまま(アップロードは 503)にする
    S3_BUCKET: '',
  },
})
const stop = () => child.kill()
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
child.on('exit', (code) => process.exit(code ?? 0))
