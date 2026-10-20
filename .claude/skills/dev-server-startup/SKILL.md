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
- バックエンド: `backend/src/main/java/com/taskmanagement/backend/config/CorsConfig.java` の `allowedOrigins("http://localhost:5173")`

ここでポート番号がずれると、CORSエラーやAPI疎通失敗など、コードとは無関係な原因で動作確認が壊れる。したがって「空いているポートを探して使う」のではなく「デフォルトポートを空ける」方針を取る。

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

## 起動確認

起動後は以下で疎通確認する。

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/tasks
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```

いずれも `200` が返ることを確認する。バックグラウンドで起動する場合はログ（stdout/stderr）を監視し、`Started BackendApplication`（backend）や起動完了ログ（frontend）を確認してから疎通チェックに進む。

## 関連

- 本ルールの原文: [CLAUDE.md](../../CLAUDE.md) の「デフォルトポートの固定運用」セクション
