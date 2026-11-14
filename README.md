# RaiseTimeLine

テキスト中心のタイムラインで、投稿・コメント・いいね・フォローをやり取りする、学習用のSNS風アプリ。

X（旧Twitter）に似た構成だが、**インプレッション数を表示しない**・**リツイート（リポスト）を作らない**ことを差別化ポイントとする。数字を競わず、文章や画像を気軽に投稿できる場所を目指す。受講生・個人が複数人で使うことを前提に設計し、第三者の投稿にも、いいね・コメントができる。

React のSPAと、Java / Spring Boot の API、PostgreSQL（AWS RDS）、画像保存の AWS S3 で構成している。**23 機能のすべてを、バックエンドと画面で実装済み**（投稿・コメント・いいね・フォロー・ユーザー検索・プロフィール・画像）。AWS の構成は Terraform で構築でき、GitHub Actions から手動でデプロイできる。

## 現在の状況

| 項目 | 状態 |
| --- | --- |
| 要件定義書（v0.15）・機能一覧（23機能）・機能定義書（8本）・ログ設計 | 作成済み。`docs/` が正本 |
| バックエンド | 23 機能すべて実装済み（認証、タイムライン・投稿、コメント、いいね、フォロー、ユーザー検索、プロフィール、S3 の署名付き URL による画像） |
| フロントエンド | 8 画面すべて実装済み |
| テスト | バックエンド（JUnit・Testcontainers の結合テスト）、フロント（Vitest）、E2E（Playwright。機能・a11y・セキュリティ・モバイル・性能）、負荷・性能（k6 ほか。手動） |
| CI | GitHub Actions（静的解析・単体テスト・E2E）。プルリクエストと `main` への push で実行 |
| インフラ | Terraform で構築済み（CloudFront / S3 / 内部 ALB / ECS Fargate / RDS / ECR）。デプロイは GitHub Actions の手動実行（OIDC） |
| 課金 | 課題用のため AWS は常時動かさない。確認が終わったら `terraform destroy` する（[infra/README.md](infra/README.md)） |

## 主な機能

7機能群・23機能。IDと概要は [docs/01_機能一覧.md](docs/01_機能一覧.md) を参照。

| 機能群 | 機能ID | 内容 |
| --- | --- | --- |
| 認証 | F-01〜F-03 | メールとパスワードで登録・ログイン。@ハンドルを持ち、プロフィール（表示名・自己紹介・アイコン）を編集できる |
| タイムライン・投稿 | F-04〜F-08, F-23 | 「フォロー中」「全体」の2タブ。本文は280文字まで。自分の投稿は本文を編集・削除でき、編集した投稿には「編集済み」と表示。いいね数とコメント数を表示。20件ずつの無限スクロールと、30秒ごとの新着確認（「N件の新しい投稿を表示」バー） |
| コメント | F-09〜F-12 | 第三者を含む全ユーザーが投稿にコメントできる（280文字まで）。コメント数を表示 |
| いいね | F-13, F-14 | 1人1投稿につき1回。付与・取消のトグル。いいね数と「自分が付けたか」を表示 |
| 画像投稿 | F-15〜F-17 | 1投稿に最大4枚、各5MBまで（jpg / png / webp）。サムネイルと拡大表示。アイコン画像も同じ仕組み |
| フォロー | F-18〜F-20 | 一方向のフォロー。フォロー数・フォロワー数の表示、一覧表示 |
| ユーザー検索 | F-21, F-22 | @ハンドルと表示名の部分一致（前方一致を上位）。検索結果の行からフォローできる |

**作らないもの:** リツイート / 引用、インプレッション数の計測・表示、DM、通知、ハッシュタグ、動画、管理者機能、ランキングや「おすすめユーザー」。

## 技術スタック

| 領域 | 採用 |
| --- | --- |
| フロントエンド | React 19 + TypeScript 6 + Vite 8（react-router、テストは Vitest + Testing Library、静的解析は ESLint） |
| バックエンド | Spring Boot 4.0.8（Java 25、Gradle）。REST API、API 仕様書は springdoc-openapi でコードから自動生成、認証は Spring Security + JWT（アクセストークンを Bearer ヘッダーで送り、リフレッシュトークンは HttpOnly Cookie）、DBアクセスは MyBatis、スキーマ管理は Flyway、ログは logstash-logback-encoder による 1 行 1 JSON、静的解析は Checkstyle + SpotBugs |
| データベース | PostgreSQL 16（AWS RDS）。ユーザー検索に `pg_trgm` を使う |
| 画像ストレージ | AWS S3。署名付きURLでブラウザから直接アップロード・取得 |
| 実行環境 | AWS CloudFront + S3 + ECS Fargate + RDS（Terraform で構築） |
| テスト | JUnit + Testcontainers、Vitest、Playwright（+ axe-core）、k6 |

バージョンは決定済み（Spring Boot 4.0.8 は MyBatis スターターに対応する最新）。変えるときは、この表と要件定義書の「8. 制約・前提条件」に反映する。

## クイックスタート（ローカル開発）

前提: Docker、Java 25、Node.js 24。Claude Code を使う場合は、`dev-server-startup` スキルが下の手順をポート競合の解消つきで実行する。

| 対象 | ポート |
| --- | --- |
| PostgreSQL | 5432 |
| バックエンド | 8080 |
| フロントエンド（Vite） | 5173 |

```sh
# 1. PostgreSQL を起動（設定を変えたいときは .env.example を .env にコピーする。変えなければ既定値で動く）
docker compose up -d db

# 2. バックエンド（初回起動で Flyway がスキーマを作る）
cd backend
./gradlew bootRun

# 3. フロントエンド（別のターミナルで）
cd frontend
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開き、新規登録する。Vite が `/api` をバックエンド（8080）へ中継するので、CORS の設定は要らない（本番の CloudFront 配下と同じ同一オリジン構成）。

- JWT の署名鍵は、`./gradlew bootRun` が未設定なら開発用の値を使う。本番では必ず `JWT_SECRET` を環境変数で渡す
- 画像機能は、`S3_BUCKET` が未設定なら無効（下の「ローカルで画像（S3）を使う」）
- 環境変数の一覧は [.env.example](.env.example) と `backend/src/main/resources/application.yml`

## テストと品質チェック

| 対象 | コマンド | 備考 |
| --- | --- | --- |
| バックエンドのテスト | `cd backend && ./gradlew test` | 結合テストは Testcontainers で PostgreSQL を起動するため Docker が必要 |
| バックエンドの静的解析 | `cd backend && ./gradlew checkstyleMain checkstyleTest spotbugsMain` | Checkstyle は警告 0 件が条件 |
| フロントのテスト | `cd frontend && npm test` | Vitest |
| フロントの静的解析 | `cd frontend && npm run lint && npx tsc -b` | ESLint と型チェック |
| E2E | `cd e2e && npm test` | 専用の DB・ポートで動く。手順は [e2e/README.md](e2e/README.md) |
| 負荷・性能 | [perf/README.md](perf/README.md) | k6・EXPLAIN・ブラウザ計測。手動実行で CI には載せていない |

CI（`.github/workflows/ci.yml`）は、フロントの静的解析・単体テスト、バックエンドの静的解析・テスト、E2E を実行する。Claude Code の `quality-check` スキルは、lint・コードレビュー・Terraform の確認・ドキュメントと実装の整合性チェックをまとめて行う。

## 画面

8画面。

| ID | 画面 | URL |
| --- | --- | --- |
| S-01 | ログイン | `/login` |
| S-02 | 新規登録 | `/signup` |
| S-03 | タイムライン（ホーム） | `/` |
| S-04 | 投稿詳細 | `/posts/:id` |
| S-05 | プロフィール | `/users/:handle` |
| S-06 | プロフィール編集 | `/settings/profile` |
| S-07 | ユーザー検索 | `/search` |
| S-08 | フォロー中 / フォロワー一覧 | `/users/:handle/following`, `/users/:handle/followers` |

画面遷移図・ワイヤーの詳細は要件定義書の「6. 画面構成」を参照。実装前に作った HTML のプロトタイプは [mock/](mock/README.md)（ブラウザで `mock/index.html` を開くだけで動く）。

## データモデル

7テーブル。列・制約・SQLは要件定義書の「7. データモデル」と、`backend/src/main/resources/db/migration/`（Flyway）を参照。

| テーブル | 内容 |
| --- | --- |
| `users` | ユーザー（メール、パスワードハッシュ、ハンドル、表示名、自己紹介、アイコンのS3キー） |
| `refresh_tokens` | リフレッシュトークン（SHA-256 のハッシュだけを保存。ローテーションと使い回し検知用） |
| `posts` | 投稿（本文、投稿日時、更新日時） |
| `post_images` | 投稿の画像（S3キー、表示順） |
| `comments` | コメント |
| `likes` | いいね（`user_id` + `post_id` の複合主キー） |
| `follows` | フォロー（`follower_id` + `followee_id` の複合主キー。自分自身のフォローは禁止） |

いいね数・コメント数・フォロー数・フォロワー数は列として持たず、表示のたびに COUNT で数える。

## インフラ構成

EC2 は使わない。React のビルドは S3 + CloudFront で配信し、`/api/*` は CloudFront から内部 ALB を通して ECS Fargate（Spring Boot）へ渡す。DB は RDS（PostgreSQL）。画像のバイト列だけは、署名付きURLでブラウザと S3 が直接やり取りする。

- 構成図・セキュリティグループの表・未決事項: [docs/20_インフラ構成図.md](docs/20_インフラ構成図.md)
- Terraform の使い方（構築・イメージの push・画面の配置・destroy）: [infra/README.md](infra/README.md)
- デプロイ: Actions タブ → Deploy → Run workflow（手動。AWS へは OIDC で認証し、`main` から実行したときだけロールを引き受けられる）。必要なリポジトリ変数は [infra/README.md](infra/README.md)
- NAT Gateway とインターフェイス型 VPC エンドポイントは課金を抑えるため置かない。それでも ALB・RDS・Fargate は動かしている間だけ課金されるので、確認が終わったら `terraform destroy` する

## リポジトリ構成

```
backend/    Spring Boot API（com.raisetimeline.backend。MyBatis の SQL は src/main/resources/mapper/*.xml）
frontend/   React フロントエンド
e2e/        E2E テスト（Playwright。機能・a11y・セキュリティ・性能。実行方法は e2e/README.md）
perf/       負荷・性能テスト（k6 / EXPLAIN / ブラウザ計測。手動実行。perf/README.md）
infra/      AWS 構成の Terraform（infra/README.md）。infra/bootstrap は tfstate 用バケット
mock/       HTML だけのプロトタイプ（mock/README.md）
docs/       要件定義書・機能一覧・機能定義書・インフラ構成図・ログ設計（正本）、docs/api/ API仕様書（OpenAPI。コードから自動生成）
.github/    GitHub Actions（ci.yml: 検査、deploy.yml: 手動デプロイ）
.claude/    Claude Code の設定とスキル（dev-server-startup / quality-check）
docker-compose.yml   開発用 PostgreSQL（5432）
.env.example         開発用の環境変数の例
```

## ドキュメント

`docs/` の Markdown が正本。仕様を変えるときは `docs/` を直接更新する。画面遷移図・ER図・アップロードの流れ図・AWS構成図は Markdown に含まれない。以前 Claude Docs に作った図が[参考として残っている](#図の参照先)が、更新はされない。

| ドキュメント | 内容 |
| --- | --- |
| [要件定義書](docs/00_要件定義書.md) | 目的・想定ユーザー・スコープ・機能要件・非機能要件・画面構成・データモデル・制約・拡張候補・改訂履歴 |
| [機能一覧](docs/01_機能一覧.md) | 23機能のID・概要・優先度・状態・関連画面 |
| [機能定義書: 認証](docs/10_機能定義書_認証.md) | 登録・ログイン・ログアウト、トークンの扱い、入力検証・API・DB |
| [機能定義書: タイムライン・投稿](docs/11_機能定義書_タイムライン・投稿.md) | タブ、カーソル方式の一覧取得、無限スクロール、新着の確認、投稿の作成・編集・削除 |
| [機能定義書: コメント](docs/12_機能定義書_コメント.md) | コメントの投稿・一覧・削除、コメント数 |
| [機能定義書: いいね](docs/13_機能定義書_いいね.md) | 付与・取消（冪等なPUT/DELETE）、二重付与の防止 |
| [機能定義書: 画像投稿](docs/14_機能定義書_画像投稿.md) | 署名付きURLによるアップロード、S3のキー・バケット設定 |
| [機能定義書: フォロー](docs/15_機能定義書_フォロー.md) | 一方向フォロー、フォロー数・フォロワー数、一覧 |
| [機能定義書: ユーザー検索](docs/16_機能定義書_ユーザー検索.md) | 部分一致検索、pg_trgm、エスケープ |
| [機能定義書: プロフィール](docs/17_機能定義書_プロフィール.md) | プロフィールの表示（S-05）と編集（S-06）、アイコン変更、F-03・F-08・F-17 の仕様 |
| [インフラ構成図](docs/20_インフラ構成図.md) | CloudFront / S3 / ECS Fargate / RDS の構成、セキュリティグループ、未決事項 |
| [ログ設計と閾値](docs/21_ログ設計と閾値.md) | 構造化ログ（1行1JSON）のフィールド、リクエストログ、遅延の閾値、Datadog などへの連携 |
| [API仕様書（OpenAPI）](docs/api/openapi.json) | コードから自動生成した API の仕様。Swagger UI と更新手順は下の「API仕様書（自動生成）」 |

機能を追加・変更するときは、コードと合わせて要件定義書・機能一覧・該当する機能定義書も更新する。

### API仕様書（自動生成）

API の入出力（パス・パラメータ・リクエスト/レスポンスの型・認証の要否）は、Controller と DTO から [springdoc-openapi](https://springdoc.org/) が自動で生成する。機能定義書の API 記述と食い違う場合は、コードから生成した仕様書を優先する。

| 見る場所 | 内容 |
| --- | --- |
| `http://localhost:8080/api/swagger-ui.html` | Swagger UI。バックエンド起動中に開く。右上の Authorize にアクセストークンを入れると、認証が必要な API も試せる |
| `http://localhost:8080/api/v3/api-docs` | OpenAPI の JSON（起動中のバックエンドから取得） |
| [docs/api/openapi.json](docs/api/openapi.json) | 上の JSON をコミットしたもの。起動しなくても読める |

Controller / DTO を変えたら、仕様書を生成し直してコミットする（Docker が必要。統合テストと同じく Testcontainers を使う）。

```
cd backend
./gradlew generateOpenApi
```

- 説明文は Controller の `@Tag` / `@Operation`、DTO の Jakarta Validation から作られる。共通のエラー応答（`ErrorResponse`）と Bearer 認証の定義は `config/OpenApiConfig.java`
- 本番では環境変数 `SPRINGDOC_ENABLED=false` で、Swagger UI と API 仕様の公開を止める（Terraform のタスク定義で設定済み）

### 図の参照先

図は Claude Docs 側にだけ残っている旧版（非公開。作成したアカウントでのみ開ける）。文章の正本は `docs/` なので、図と食い違う場合は `docs/` を優先する。

| 文書 | リンク |
| --- | --- |
| 要件定義書（画面遷移図・ER図を含む） | https://claude.ai/code/artifact/eb8ca9c3-5561-437e-8423-f79721ef7c30 |
| 機能一覧 | https://claude.ai/code/artifact/25b6bf79-48ea-4057-b5e1-c31d3248859f |
| 機能定義書: 画像投稿（アップロードの流れ図を含む） | https://claude.ai/code/artifact/69daa1c3-589e-43d8-aecf-2f0c5bae4135 |

## ローカルで画像（S3）を使う

画像（投稿の画像・アイコン）は AWS S3 に置く。バックエンドは、バケット名を環境変数 `S3_BUCKET` で受け取る。**未設定なら画像機能は無効**で、アップロードは 503 になり、アイコンは表示名の頭文字のまま（それ以外の機能は変わらず動く）。

| 設定 | 内容 |
| --- | --- |
| `S3_BUCKET` | 画像を置くバケット名（開発用バケットは、アカウント固有の名前なのでリポジトリには書かない） |
| `AWS_PROFILE` | 認証情報のプロファイル。`./gradlew bootRun` は、未設定なら `raisetimeline-dev` を使う |
| `S3_REGION` | 既定は `ap-northeast-1` |

- 認証情報は、AWS の標準の探し方（環境変数、`~/.aws` のプロファイル、本番では ECS のタスクロール）に任せる。**管理者権限のキーは使わず**、開発用バケットだけを操作できる IAM ユーザー（権限は `s3:PutObject` / `GetObject` / `DeleteObject` と、バケットへの `s3:ListBucket`）のキーを、プロファイル `raisetimeline-dev` に入れて使う。
- バケットは、公開アクセスをすべてブロックし、SSE-S3 で暗号化し、CORS は `http://localhost:5173` だけを許可する。バージョニング・ログ・KMS は、課金が増えるので使わない。
- 起動例: `S3_BUCKET=<バケット名> ./gradlew bootRun`（`backend/` で実行）

## 開発ルール

### ブランチ運用

- `main` への直接プッシュは禁止（GitHub のブランチ保護で強制する）。作業は `feature/*`・`fix/*`・`docs/*` などのブランチで行い、プルリクエストを作って `main` にマージする
- マージされたブランチは GitHub が自動で削除する
- 強制プッシュ（`--force`）、`git reset --hard`、ブランチの強制削除は行わない（`.claude/settings.json` で拒否している）

### バックエンド（MyBatis）の規約

- SQL は必ず `backend/src/main/resources/mapper/*.xml` に書く。`@Select` などのアノテーションや `@*Provider` では書かない
- Mapper インターフェースにはメソッド定義だけを置き、XML の `namespace` と `id` を合わせる
- SELECT 列の重複は `<sql>` と `<include>` でまとめ、動的な条件は `<where>` / `<if>` / `<foreach>` で書く。SQL は句ごとに改行する

詳細は [CLAUDE.md](CLAUDE.md)。

### Claude Code

`.claude/skills/` に、task-management から引き継いだスキルがある。

| スキル | 内容 |
| --- | --- |
| `dev-server-startup` | バックエンド・フロントエンド・PostgreSQL をデフォルトポートで起動する。ポート競合時は別ポートに逃げず、既存プロセスを止める |
| `quality-check` | フロントの lint、バックエンドのレビュー、Terraform の確認、ドキュメントと実装の整合性チェック |

## 参考

- 元になった構成・書き方: task-management リポジトリ（README、`docs/requirements/`、`.claude/skills/`）
