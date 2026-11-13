variable "project" {
  description = "リソース名の接頭辞"
  type        = string
  default     = "raisetimeline"
}

variable "region" {
  description = "AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "vpc_cidr" {
  description = "VPC の CIDR"
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_suffixes" {
  description = "使うアベイラビリティゾーン(リージョン名の後ろの文字)。ALB と RDS のサブネットグループは 2 つ以上の AZ が必要"
  type        = list(string)
  default     = ["a", "c"]
}

variable "app_port" {
  description = "Spring Boot が待ち受けるポート(backend/Dockerfile の EXPOSE と揃える)"
  type        = number
  default     = 8080
}

variable "db_engine_version" {
  description = "PostgreSQL のバージョン(メジャーだけ指定すると最新のマイナーが選ばれる)"
  type        = string
  default     = "16"
}

variable "db_instance_class" {
  description = "RDS のインスタンスクラス(課金を抑えるため最小クラス)"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS のストレージ(GB)"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "データベース名(backend の既定値 DB_URL に合わせる)"
  type        = string
  default     = "raisetimeline"
}

variable "db_username" {
  description = "DB のマスターユーザー名"
  type        = string
  default     = "raisetimeline"
}

variable "image_tag" {
  description = "ECR のバックエンドイメージのタグ(git の SHA)。ECR のタグは IMMUTABLE"
  type        = string
  default     = "latest"
}

variable "app_cpu" {
  description = "Fargate タスクの CPU(1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "app_memory" {
  description = "Fargate タスクのメモリ(MiB)。JVM は 75% までをヒープに使う"
  type        = number
  default     = 1024
}

variable "app_desired_count" {
  description = "Fargate のタスク数。0 にすると課金を止められる(ALB と RDS は残る)"
  type        = number
  default     = 1
}

variable "github_repository" {
  description = "デプロイを許可する GitHub リポジトリ(owner/name)。OIDC のロールはこのリポジトリの main ブランチだけが引き受けられる"
  type        = string
  default     = "masatsumaple-creator/RaiseTimeLine"
}

variable "create_github_oidc_provider" {
  description = "GitHub の OIDC プロバイダを作るか。アカウントにすでにあるなら false(1 アカウントに 1 つだけ作れる)"
  type        = bool
  default     = true
}
