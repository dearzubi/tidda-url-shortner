resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "Internal ALB ingress for CloudFront VPC origins."
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group" "ecs_task" {
  name        = "${local.name_prefix}-ecs-task"
  description = "Backend ECS task traffic."
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db"
  description = "RDS PostgreSQL traffic."
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis"
  description = "ElastiCache Redis traffic."
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group" "vpc_endpoint" {
  name        = "${local.name_prefix}-vpc-endpoint"
  description = "Interface VPC endpoint HTTPS traffic."
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront_vpc_origin" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = data.aws_security_group.cloudfront_vpc_origin.id
  from_port                    = local.alb_http_port
  ip_protocol                  = "tcp"
  to_port                      = local.alb_http_port
  description                  = "CloudFront VPC origin ingress."
}

resource "aws_vpc_security_group_egress_rule" "alb_to_ecs" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.ecs_task.id
  from_port                    = local.backend_port
  ip_protocol                  = "tcp"
  to_port                      = local.backend_port
}

resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id            = aws_security_group.ecs_task.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = local.backend_port
  ip_protocol                  = "tcp"
  to_port                      = local.backend_port
}

resource "aws_vpc_security_group_egress_rule" "ecs_to_endpoints" {
  security_group_id            = aws_security_group.ecs_task.id
  referenced_security_group_id = aws_security_group.vpc_endpoint.id
  from_port                    = local.endpoint_https_port
  ip_protocol                  = "tcp"
  to_port                      = local.endpoint_https_port
}

resource "aws_vpc_security_group_egress_rule" "ecs_to_s3" {
  security_group_id = aws_security_group.ecs_task.id
  prefix_list_id    = aws_vpc_endpoint.s3.prefix_list_id
  from_port         = local.endpoint_https_port
  ip_protocol       = "tcp"
  to_port           = local.endpoint_https_port
  description       = "S3 gateway endpoint egress for ECR image layers."
}

resource "aws_vpc_security_group_egress_rule" "ecs_to_db" {
  security_group_id            = aws_security_group.ecs_task.id
  referenced_security_group_id = aws_security_group.db.id
  from_port                    = local.postgres_port
  ip_protocol                  = "tcp"
  to_port                      = local.postgres_port
}

resource "aws_vpc_security_group_egress_rule" "ecs_to_redis" {
  security_group_id            = aws_security_group.ecs_task.id
  referenced_security_group_id = aws_security_group.redis.id
  from_port                    = local.redis_port
  ip_protocol                  = "tcp"
  to_port                      = local.redis_port
}

resource "aws_vpc_security_group_ingress_rule" "db_from_ecs" {
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.ecs_task.id
  from_port                    = local.postgres_port
  ip_protocol                  = "tcp"
  to_port                      = local.postgres_port
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_ecs" {
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = aws_security_group.ecs_task.id
  from_port                    = local.redis_port
  ip_protocol                  = "tcp"
  to_port                      = local.redis_port
}

resource "aws_vpc_security_group_ingress_rule" "endpoint_from_ecs" {
  security_group_id            = aws_security_group.vpc_endpoint.id
  referenced_security_group_id = aws_security_group.ecs_task.id
  from_port                    = local.endpoint_https_port
  ip_protocol                  = "tcp"
  to_port                      = local.endpoint_https_port
}
