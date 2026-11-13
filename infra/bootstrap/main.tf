# tfstate を置く S3 バケットを作る(最初に 1 回だけ実行する。state はローカルに置く)。
# 手順は infra/README.md を参照。
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "region" {
  description = "AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "raisetimeline"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

# バケット名は全世界で一意にする必要があるため、アカウント ID を付ける(名前はリポジトリに書かない)
resource "aws_s3_bucket" "tfstate" {
  bucket = "raisetimeline-tfstate-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "tfstate_bucket" {
  description = "infra/backend.hcl の bucket に書く名前"
  value       = aws_s3_bucket.tfstate.bucket
}
