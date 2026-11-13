# Lighthouse・バンドルサイズの計測(フロント静的指標)

本番ビルドに対して計測する(開発サーバーは未最適化なので不向き)。perf DB を向いたバックエンドと、シード済みデータを前提にする。

## 手順

```powershell
cd frontend
npm run build                                           # dist/ のサイズを確認(下記)
npx vite preview --port 5173 --strictPort               # 本番ビルドを 5173 で配信(/api は 8080 へ中継)
```

別のターミナルで(ログインが要る画面は、先にブラウザでログインした状態の Cookie が必要なため、
ログイン画面と、ログイン後の画面で分ける):

```powershell
# 1) 未ログイン画面(ログイン): そのまま計測できる
npx lighthouse http://localhost:5173/login --preset=desktop --output=json --output=html --output-path=../perf/results/lighthouse-login --chrome-flags="--headless=new"

# 2) ログイン後の画面(タイムライン等): chrome-devtools MCP の lighthouse_audit か、
#    Playwright(perf/browser)の計測値(LCP / CLS / INP など)を使う
```

モバイル相当は `--preset=desktop` を外す(既定がモバイル + Slow 4G 相当)。

## バンドルサイズ

`npm run build` の出力(`dist/assets/*.js` の gzip 後サイズ)を記録する。目安として、増えたら理由を確認する。

| 日付 | JS (gzip) | CSS (gzip) | メモ |
|---|---|---|---|
| 2026-11-13 | 94.9 kB | 2.6 kB | ベースライン(コード分割なし) |

## 見るポイント

- Performance スコア、LCP / TBT / CLS
- 「未使用の JavaScript」の削減量(ルート単位のコード分割の余地)
- 画像の遅延読み込み・サイズ(S3 の署名付き URL の画像)
