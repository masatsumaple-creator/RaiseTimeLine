import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 全テストの後(失敗・中断時も)に、ブラウザテストが作ったデータを perf DB から削除する。
 * コンテナが無い・停止中のときは何もしない。PERF_NO_CLEANUP=1 で無効化できる。
 */
export default function globalTeardown() {
  if (process.env.PERF_NO_CLEANUP) return
  const sql = readFileSync(join(__dirname, '..', '..', 'cleanup', 'run-data.sql'), 'utf8')
  try {
    execFileSync(
      'docker',
      ['exec', '-i', 'raisetimeline-perf-db', 'psql', '-U', 'raisetimeline', '-d', 'raisetimeline_perf', '-v', 'ON_ERROR_STOP=1'],
      { input: sql, stdio: ['pipe', 'ignore', 'inherit'] },
    )
    console.log('[teardown] テスト作成データを削除しました(cleanup/run-data.sql)')
  } catch {
    console.warn('[teardown] DB の後始末をスキップしました(perf DB が起動していない?)。必要なら perf/cleanup/cleanup.ps1 を実行してください')
  }
}
