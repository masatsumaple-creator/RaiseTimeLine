# infra(Terraform)

構成は [docs/20_インフラ構成図.md](../docs/20_インフラ構成図.md) を参照。層ごとに PR を分けて作っている。

| 層 | 内容 | 状態 |
| --- | --- | --- |
| 土台 | VPC・サブネット・セキュリティグループ・S3 エンドポイント・ECR | 済(`network.tf`、`ecr.tf`) |
| データ | RDS(`rds.tf`)、画像用 S3(`s3_images.tf`)、JWT 鍵の Secrets Manager(`secrets.tf`) | このディレクトリ |
| 実行 | 内部 ALB、ECS Fargate、IAM | 未 |
| 配信 | フロント用 S3、CloudFront(OAC、VPC Origin) | 未 |

## 課金について

長く動かさない課題のため、NAT Gateway とインターフェイス型 VPC エンドポイントは置かない。それでも **ALB・RDS・Fargate は動かしている間だけ課金される**(目安は 1 日あたり数ドル)。確認が終わったら必ず `terraform destroy` する。

## 使い方

前提: Terraform 1.10 以上、AWS CLI の認証(`aws sts get-caller-identity` が通ること)。

1. **tfstate 用のバケットを作る(最初の 1 回だけ)**

   ```sh
   cd infra/bootstrap
   terraform init
   terraform apply
   ```

   出力された `tfstate_bucket` を控える。このディレクトリの state はローカルに残る(`*.tfstate` は Git に入れない)。

2. **本体を初期化する**

   ```sh
   cd infra
   cp backend.hcl.example backend.hcl   # bucket に手順 1 の名前を書く(backend.hcl は Git に入れない)
   terraform init -backend-config=backend.hcl
   terraform plan
   ```

3. **作る・消す**

   ```sh
   terraform apply     # 内容を確認してから
   terraform destroy   # 確認が終わったら必ず
   ```

   tfstate 用のバケット(bootstrap)は、本体を `destroy` したあとに `infra/bootstrap` で `terraform destroy` する(バージョニングが有効なので、空にしてから消す)。

## 注意

- `*.tfstate`、`backend.hcl`、`*.tfvars`、`*_override.tf` は Git に入れない(`.gitignore` 済み)。
- ECR のタグは `IMMUTABLE`。イメージのタグには git の SHA を使う。
