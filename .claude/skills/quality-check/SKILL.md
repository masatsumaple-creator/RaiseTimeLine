---
name: quality-check
description: Run this project's full quality audit — frontend ESLint (installing/fixing the config if missing), a backend check (Checkstyle/SpotBugs plus a manual code-quality review), a Terraform quality check (fmt/validate + manual review) for infra/, and a doc-vs-implementation consistency check against docs/*.md (00_要件定義書, 01_機能一覧, 1x_機能定義書, 20_インフラ構成図, 21_ログ設計) and the READMEs. Use whenever asked for a quality check, lint check, code review across the whole project, or to verify the requirements/screen-design/infrastructure docs still match the actual backend/frontend/infra implementation.
---

# 品質チェック（フロント lint + バックエンド手動レビュー + Terraform + ドキュメント整合性）

このプロジェクトの「全体的な品質チェック」を行うときの標準手順。過去の実行で判明した固有の落とし穴（TypeScriptプレビュー版の混入など）を踏まえている。

## 進め方の原則

- 既定では**チャット回答のみで報告**し、新規レポートファイルは作らない（ユーザーが「ファイルに残して」と言えば`docs/`等に保存する）。
- 見つかった問題は原則としてまず**一覧化して報告**し、ユーザーが「直して」と言ってから実際にコードを修正する。ただし、明らかに機械的で低リスクな修正（stale コメントの訂正、lintエラーの定型的な解消など）は、都度確認しなくても直してよい。
- バージョンダウングレードや依存関係の変更など、元に戻しにくい操作は事前に確認する。

## 1. フロントエンド（`frontend/`）

### 1.1 事前チェック：TypeScriptバージョンの罠

`frontend/package.json` の `typescript` バージョンを確認する。

```bash
cd frontend && npm ls typescript
```

**既知の問題:** このプロジェクトでは過去に `typescript` が安定版ではなく、Microsoftのネイティブ(Go移植)プレビュー版（例: `7.0.x` 系）に固定されてしまったことがある。`typescript-eslint` はこのプレビュー版を明示的に拒否し、`eslint`がエラーで即座に停止する（`typescript-eslint does not support TS 7.0` のようなメッセージ）。
- バージョンが `5.x`/`6.x` の安定版でなければ、まずユーザーに安定版へのダウングレードを提案し、承認を得てから実施する（[frontend/package.json](../../../frontend/package.json)を編集し`npm install`）。
- ダウングレード後は必ず `npx tsc -b` と `npm test` を実行し、ビルド・テストが壊れていないことを確認する。

### 1.2 ESLintの導入・実行

`eslint.config.js` が存在するか確認する（存在すれば`npm run lint`をそのまま実行するだけでよい）。存在しない場合は、Vite公式相当の最小構成で新規導入する。

```bash
cd frontend
npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals
```

`eslint.config.js`（flat config）の雛形：

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2020, globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
```

`frontend/package.json` の `scripts` に `"lint": "eslint ."` を追加し、実行する。

```bash
npm run lint
npm test
npx tsc -b
```

3つとも通ることを確認してから、lintで検出された指摘をユーザーに報告する（`react-hooks/set-state-in-effect` など、Reactの新しいルールに引っかかりやすい箇所に注意）。

## 2. バックエンド（`backend/`）

静的解析は Checkstyle と SpotBugs を導入済み（`backend/build.gradle`、ルールは `backend/config/`）。まず `cd backend && ./gradlew checkstyleMain checkstyleTest spotbugsMain` を実行し、違反があれば直す（CI と同じ）。そのうえで、ツールで拾えない以下の観点でコードを直接読んでレビューする。新規ツール導入は依頼されない限り行わない。

- **サービス層の有無**: `controller/` のクラスが `mapper/`（MyBatis）を直接操作していないか（[AuthController.java](../../../backend/src/main/java/com/raisetimeline/backend/controller/AuthController.java) など）。ビジネスロジックがController内に埋め込まれていないか。
- **例外処理の一元化**: `@ControllerAdvice`/`@ExceptionHandler` があるか。なければ、`ResponseStatusException`や手動nullチェックがControllerごとにバラバラに書かれていないか。
- **テストカバレッジ**: `backend/src/test/`配下にController/Mapperを通した結合テスト（Testcontainers）があるか（`contextLoads()`のみでないか）。
- **パッケージ構成の一貫性**: 全クラスが適切なパッケージ（`controller`/`service`/`mapper`/`entity`/`dto`/`config`/`exception`）に収まっているか。
- **セキュリティ設定**: [SecurityConfig.java](../../../backend/src/main/java/com/raisetimeline/backend/config/SecurityConfig.java) で `/api/**` が既定で認証必須か、セッションがステートレスか、JWTの署名鍵（`JWT_SECRET`）がコードやymlにハードコードされていないか（`bootRun` の開発用既定値は `build.gradle` のみ）、署名・有効期限・発行者を検証しているか。リフレッシュトークンは、Cookie が `HttpOnly`・`SameSite=Strict`・`Path=/api/auth` か（[RefreshCookies.java](../../../backend/src/main/java/com/raisetimeline/backend/controller/RefreshCookies.java)）、`Secure` が環境変数（`REFRESH_COOKIE_SECURE`）で切り替え可能か、DBにはハッシュだけを保存しレスポンスボディに生の値を含めていないか、ローテーションが1本の条件付きUPDATEで原子的か（[RefreshTokenService.java](../../../backend/src/main/java/com/raisetimeline/backend/service/RefreshTokenService.java)）。CORSは開発時もViteプロキシで同一オリジン化する方針のため、CORS設定が増えていないか。API 仕様（`/api/v3/api-docs`・`/api/swagger-ui.html`）だけが `permitAll` で、それ以外が認証必須のままか、本番で `SPRINGDOC_ENABLED=false` により公開を止められるか。
- **バリデーション**: DTOに`@Valid`/Jakarta Bean Validationアノテーションが付与されているか。

最後に `./gradlew test`（Windowsでは `.\gradlew.bat test`。Git Bashから`./gradlew`を直接呼ぶと`ClassNotFoundException: GradleWrapperMain`で失敗することがあるため、その場合はPowerShellの`.\gradlew.bat`を使う）を実行し、既存テストが壊れていないことを確認する。

## 3. インフラ（`infra/`）

Terraformコードが存在する場合のみ実施する。専用の静的解析ツール（tflint等）は導入されていない前提で、`terraform`本体のコマンドと目視レビューで行う。

### 3.1 フォーマット・構文チェック

```bash
cd infra
terraform fmt -check -diff -recursive
terraform init -backend=false   # 既にinit済みなら省略可
terraform validate
```

- `fmt -check`が差分を報告した場合は`terraform fmt`（`-check`なし）で整形してから再確認する。
- `validate`は構文・型エラーのみを検出する。実際にAWSへ何か作成・変更されることはない。

### 3.2 目視レビューの観点

- **認証情報の扱い**: パスワード等の秘密情報がリソース定義に直書きされていないか（`random_password`やSSM Parameter Store経由になっているか）。`terraform.tfvars`・`*.tfstate`が`.gitignore`で除外されているか。
- **公開範囲の最小化**: `aws_security_group`のingressが必要最小限のポート・送信元（固定IPや他のセキュリティグループ参照）に絞られているか。`0.0.0.0/0`を許可しているルールがあれば、意図したもの（例: 80番のみ等）か確認する。
- **DB等のパブリックアクセス**: `aws_db_instance`等に`publicly_accessible = true`が紛れ込んでいないか。
- **destroy時の挙動**: `skip_final_snapshot`や`force_destroy`等、`terraform destroy`実行時に意図しない課金・データ保持が発生しない設定になっているか。
- **タグ・命名の一貫性**: 新規リソースが既存の命名規則・`default_tags`と揃っているか。
- **State管理**: `terraform plan`の差分に、意図しないリソースの再作成（`# forces replacement`）が含まれていないか。

`terraform plan`はAWS認証情報とネットワーク接続が必要なため、品質チェックの一環としては**コードレビューまでに留め、実際の`plan`/`apply`はユーザーの指示があった場合のみ**実行する。

## 4. ドキュメント整合性チェック

`docs/` 配下の Markdown（`00_要件定義書.md`、`01_機能一覧.md`、`1*_機能定義書_*.md`、`20_インフラ構成図.md`、`21_ログ設計と閾値.md`）、および `README.md` / `infra/README.md` / `e2e/README.md` / `perf/README.md` / `mock/README.md` は、**`backend`/`frontend`（Spring Boot + React + PostgreSQL）+ `infra`（Terraform）の単一実装**を前提に読む。「未実装」「対応予定」等の記述は実装が先行して古くなっていることが多いため、必ず実装側と突き合わせる。

チェック手順：
1. `backend/src/main/java/.../controller/*.java` の実際のエンドポイント一覧を洗い出す。
2. `frontend/src/components/`・`frontend/src/api/` で実装済みの機能（作成/編集/削除/D&D/検索/並び替え等）を洗い出す。
3. `infra/`配下のTerraformリソース構成を洗い出す（`docs/infrastructure.md`が存在する場合、構成図・ディレクトリ構成の説明と実際のリソース定義が一致しているか）。
4. API 仕様書（`docs/api/openapi.json`）が最新か確認する。`cd backend && ./gradlew generateOpenApi` を実行し、`git diff docs/api` に差分が出たら、Controller / DTO の変更に仕様書が追従していない。生成し直した仕様書を残す。あわせて、機能定義書（`docs/1*_*.md`）の API の表のパス・認証・成功/失敗が、仕様書と一致しているか突き合わせる（食い違う場合は仕様書が正）
5. 上記1〜3と、要件定義書の「7. データモデル」と Flyway の `db/migration/`（テーブル・列の差分）、機能一覧の「状態」と要件定義書の「9. 今後の拡張候補」「未決事項」（実装済み・決定済みのものが残っていないか）、要件定義書の改訂履歴（最新版が README の記載と一致するか）、各READMEの「対応済み/未対応」記述を突き合わせ、ズレていれば実態に合わせて修正する。

## 参考

- 直近の実行例: README・要件定義書・インフラ構成図・`infra/README.md` の「構築するかは未決」等の古い記述の更新。
