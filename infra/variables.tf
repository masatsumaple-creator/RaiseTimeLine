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
