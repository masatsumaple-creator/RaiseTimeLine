# RaiseTimeLine ドキュメント

この `docs/` のMarkdownが正本です。仕様を変えるときは、ここを直接更新します。

図(画面遷移図・ER図・アップロードの流れ図・AWS構成図)はMarkdownに含まれません。以前 Claude Docs に作った図が残っていますが、更新されないため参考です(リンクは[ルートの README](../README.md#図の参照先)にあります)。

- [00_要件定義書](./00_要件定義書.md)
- [01_機能一覧](./01_機能一覧.md)
- [10_機能定義書_認証](./10_機能定義書_認証.md)
- [11_機能定義書_タイムライン・投稿](./11_機能定義書_タイムライン・投稿.md)
- [12_機能定義書_コメント](./12_機能定義書_コメント.md)
- [13_機能定義書_いいね](./13_機能定義書_いいね.md)
- [14_機能定義書_画像投稿](./14_機能定義書_画像投稿.md)
- [15_機能定義書_フォロー](./15_機能定義書_フォロー.md)
- [16_機能定義書_ユーザー検索](./16_機能定義書_ユーザー検索.md)
- [17_機能定義書_プロフィール](./17_機能定義書_プロフィール.md)
- [20_インフラ構成図](./20_インフラ構成図.md)
- [21_ログ設計と閾値](./21_ログ設計と閾値.md)

- [api/openapi.json](./api/openapi.json) — API 仕様書(OpenAPI)。コードから自動生成

## API 仕様書

API のパス・パラメータ・リクエスト/レスポンスの型・認証の要否は、Controller と DTO から [springdoc-openapi](https://springdoc.org/) が自動で生成します。機能定義書の API の表は読みやすくまとめたもので、食い違う場合は仕様書が正です。

- Swagger UI: バックエンド起動中に `http://localhost:8080/api/swagger-ui.html` を開く。右上の Authorize にアクセストークンを入れると、認証が必要な API も試せる
- OpenAPI の JSON: `http://localhost:8080/api/v3/api-docs`(起動中のバックエンドから取得)
- [openapi.json](./api/openapi.json): 上の JSON をコミットしたもの。起動しなくても読める

Controller / DTO を変えたら、`cd backend && ./gradlew generateOpenApi` で `openapi.json` を生成し直してコミットします(Docker が必要)。本番では環境変数 `SPRINGDOC_ENABLED=false` で、Swagger UI と API 仕様の公開を止めます。
