resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.project}"
  retention_in_days = 7 # 保管料を抑える
}

resource "aws_ecs_cluster" "main" {
  name = var.project
}

resource "aws_ecs_task_definition" "app" {
  family                   = "${var.project}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.app_cpu
  memory                   = var.app_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name      = "backend"
    image     = "${aws_ecr_repository.backend.repository_url}:${var.image_tag}"
    essential = true

    portMappings = [{ containerPort = var.app_port, protocol = "tcp" }]

    environment = [
      { name = "DB_URL", value = "jdbc:postgresql://${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}" },
      { name = "S3_BUCKET", value = aws_s3_bucket.images.bucket },
      { name = "S3_REGION", value = var.region },
      # CloudFront(HTTPS)の背後で動くため、リフレッシュトークンの Cookie に Secure を付ける
      { name = "REFRESH_COOKIE_SECURE", value = "true" },
      { name = "SPRINGDOC_ENABLED", value = "false" },
      { name = "LOG_ENV", value = "prod" },
    ]

    # JSON のシークレットは「ARN:キー::」で 1 つの値を取り出す
    secrets = [
      { name = "DB_USER", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:username::" },
      { name = "DB_PASSWORD", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:password::" },
      { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "backend"
      }
    }
  }])
}

resource "aws_ecs_service" "app" {
  name            = "${var.project}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.app_desired_count
  launch_type     = "FARGATE"

  enable_execute_command = true

  # Spring Boot の起動と Flyway のマイグレーションに時間がかかるため、その間はヘルスチェックの失敗で止めない
  health_check_grace_period_seconds = 180

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true # NAT を置かないため、ECR・Logs・Secrets Manager へ直接出る
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "backend"
    container_port   = var.app_port
  }

  depends_on = [aws_lb_listener.http]
}
