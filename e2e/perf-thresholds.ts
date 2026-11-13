// ブラウザ性能テストの閾値(ミリ秒。特記のあるものを除く)。判定は複数回計測の p75 に対して行う。
// 環境(CPU・ノートPC・バックエンドの起動直後など)で揺れるので、PERF_THRESHOLD_SCALE=2 のように倍率で緩められる。
const scale = Number(process.env.PERF_THRESHOLD_SCALE ?? 1)

const base = {
  // ページ読み込み(Web Vitals の目安: LCP 良好 2500ms 以内 / CLS 0.1 以下)
  ttfb: 800,
  fcp: 1800,
  lcp: 2500,
  cls: 0.1,
  /** 計測中の Long Task(50ms 超)の合計。メインスレッドのブロッキング時間の目安 */
  longTaskTotal: 400,
  /** ログイン画面を開いてから、フォームが操作可能になるまで */
  loginPageReady: 1500,
  /** ログイン送信から、タイムライン(投稿カード)が描画されるまで */
  loginToTimeline: 2500,
  /** タイムラインを再読み込みしてから、最初の投稿カードが描画されるまで(リフレッシュ + 取得 + 描画) */
  timelineReady: 2500,
  /** 投稿ボタンを押してから、先頭にカードが出るまで */
  postToCard: 1000,
  /** いいねを押してから、aria-pressed が変わるまで(楽観的更新なので速いはず) */
  like: 300,
  /** タブ切替から、新しい一覧の描画まで */
  tabSwitch: 1000,
  /** 検索語の入力から結果表示まで(デバウンス 300ms を含む) */
  search: 1500,
  /** 無限スクロールで、次の 20 件が描画されるまで */
  scrollPage: 1500,
  /** 3 ページ分読み込んだ後の DOM ノード数 */
  domNodes: 6000,
  /** 3 ページ分読み込んだ後の JS ヒープ(MB) */
  heapMB: 80,
  /** 5 分間(30 秒間隔)の新着ポーリングの呼び出し回数の上限 */
  pollingCalls: 12,
}

export type ThresholdKey = keyof typeof base

/** 閾値を取り出す。extra は環境ごとの倍率(モバイルのスロットリング時など)。cls と回数・個数は倍率の対象外。 */
export function threshold(key: ThresholdKey, extra = 1): number {
  const fixed: ThresholdKey[] = ['cls', 'domNodes', 'heapMB', 'pollingCalls']
  return fixed.includes(key) ? base[key] : base[key] * scale * extra
}
