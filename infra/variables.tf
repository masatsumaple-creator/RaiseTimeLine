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
