#!/usr/bin/env node
// perf/results/ の結果(k6 の --summary-export JSON と Playwright の JSON)から Markdown レポートを作る。
// テストの再実行はしない。ホストに Node.js があれば動く(追加の依存なし)。
//
//   node perf/report.mjs                          # perf/results/report.md に出力
//   node perf/report.mjs --out docs/22_性能測定結果.md   # 出力先を指定(ベースラインとして残すときなど)
//   node perf/report.mjs --results <dir>          # 結果ディレクトリを指定
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const resultsDir = resolve(opt('--results', join(here, 'results')))
const outFile = resolve(opt('--out', join(resultsDir, 'report.md')))

// ---------- 共通 ----------
const K6_TESTS = [
  ['smoke', 'smoke(疎通確認)'],
  ['load', 'load(想定負荷)'],
  ['auth', 'auth(ログイン・リフレッシュ)'],
  ['stress', 'stress(限界探索)'],
  ['spike', 'spike(急増)'],
]
const ENDPOINT_LABELS = {
  timeline: 'タイムライン',
  timeline_new: '新着ポーリング',
  post_detail: '投稿詳細',
  comments: 'コメント一覧',
  search: 'ユーザー検索',
  profile: 'プロフィール',
  user_list: '投稿・フォロー一覧',
  write: '書き込み(投稿・いいね・フォロー・コメント)',
  login: 'ログイン',
  refresh: 'リフレッシュ',
}
const BROWSER_TESTS = [
  ['timeline', 'タイムライン(初回表示・無限スクロール)'],
  ['post-flow', '投稿・いいねの反映時間'],
  ['search', '検索(入力から結果表示まで)'],
  ['polling', '新着ポーリング放置時の負荷'],
]
const BROWSER_METRICS = {
  timeToFirstPost: ['最初の投稿が出るまで', 'ms'],
  scrollLoadAvg: ['スクロール 1 回の読み込み(平均)', 'ms'],
  scrollLoadMax: ['スクロール 1 回の読み込み(最大)', 'ms'],
  articles: ['表示した投稿数', '件'],
  ttfb: ['TTFB', 'ms'],
  fcp: ['FCP', 'ms'],
  lcp: ['LCP(目安 2500ms 未満)', 'ms'],
  cls: ['CLS(目安 0.1 未満)', ''],
  longTaskCount: ['Long Task 件数', '件'],
  longTaskTotalMs: ['Long Task 合計', 'ms'],
  maxInteractionMs: ['操作の最大遅延(INP の近似。目安 200ms 未満)', 'ms'],
  transferKB: ['転送量', 'KB'],
  requests: ['リクエスト数', '件'],
  jsHeapMB: ['JS ヒープ', 'MB'],
  jankFrames: ['50ms 超のフレーム数', '件'],
  postToVisible: ['投稿 → 一覧に表示', 'ms'],
  likeToggle1: ['いいね 1 回目 → 反映', 'ms'],
  likeToggle2: ['いいね 2 回目(取り消し)→ 反映', 'ms'],
  searchToResultAvg: ['入力 → 結果表示(デバウンス込み)', 'ms'],
  seconds: ['放置時間', '秒'],
  pollRequests: ['ポーリング回数', '回'],
  cpuTaskMsPerMin: ['CPU 時間(全タスク)', 'ms/分'],
  cpuScriptMsPerMin: ['CPU 時間(スクリプト)', 'ms/分'],
  heapGrowthKB: ['JS ヒープの増減', 'KB'],
  domNodeGrowth: ['DOM ノード数の増減', '個'],
}

const read = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''))
const mtime = (path) => statSync(path).mtime
const fmt = (n, digits = 1) => (Number.isInteger(n) ? String(n) : n.toFixed(digits))
const dateStr = (d) => d.toLocaleString('ja-JP', { hour12: false })
// numeric: true なら 2 列目以降を右寄せ(数値の表)
const table = (header, rows, numeric = true) =>
  [
    `| ${header.join(' | ')} |`,
    `|${header.map((_, i) => (i > 0 && numeric ? '---:' : '---')).join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n')

// 過去のバージョンで出力していた指標(古い結果 JSON に残っていても表示しない)
const LEGACY_METRICS = new Set(['searchToResultNetAvg'])

// k6 の thresholds: 古い形式は「失敗したか(boolean)」、新しい形式は { ok: boolean }
function thresholdFailed(value) {
  return typeof value === 'object' && value !== null ? !value.ok : Boolean(value)
}

// ---------- k6 ----------
function k6Section(file, title) {
  const path = join(resultsDir, `${file}.json`)
  if (!existsSync(path)) return null
  const metrics = read(path).metrics ?? {}
  const lines = [`### ${title}`, '', `実行: ${dateStr(mtime(path))} / 結果: \`${file}.json\``, '']

  const failedThresholds = []
  const rows = []
  for (const [key, label] of Object.entries(ENDPOINT_LABELS)) {
    const m = metrics[`http_req_duration{endpoint:${key}}`]
    // サンプルが無いエンドポイント(全部 0)は載せない
    if (!m || (m.avg === 0 && m.max === 0)) continue
    const th = Object.entries(m.thresholds ?? {})
    const failed = th.filter(([, v]) => thresholdFailed(v)).map(([k]) => k)
    failedThresholds.push(...failed.map((k) => `${label}: ${k}`))
    const verdict = th.length === 0 ? '-' : failed.length === 0 ? `✅ ${th.map(([k]) => k).join(', ')}` : `❌ ${failed.join(', ')}`
    rows.push([label, fmt(m.avg), fmt(m.med), fmt(m['p(90)']), fmt(m['p(95)']), fmt(m.max), verdict])
  }
  if (rows.length > 0) {
    lines.push('応答時間(ms)', '', table(['エンドポイント', '平均', '中央値', 'p90', 'p95', '最大', '基準(p95)'], rows), '')
  }

  const reqs = metrics.http_reqs
  const failedRate = metrics.http_req_failed
  const checks = metrics.checks
  const vus = metrics.vus
  const summary = []
  if (reqs) summary.push(`リクエスト数 ${reqs.count}(${fmt(reqs.rate)} 件/秒)`)
  if (vus) summary.push(`最大 VU ${vus.max}`)
  if (failedRate) summary.push(`エラー率 ${fmt((failedRate.value ?? 0) * 100, 2)}%(${failedRate.passes ?? 0} 件)`)
  if (checks) summary.push(`チェック成功率 ${fmt((checks.value ?? 0) * 100, 1)}%(${checks.fails ?? 0} 件失敗)`)
  if (summary.length > 0) lines.push(summary.map((s) => `- ${s}`).join('\n'), '')

  // 全体の合否: 閾値が 1 つでも失敗していれば不合格
  const allThresholds = Object.entries(metrics).flatMap(([name, m]) => Object.entries(m.thresholds ?? {}).map(([k, v]) => [name, k, v]))
  const failedAll = allThresholds.filter(([, , v]) => thresholdFailed(v))
  const verdict = allThresholds.length === 0 ? '閾値なし' : failedAll.length === 0 ? '✅ 全ての閾値を満たした' : `❌ 閾値を満たさなかった: ${failedAll.map(([n, k]) => `${n} ${k}`).join(' / ')}`
  lines.push(`**判定: ${verdict}**`, '')
  return { text: lines.join('\n'), verdict: failedAll.length === 0 ? 'ok' : 'ng', file }
}

// ---------- ブラウザ ----------
function browserSections() {
  const dir = join(resultsDir, 'browser')
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  const out = []
  for (const [name, title] of BROWSER_TESTS) {
    for (const f of files.filter((f) => f.startsWith(`${name}.`)).sort()) {
      const data = read(join(dir, f))
      const rows = Object.entries(data.summary)
        .filter(([k]) => !LEGACY_METRICS.has(k))
        .map(([k, v]) => {
          const [label, unit] = BROWSER_METRICS[k] ?? [k, '']
          const u = unit ? ` ${unit}` : ''
          // 単位のない指標(CLS)は 0.05 のような小さい値なので小数 3 桁で出す
          const d = unit === '' ? 3 : 1
          return [label, `${fmt(v.median, d)}${u}`, `${fmt(v.p75, d)}${u}`, `${fmt(v.max, d)}${u}`]
        })
      out.push(
        [
          `### ${title}(${data.profile})`,
          '',
          `実行: ${dateStr(mtime(join(dir, f)))} / ${data.runs} 回分 / 結果: \`browser/${f}\``,
          '',
          table(['指標', '中央値', 'p75', '最大'], rows),
          '',
        ].join('\n'),
      )
    }
  }
  return out
}

// ---------- 組み立て ----------
const k6 = K6_TESTS.map(([f, t]) => k6Section(f, t)).filter(Boolean)
const browser = browserSections()

if (k6.length === 0 && browser.length === 0) {
  console.error(`結果が見つかりません: ${resultsDir}\n先に k6 / Playwright を実行してください(perf/README.md)`)
  process.exit(1)
}

const md = [
  '# パフォーマンステスト結果',
  '',
  `作成: ${dateStr(new Date())}(\`node perf/report.mjs\` で \`${resultsDir.replace(/\\/g, '/')}\` から生成)`,
  '',
  '## 読むときの注意',
  '',
  '- 計測は負荷生成側と対象アプリが同じ PC で行ったもので、**絶対値は参考値**。変更前後の比較に使う',
  '- 実行条件(VU 数・実行時間・回数・シードの規模)は各結果の実行時の指定による。README の既定値と異なる場合がある',
  '- API の p95 の合格基準は `docs/21_ログ設計と閾値.md` のスロー閾値(認証 1000ms / 一覧系 500ms / その他 300ms)とエラー率 1% 未満',
  '',
  '## 結果の一覧',
  '',
  table(
    ['種別', '結果'],
    [
      ...k6.map((s) => [s.file, s.verdict === 'ok' ? '✅ 閾値を満たした' : '❌ 閾値を満たさなかった']),
      ...(browser.length > 0 ? [['browser', `${browser.length} 件の計測結果(下記)`]] : []),
    ],
    false,
  ),
  '',
  ...(k6.length > 0 ? ['## API 負荷(k6)', '', ...k6.map((s) => s.text)] : []),
  ...(browser.length > 0 ? ['## ブラウザ実行(Playwright)', '', ...browser] : []),
].join('\n')

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, md + '\n', 'utf8')
console.log(`レポートを出力しました: ${outFile}`)
