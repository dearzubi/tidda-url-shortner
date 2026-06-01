resource "random_password" "database_app" {
  length           = 32
  special          = true
  override_special = "!&#$^<>-"
  min_lower        = 1
  min_upper        = 1
  min_numeric      = 1
  min_special      = 1
}

resource "random_password" "redis_auth" {
  length           = 32
  special          = true
  override_special = "!&#$^<>-"
  min_lower        = 1
  min_upper        = 1
  min_numeric      = 1
  min_special      = 1
}

resource "aws_secretsmanager_secret" "app" {
  name_prefix             = "${local.name_prefix}-app-"
  recovery_window_in_days = var.app_secret_recovery_window_days
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    databaseAppPassword = random_password.database_app.result
    redisAuthToken      = random_password.redis_auth.result
  })
}
