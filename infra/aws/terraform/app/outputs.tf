output "backend_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.frontend.id
}

output "public_url" {
  value = "https://${var.domain_name}"
}

output "alb_arn" {
  value = aws_lb.backend.arn
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "backend_service_name" {
  value = aws_ecs_service.backend.name
}

output "migration_task_definition_arn" {
  value = aws_ecs_task_definition.migrate.arn
}

output "ecs_subnet_ids" {
  value = local.ecs_subnet_ids
}

output "ecs_task_security_group_id" {
  value = aws_security_group.ecs_task.id
}

output "database_endpoint" {
  value = aws_db_instance.postgres.address
}

output "database_secret_arn" {
  value     = aws_db_instance.postgres.master_user_secret[0].secret_arn
  sensitive = true
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "app_secret_arn" {
  value     = aws_secretsmanager_secret.app.arn
  sensitive = true
}
