# 課題用のため、単一 AZ・最小サイズ・最終スナップショットなしにしている(destroy で消えても構わない前提)

resource "aws_db_subnet_group" "main" {
  name       = "${var.project}-db"
  subnet_ids = aws_subnet.private[*].id

  tags = { Name = "${var.project}-db" }
}

resource "aws_db_instance" "main" {
  identifier = "${var.project}-db"

  engine            = "postgres"
  engine_version    = var.db_engine_version
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  # パスワードは RDS が生成して Secrets Manager に保管する(Terraform の state に平文で残らない)。
  # 中身は {"username": ..., "password": ...} の JSON
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period = 1
  skip_final_snapshot     = true
  deletion_protection     = false
  apply_immediately       = true

  tags = { Name = "${var.project}-db" }
}
