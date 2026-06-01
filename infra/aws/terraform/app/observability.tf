resource "aws_cloudwatch_log_group" "backend" {
  name              = "/aws/ecs/${var.project}/backend"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "migrate" {
  name              = "/aws/ecs/${var.project}/migrate"
  retention_in_days = var.log_retention_days
}
