# 課金を抑えるため、NAT Gateway とインターフェイス型 VPC エンドポイントは置かない。
#   - パブリックサブネット: Fargate(パブリック IP を付け、ECR・CloudWatch Logs・Secrets Manager へ直接出る)
#   - プライベートサブネット: 内部 ALB と RDS(インターネットへの経路なし)
# Fargate はセキュリティグループで ALB からの通信しか受けないため、公開されない。

locals {
  azs = [for s in var.az_suffixes : "${var.region}${s}"]
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.project}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project}-igw" }
}

resource "aws_subnet" "public" {
  count = length(local.azs)

  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)

  tags = { Name = "${var.project}-public-${var.az_suffixes[count.index]}" }
}

resource "aws_subnet" "private" {
  count = length(local.azs)

  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)

  tags = { Name = "${var.project}-private-${var.az_suffixes[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.project}-public" }
}

# プライベートサブネットにはインターネットへの経路(0.0.0.0/0)を作らない
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "${var.project}-private" }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# S3 用のゲートウェイ型エンドポイント(無料)。画像用 S3 と ECR のイメージ層の取得が VPC の内側で完結する
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.public.id, aws_route_table.private.id]

  tags = { Name = "${var.project}-s3" }
}

# --- セキュリティグループ ---
# ALB への受け入れ(CloudFront の VPC Origin から)は、VPC Origin を作る配信の層で追加する

resource "aws_security_group" "alb" {
  name        = "${var.project}-alb"
  description = "Internal ALB"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project}-alb" }
}

resource "aws_security_group" "app" {
  name        = "${var.project}-app"
  description = "ECS Fargate (Spring Boot)"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project}-app" }
}

resource "aws_security_group" "db" {
  name        = "${var.project}-db"
  description = "RDS PostgreSQL"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project}-db" }
}

resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = var.app_port
  to_port                      = var.app_port
  description                  = "ALB to Fargate"
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = var.app_port
  to_port                      = var.app_port
  description                  = "From ALB only"
}

# Fargate は ECR・CloudWatch Logs・Secrets Manager・S3 へ出るため、HTTPS(443)だけを開ける
resource "aws_vpc_security_group_egress_rule" "app_https" {
  security_group_id = aws_security_group.app.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "AWS APIs (ECR, Logs, Secrets Manager, S3)"
}

resource "aws_vpc_security_group_egress_rule" "app_to_db" {
  security_group_id            = aws_security_group.app.id
  referenced_security_group_id = aws_security_group.db.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Fargate to RDS"
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "From Fargate only"
}
