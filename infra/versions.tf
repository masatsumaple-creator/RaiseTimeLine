terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # バケット名などは infra/backend.hcl で渡す(`terraform init -backend-config=backend.hcl`)
  backend "s3" {
    key          = "raisetimeline/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true # DynamoDB を使わず、S3 のロックファイルで排他する
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}
