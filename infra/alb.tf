# 内部 ALB。インターネットには公開せず、CloudFront の VPC Origin からだけ受ける。
# 受け入れのセキュリティグループルールは、VPC Origin を作る配信の層で追加する。

resource "aws_lb" "main" {
  name               = "${var.project}-alb"
  load_balancer_type = "application"
  internal           = true
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.private[*].id

  tags = { Name = "${var.project}-alb" }
}

resource "aws_lb_target_group" "app" {
  name        = "${var.project}-app"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # Fargate は IP でターゲットに登録する
  protocol    = "HTTP"
  port        = var.app_port

  deregistration_delay = 30

  # DB に依存しない liveness を見る。DB が一時的に落ちてもタスクが入れ替わらない
  health_check {
    path                = "/api/actuator/health/liveness"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# CloudFront から ALB までは HTTP。ドメインを持たず ALB に証明書を付けられないため(docs/20 の未決事項)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
