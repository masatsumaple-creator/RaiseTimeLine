# DB のパスワードは RDS が自動管理するシークレット(rds.tf)を使う。ここでは JWT の署名鍵を作る。
# 値は Terraform の state に入る。state は暗号化した S3 に置き、公開しない。

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "${var.project}/jwt-secret"
  description = "JWT signing key (JWT_SECRET for the backend)"

  # 課題用のため、destroy で即時に削除する(通常は 7〜30 日の復旧期間がある)
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}
