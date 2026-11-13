# パフォーマンステスト

任意のタイミングで手動実行するテスト一式。通常のテスト(`./gradlew test` / `npm test`)には含まれず、CI にも載せていない。

| 層 | ツール | 何を測るか | 場所 |
|---|---|---|---|
| API 負荷 | k6 | 各 API の応答時間(p95)・エラー率・限界点 | `k6/` |
| DB | EXPLAIN | 主要クエリのインデックス利用・読み取り量 | `db/explain.sql` |
| ブラウザ実行 | Playwright | LCP / CLS / Long Task / スクロール・投稿・検索の体感時間 | `browser/` |
| フロント静的 | Lighthouse・ビルドサイズ | スコア・バンドルサイズ | `frontend/lighthouse.md` |

## 前提

- Docker(perf 用 PostgreSQL と、ローカルに k6 が無い場合の k6 実行に使う)
- Node.js(Playwright)
- ホストに `psql` / `k6` は不要。`k6` がインストール済みならそちらを使う
- 計測はローカル同居(負荷生成側と対象が同じ PC)なので、**絶対値より変更前後の比較**に使う

## 安全のしくみ

- perf 用 DB は開発用(5432)とは別コンテナ・別ボリューム(**5433**、DB 名 `raisetimeline_perf`)
- シード・リセット・クリーンアップの SQL は、接続先 DB 名が `raisetimeline_perf` でなければ中断する
- k6 は実行前に `perf_user_1` でログインできるか確認し、シード済みの環境以外では中断する
- テストが作るデータは目印付き(投稿・コメントの本文が `[perf-run]` で始まる / ユーザーは `perf_` 接頭辞)で、いいね・フォローは付けて外して差し引き 0 にする

## 手順

PowerShell で、リポジトリのルートから実行する。

### 1. 準備(初回)

```powershell
./perf/db.ps1 up                      # perf 用 PostgreSQL を起動(5433)
```

バックエンドを perf DB に向けて起動する(**開発用バックエンドと同じ 8080 を使うので、先に止める**)。初回起動で Flyway がスキーマを作る。

```powershell
cd backend
$env:DB_URL = 'jdbc:postgresql://localhost:5433/raisetimeline_perf'
./gradlew bootRun
```

シードを投入する(`perf_user_1`〜、パスワード `PerfTest1234`)。

```powershell
./perf/db.ps1 seed                    # small: users 1,000 / posts 100,000 / likes 約20万 / comments 10万(約 10 秒)
./perf/db.ps1 seed -Scale large       # large: users 10,000 / posts 1,000,000
```

### 2. API 負荷(k6)

```powershell
./perf/k6.ps1 smoke                   # 疎通(30 秒)。まずこれが通ることを確認
./perf/k6.ps1 load                    # 想定負荷(20 VU、約 10 分)。p95 とエラー率で合否
./perf/k6.ps1 load -Vus 50 -Hold 5m   # 規模を変える
./perf/k6.ps1 stress                  # 段階的に 150 VU まで。劣化点を探す(合否ではない)
./perf/k6.ps1 spike                   # 急増と回復
./perf/k6.ps1 auth                    # ログイン(BCrypt)の負荷
./perf/k6.ps1 load -Cleanup           # 実行後にテスト作成データも削除
./perf/k6.ps1 load -Users 10000 -Posts 1000000    # large シードのとき(件数を合わせる)
```

結果の JSON は `perf/results/<名前>.json`。合格基準は `docs/21_ログ設計と閾値.md` のスロー閾値(`k6/lib/config.js` の `P95`)。

- ログイン 1000ms / リフレッシュ 1000ms
- タイムライン・コメント・検索・ユーザー一覧 500ms
- 新着ポーリング・投稿詳細・プロフィール・書き込み 300ms
- エラー率 1% 未満

混合シナリオ(`k6/lib/scenario.js`)の比率は、タイムライン 40 / 新着ポーリング 20 / 投稿詳細 15 / 検索 10 / プロフィール 8 / 書き込み 7。

### 3. DB(EXPLAIN)

```powershell
./perf/db.ps1 explain
```

大きいテーブル(posts / likes / comments / follows)で `Seq Scan` が出ていないか、`Buffers: shared read` が極端に多くないかを見る。

### 4. ブラウザ実行(Playwright)

フロントを本番ビルドで配信する(`/api` は 8080 へ中継される)。

```powershell
cd frontend
npm run build
npx vite preview --port 5173 --strictPort
```

別のターミナルで:

```powershell
cd perf/browser
npm install                           # 初回のみ
npx playwright install chromium       # 初回のみ
npm run perf                          # デスクトップ(制限なし)
npm run perf:mobile                   # CPU 4 倍遅く + Fast 3G 相当
npx playwright test timeline          # 1 つだけ
```

- 5 回(`PERF_RUNS`)の中央値・p75 を `perf/results/browser/<名前>.<プロファイル>.json` に保存し、コンソールにも表示する
- 計測するのは、タイムライン(初回表示・無限スクロール)/ 投稿・いいね / 検索 / 新着ポーリング放置時の負荷(既定 65 秒)
- 終了時(失敗・中断時も)に `cleanup/run-data.sql` が自動で走る(`PERF_NO_CLEANUP=1` で無効)
- トレースが要るときだけ `PERF_TRACE=1`(計測に影響するので通常は off)
- 目安(Core Web Vitals "good"): LCP < 2.5s / INP < 200ms / CLS < 0.1

**k6 の負荷をかけながらブラウザを計測する**(サーバーが忙しいときの体感を見る)場合は、k6 を別ターミナルで先に流しておく。この場合、終了時のクリーンアップは k6 の `-Cleanup` と Playwright の両方で行われる。

### 5. Lighthouse・バンドルサイズ

`frontend/lighthouse.md` を参照。

## 後始末

| やりたいこと | コマンド |
|---|---|
| テストが作ったデータだけ消す(シード直後に戻す) | `./perf/cleanup/cleanup.ps1` |
| シードも含め全データを消す(再シードが必要) | `./perf/cleanup/cleanup.ps1 -Reset` |
| 古い成果物を消す(7 日より前) | `./perf/cleanup/cleanup.ps1 -PruneResults 7` |
| 8080(backend)・5173(frontend)のプロセスを止める | `./perf/cleanup/cleanup.ps1 -StopApps` |
| perf DB のコンテナとボリュームごと完全削除 | `./perf/cleanup/cleanup.ps1 -DestroyAll` |

`-StopApps` は 8080 / 5173 を掴んでいるプロセスをすべて止める。開発中のサーバーが動いているときは付けない。

perf 用でない DB に `perf_` ユーザーが紛れ込んだ場合は、`cleanup/cleanup.sql` が `perf_` ユーザーとその関連データだけを削除する(DB 名のガードは付けていないので、接続先に注意して手で実行する)。

## 結果の読み方・注意

- `load` は想定負荷での合否、`stress` は崩れ始める VU 数を見るためのもの
- バックエンドの構造化ログ(`RequestLoggingFilter` の `durationMs`)と突き合わせると、サーバー側の処理時間と、ネットワーク・クライアント側の時間を切り分けられる
- Actuator が無いため JVM・コネクションプールの指標は取れない
- 負荷生成と対象が同じ PC なので、CPU を取り合う。大きい VU 数での絶対値は参考程度に
- AWS 構成を作った場合は、`-BaseUrl` を差し替えて同じスクリプトを流用できる(その環境にも perf のシードが要る)
