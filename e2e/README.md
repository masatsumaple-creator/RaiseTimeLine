# E2E テスト(Playwright)

ブラウザ → フロント(Vite)→ バックエンド(Spring Boot)→ PostgreSQL を通して、画面操作で検証する。
開発環境と干渉しないよう、**専用の DB とポート**で動く。

| 対象 | 開発 | E2E | 性能テスト |
|---|---|---|---|
| PostgreSQL | 5432 | **5434**(`raisetimeline_e2e`) | 同左 |
| バックエンド | 8080 | **8081** | 同左 |
| フロント | 5173(dev) | **5174**(dev) | **5175**(本番ビルドを `vite preview`) |

> 性能テストを開発サーバー(バンドルなし・未圧縮)で測ると、実際より大幅に遅く出る。そのため性能テストだけは本番ビルドを配信して計測する。

## 実行手順

```bash
cd e2e
npm install
npm run install:browser   # 初回のみ(chromium)
npm run db:up             # E2E 用 DB を起動(Docker が必要)

npm test                  # 機能・a11y・セキュリティ・セッション + モバイル(レスポンシブ)
npm run test:perf         # ブラウザ性能テスト(計測つき。通常の npm test には含めない)
npm run report            # 直近の HTML レポートを開く

npm run db:down           # 終わったら DB を削除(データごと)
```

バックエンドとフロントは Playwright の `webServer` が自動で起動する(既に動いていれば再利用)。
バックエンドの初回起動は Gradle のビルドで 1〜2 分かかる。画像(S3)は対象外なので `S3_BUCKET` は空で起動する。

その他: `npm run test:headed`(ブラウザを表示)、`npm run test:ui`(UI モード)、`npm run typecheck`。

## テストの構成

| ファイル | 内容 |
|---|---|
| `tests/auth.spec.ts` | 新規登録・ログイン・ログアウト、入力チェック、重複(409)、未ログイン時のリダイレクト |
| `tests/timeline-post.spec.ts` | 投稿・編集・削除、文字数、タブ、無限スクロール、新着バー |
| `tests/like-comment.spec.ts` | いいね、コメント投稿・削除、詳細画面 |
| `tests/follow-search-profile.spec.ts` | 検索、フォロー・解除、フォロー一覧、プロフィール編集 |
| `tests/session.spec.ts` | リロード復元、401 → 自動リフレッシュ、リフレッシュ失敗、複数ユーザー、通信断からの復旧 |
| `tests/security.spec.ts` | 認証ガード(401)、他人のデータ操作(403)、XSS、トークンの保存先、Cookie 属性、エラー形式 |
| `tests/a11y.spec.ts` | axe-core(WCAG 2.0/2.1 A・AA)で主要画面を検査、キーボード操作、フォーカス表示 |
| `tests/responsive.spec.ts` | モバイル(Pixel 7)の主要フロー、横スクロールなし、タップ領域 |
| `tests/performance/*.perf.ts` | 計測つきの性能テスト(下記) |

### テストデータ
- 各テストが API で**一意なユーザー**(ハンドルは `e2e_` 始まり)を作るので、並列実行でき、リセット不要。
- 実行前後に、`e2e_` で始まるユーザーを DB から削除する(`global-setup.ts` / `global-teardown.ts`。外部キーが CASCADE なので投稿等も消える)。残したいときは `E2E_KEEP_DATA=1`。
- 「全体」タブは並列に動く他のテストの投稿も流れてくる。そこで探す本文は `uniq()` で一意にし、`TimelinePage.findCard()` で続きを読み込みながら探す。

## 性能テスト

`npm run test:perf`。計測のブレを抑えるため直列(workers=1)。各ケースを `PERF_RUNS` 回(既定 5)実行し、**p75 が閾値以内**であることを検証する。

| ファイル | 計測内容 |
|---|---|
| `page-load.perf.ts` | ログイン画面・タイムライン再読み込みの TTFB / FCP / LCP / CLS / Long Task、ログイン送信 → タイムライン表示 |
| `interactions.perf.ts` | 投稿 → カード表示、いいね、タブ切替、検索(入力 → 結果)の応答時間 |
| `scroll-and-polling.perf.ts` | 無限スクロールの続き読み込み時間・DOM ノード数・JS ヒープ、5 分間の新着ポーリング回数(仮想時間) |

- 各ケースを **desktop** と **mobile-throttled**(CPU 4 倍遅く + Fast 3G 相当。閾値は 3 倍まで許容)で測る。
- 閾値は `perf-thresholds.ts` に集約。環境が遅いときは `PERF_THRESHOLD_SCALE=2` のように倍率で緩める。
- 結果は `results/<名前>.<プロファイル>.json`(gitignore 済み)とコンソール表に出る。
- 操作時間は Playwright 側の経過時間(`performance.now()`)で測るので、数 ms の誤差を含む。
- 補足: 既存の `perf/`(k6・EXPLAIN・負荷用 1000 ユーザーのブラウザ計測)は、負荷・性能の掘り下げ用で別物。ここは「画面が実用的な速さで動くか」の回帰検知用。

## 環境変数

| 変数 | 既定 | 用途 |
|---|---|---|
| `E2E_API_PORT` / `E2E_WEB_PORT` / `E2E_PERF_WEB_PORT` | 8081 / 5174 / 5175 | ポート |
| `E2E_DB_URL`(JDBC)/ `E2E_PG_URL`(掃除用) | 5434 の E2E DB | DB 接続先 |
| `E2E_KEEP_DATA` | なし | 1 で終了後のデータ掃除を行わない |
| `PERF_RUNS` | 5 | 性能テストの計測回数 |
| `PERF_THRESHOLD_SCALE` | 1 | 性能の閾値の倍率 |
