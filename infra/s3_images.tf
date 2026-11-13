# 投稿画像とアイコンの置き場。ブラウザは署名付き URL で直接 PUT / GET する(backend の S3ImageStorage)。
# ブラウザからの PUT に必要な CORS は、CloudFront のドメインが決まる配信の層で追加する。

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "images" {
  # バケット名は全世界で一意にする必要があるため、アカウント ID を付ける
  bucket        = "${var.project}-images-${data.aws_caller_identity.current.account_id}"
  force_destroy = true # 課題用のため、画像が残っていても destroy で消せるようにする
}

resource "aws_s3_bucket_public_access_block" "images" {
  bucket = aws_s3_bucket.images.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# 署名付き URL で途中まで送って放置されたアップロードを、1 日後に消す
resource "aws_s3_bucket_lifecycle_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
