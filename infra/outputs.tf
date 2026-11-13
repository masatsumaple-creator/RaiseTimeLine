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
