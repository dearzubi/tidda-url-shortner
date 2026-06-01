locals {
  backend_image   = "${aws_ecr_repository.backend.repository_url}:${var.backend_image_tag}"
  migration_image = "${aws_ecr_repository.backend.repository_url}:${coalesce(var.migration_image_tag, var.backend_image_tag)}"

  backend_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "BACKEND_PORT", value = tostring(local.backend_port) },
    { name = "DB_POOL_MAX", value = "5" },
    { name = "SHUTDOWN_DRAIN_DELAY_MS", value = "5000" },
    { name = "SHUTDOWN_TIMEOUT_MS", value = "30000" },
    { name = "BACKEND_TRUSTED_PROXIES", value = join(",", var.app_subnet_cidrs) },
    { name = "OTEL_TRACES_ENABLED", value = "false" },
    { name = "DATABASE_HOST", value = aws_db_instance.postgres.address },
    { name = "DATABASE_PORT", value = tostring(local.postgres_port) },
    { name = "DATABASE_NAME", value = var.database_name },
    { name = "DATABASE_USER", value = var.database_app_username },
    { name = "DATABASE_SSL", value = "true" },
    { name = "DATABASE_SSL_CA_FILE", value = "/opt/aws-rds/global-bundle.pem" },
    { name = "REDIS_HOST", value = aws_elasticache_replication_group.redis.primary_endpoint_address },
    { name = "REDIS_PORT", value = tostring(local.redis_port) },
    { name = "REDIS_TLS", value = "true" },
  ]
}

data "aws_iam_policy_document" "ecs_task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "application_role_boundary" {
  statement {
    sid = "AllowEcsTaskSecrets"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      aws_secretsmanager_secret.app.arn,
      aws_db_instance.postgres.master_user_secret[0].secret_arn,
    ]
  }

  statement {
    sid = "AllowEcsTaskLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      aws_cloudwatch_log_group.backend.arn,
      "${aws_cloudwatch_log_group.backend.arn}:log-stream:*",
      aws_cloudwatch_log_group.migrate.arn,
      "${aws_cloudwatch_log_group.migrate.arn}:log-stream:*",
    ]
  }

  statement {
    sid = "AllowEcsImagePull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }

  # ECR authorisation tokens are account-scoped and do not support resource-level permissions.
  statement {
    sid       = "AllowEcrToken"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "application_role_boundary" {
  name        = "${local.name_prefix}-application-role-boundary"
  description = "Permissions boundary for IAM roles created by the ${local.name_prefix} application stack."
  policy      = data.aws_iam_policy_document.application_role_boundary.json
}

resource "aws_iam_role" "backend_execution" {
  name                 = "${local.name_prefix}-ecs-execution"
  assume_role_policy   = data.aws_iam_policy_document.ecs_task_assume_role.json
  permissions_boundary = aws_iam_policy.application_role_boundary.arn
}

resource "aws_iam_role" "migrate_execution" {
  name                 = "${local.name_prefix}-migrate-execution"
  assume_role_policy   = data.aws_iam_policy_document.ecs_task_assume_role.json
  permissions_boundary = aws_iam_policy.application_role_boundary.arn
}

resource "aws_iam_role" "task" {
  name                 = "${local.name_prefix}-ecs-task"
  assume_role_policy   = data.aws_iam_policy_document.ecs_task_assume_role.json
  permissions_boundary = aws_iam_policy.application_role_boundary.arn
}

resource "aws_iam_role_policy_attachment" "backend_execution" {
  role       = aws_iam_role.backend_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "migrate_execution" {
  role       = aws_iam_role.migrate_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "backend_execution_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app.arn]
  }
}

resource "aws_iam_role_policy" "backend_execution_secrets" {
  name   = "${local.name_prefix}-backend-secrets"
  role   = aws_iam_role.backend_execution.id
  policy = data.aws_iam_policy_document.backend_execution_secrets.json
}

data "aws_iam_policy_document" "migrate_execution_secrets" {
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_db_instance.postgres.master_user_secret[0].secret_arn,
      aws_secretsmanager_secret.app.arn,
    ]
  }
}

resource "aws_iam_role_policy" "migrate_execution_secrets" {
  name   = "${local.name_prefix}-migrate-secrets"
  role   = aws_iam_role.migrate_execution.id
  policy = data.aws_iam_policy_document.migrate_execution_secrets.json
}

resource "aws_ecs_cluster" "main" {
  name = local.name_prefix
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name_prefix}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.backend_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = local.backend_image
      essential = true
      portMappings = [
        {
          containerPort = local.backend_port
          hostPort      = local.backend_port
          protocol      = "tcp"
        },
      ]
      environment = local.backend_environment
      secrets = [
        {
          name      = "DATABASE_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.app.arn}:databaseAppPassword::"
        },
        {
          name      = "REDIS_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.app.arn}:redisAuthToken::"
        },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.backend.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "backend"
        }
      }
    },
  ])
}

resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name_prefix}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.migrate_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name      = "migrate"
      image     = local.migration_image
      essential = true
      command   = ["sh", "-c", "node dist/db/provision-app-role.js && node dist/db/migrate.js up"]
      environment = concat(local.backend_environment, [
        { name = "DATABASE_ADMIN_USER", value = var.database_admin_username },
        { name = "DATABASE_SCHEMA", value = "public" },
      ])
      secrets = [
        {
          name      = "DATABASE_ADMIN_PASSWORD"
          valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:password::"
        },
        {
          name      = "DATABASE_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.app.arn}:databaseAppPassword::"
        },
        {
          name      = "REDIS_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.app.arn}:redisAuthToken::"
        },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.migrate.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "migrate"
        }
      }
    },
  ])
}

resource "aws_ecs_service" "backend" {
  name             = "backend"
  cluster          = aws_ecs_cluster.main.id
  task_definition  = aws_ecs_task_definition.backend.arn
  desired_count    = var.backend_desired_count
  launch_type      = "FARGATE"
  platform_version = "1.4.0"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.ecs_subnet_ids
    security_groups  = [aws_security_group.ecs_task.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = local.backend_port
  }

  depends_on = [aws_lb_listener.backend]
}
