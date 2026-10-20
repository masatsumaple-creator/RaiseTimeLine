---
name: quality-check
description: Run this project's full quality audit — frontend ESLint (installing/fixing the config if missing), a manual backend code-quality review (no static analysis tool is configured), a Terraform quality check (fmt/validate + manual review) for infra/, and a doc-vs-implementation consistency check against docs/requirements/*.md and the READMEs. Use whenever asked for a quality check, lint check, code review across the whole project, or to verify the requirements/screen-design/infrastructure docs still match the actual backend/frontend/infra implementation.
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

Checkstyle/Spotless/PMD等の静的解析ツールは導入されていない（`backend/build.gradle.kts` のpluginsを確認して、導入されていれば代わりにそれを実行する）。導入されていない場合は、以下の観点でコードを直接読んでレビューする。新規ツール導入は依頼されない限り行わない。

- **サービス層の有無**: `controller/` のクラスが `repository/` を直接操作していないか（[TaskController.java](../../../backend/src/main/java/com/taskmanagement/backend/controller/TaskController.java) など）。ビジネスロジック（並び替え・position再採番等）がController内に埋め込まれていないか。
- **例外処理の一元化**: `@ControllerAdvice`/`@ExceptionHandler` があるか。なければ、`ResponseStatusException`や手動nullチェックがControllerごとにバラバラに書かれていないか。
- **テストカバレッジ**: `backend/src/test/`配下にController/Repositoryのテストがあるか（`contextLoads()`のみでないか）。
- **パッケージ構成の一貫性**: 全クラスが適切なパッケージ（`controller`/`service`/`repository`/`entity`/`dto`/`config`）に収まっているか。
- **CORS設定**: [CorsConfig.java](../../../backend/src/main/java/com/taskmanagement/backend/config/CorsConfig.java) のoriginがハードコードされていないか（環境変数/プロファイル切り替え可能か）。
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

`docs/requirements.md`とその配下（`docs/requirements/*.md`）、`docs/infrastructure.md`（存在する場合）、および `README.md` / `backend/README.md` / `frontend/README.md` は、**`backend`/`frontend`（Spring Boot + React + PostgreSQL）+ `infra`（Terraform）の単一実装**を前提に読む。「未実装」「対応予定」等の記述は実装が先行して古くなっていることが多いため、必ず実装側と突き合わせる。

チェック手順：
1. `backend/src/main/java/.../controller/*.java` の実際のエンドポイント一覧を洗い出す。
2. `frontend/src/components/`・`frontend/src/api/` で実装済みの機能（作成/編集/削除/D&D/検索/並び替え等）を洗い出す。
3. `infra/`配下のTerraformリソース構成を洗い出す（`docs/infrastructure.md`が存在する場合、構成図・ディレクトリ構成の説明と実際のリソース定義が一致しているか）。
4. 上記1〜3と、`docs/requirements/data-model.md`（ER図と実装の差分）、`docs/requirements/roadmap.md`（実装済み機能が「候補」のまま残っていないか）、各READMEの「対応済み/未対応」記述を突き合わせ、ズレていれば実態に合わせて修正する。

## 参考

- 直近の実行例: `README.md` / `backend/README.md` / `frontend/README.md` / `docs/requirements/data-model.md` / `docs/requirements/roadmap.md` の更新、および `frontend/eslint.config.js` の新規導入。
