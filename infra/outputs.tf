output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Fargate を置くサブネット"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "内部 ALB と RDS を置くサブネット"
  value       = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "app_security_group_id" {
  value = aws_security_group.app.id
}

output "db_security_group_id" {
  value = aws_security_group.db.id
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "db_endpoint" {
  description = "RDS のホスト名とポート"
  value       = aws_db_instance.main.endpoint
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "db_master_secret_arn" {
  description = "DB パスワードを持つ Secrets Manager のシークレット(JSON の password キー)"
  value       = aws_db_instance.main.master_user_secret[0].secret_arn
}

output "jwt_secret_arn" {
  value = aws_secretsmanager_secret.jwt_secret.arn
}

output "images_bucket" {
  description = "画像用バケット名(backend の S3_BUCKET)"
  value       = aws_s3_bucket.images.bucket
}

output "images_bucket_arn" {
  value = aws_s3_bucket.images.arn
}

output "alb_dns_name" {
  description = "内部 ALB の DNS 名(VPC の内側からだけ届く)"
  value       = aws_lb.main.dns_name
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}
