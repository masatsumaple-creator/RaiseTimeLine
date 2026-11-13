---
name: dev-server-startup
description: Start this project's backend (Spring Boot), frontend (Vite), and PostgreSQL dev servers on their fixed default ports, resolving port conflicts by stopping the conflicting process instead of switching ports. Use whenever asked to start/run/launch the app, verify it works, or restart a server after a code change.
---

# Dev Server Startup（デフォルトポート固定運用）

このプロジェクトのdevサーバーは、必ず以下のデフォルトポートで起動する。

| サーバー | デフォルトポート | 起動コマンド |
| --- | --- | --- |
| PostgreSQL (docker-compose) | 5432 | `docker compose up -d db`（リポジトリ直下） |
| Spring Boot backend | 8080 | `./gradlew bootRun`（`backend/`） |
| Vite frontend | 5173 | `npm run dev`（`frontend/`、事前に`npm install`） |

## ルール：ポート競合時は「別ポートに逃げない」

起動しようとしたポートが既に別プロセスに使用されている場合、`vite.config.ts`のポート変更や`--server.port`指定などで別番号に切り替えて起動してはならない。
必ず次の手順を踏むこと：

1. 対象ポートを使用しているプロセスを特定する。
2. そのプロセスを停止する。
3. 改めてデフォルトポートでサーバーを起動し直す。

**理由:** ポート番号は複数箇所にハードコードされた前提として使われている。
- フロントエンド: `frontend/.env.local` の `VITE_API_BASE_URL`（デフォルト `http://localhost:8080`）
- バックエンド: CORS設定は持たない。開発時は Vite の `/api` プロキシ（target `http://localhost:8080`）で同一オリジン化し、本番（CloudFront 配下の同一オリジン）と同じ挙動にする
- DB接続: `.env.example` / `backend/src/main/resources/application.yml` の `localhost:5432`

ここでポート番号がずれると、API疎通失敗やDB接続エラーなど、コードとは無関係な原因で動作確認が壊れる。したがって「空いているポートを探して使う」のではなく「デフォルトポートを空ける」方針を取る。

## 手順（Windows / PowerShell）

```powershell
# 1. 対象ポート（例: 8080）を使用しているプロセスのPIDを確認
Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess

# 2. そのPIDを停止
Stop-Process -Id <PID> -Force

# 3. デフォルトポートで起動し直す
cd backend
.\gradlew.bat bootRun
```

frontend（5173）、PostgreSQL（5432）についても同様に、`Get-NetTCPConnection -LocalPort <port>` でプロセスを特定し、`Stop-Process` で停止してから起動し直す。

5432 を別プロジェクトの Docker コンテナが掴んでいる場合、`Get-NetTCPConnection` に出るのは `com.docker.backend` / `wslrelay` で、プロセスを殺しても解決しない。`docker ps` で該当コンテナを特定し `docker stop <名前>` で止める（他プロジェクトのコンテナなので、止める前にユーザーに確認する）。ポート公開に失敗して作られたコンテナはポートが空のまま残るため、`docker compose up -d --force-recreate db` で作り直す。

## 起動確認

起動後は以下で疎通確認する。

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/auth/me
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/v3/api-docs
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```

backend は未ログインの `/api/auth/me` が `401`（サーバーが応答している印）、`/api/v3/api-docs`（API 仕様の JSON）が `200`（ログイン不要）、frontend は `200` が返ることを確認する。バックグラウンドで起動する場合はログ（stdout/stderr）を監視し、`Started BackendApplication`（backend）や起動完了ログ（frontend）を確認してから疎通チェックに進む。

## 関連

- 起動中の backend は、DB が起動していないと Flyway の接続エラーで終了する。先に `docker compose up -d db` を実行する
- `JWT_SECRET`（32バイト以上）が未設定だと backend は起動しない。`./gradlew bootRun` は未設定のときだけ開発用の既定値を渡す（`backend/build.gradle`）。`java -jar` などで起動するときは環境変数で渡す
- 画像（アイコン）を実際の S3 で試すときだけ、`S3_BUCKET=<バケット名> ./gradlew bootRun` のように、バケット名を環境変数で渡す（未設定なら画像機能は無効で、アップロードは 503）。認証情報は `~/.aws` のプロファイル `raisetimeline-dev`（`bootRun` が既定で使う）。バケット名と手順は README の「ローカルで画像（S3）を使う」を参照
- API の確認は Swagger UI（`http://localhost:8080/api/swagger-ui.html`）で行える。backend だけの起動で開ける（frontend は不要）。右上の Authorize に、signup / login で得た `accessToken` を入れると、認証が必要な API も試せる。`SPRINGDOC_ENABLED=false` で起動すると、Swagger UI と API 仕様は開けない（本番用の設定）
- 画面からの確認は、backend（8080）と frontend（5173）の両方を起動し、`http://localhost:5173/` を開く。frontend は `/api` を 8080 へ中継するだけで、URL の設定ファイルはない。リフレッシュトークンの Cookie は HTTP の開発環境でも動くよう、`REFRESH_COOKIE_SECURE` の既定は `false`（本番は `true`）
- アクセストークンの期限切れの動作（401 → 自動更新）を確認したいときは、`JWT_EXPIRATION=20s` を付けて backend を起動する（期限は時計ずれの許容なしでちょうどで切れる）
