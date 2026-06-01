data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

data "cloudflare_zone" "site" {
  filter = {
    name = var.cloudflare_zone_name
  }
}

locals {
  name_prefix                = var.project
  frontend_origin_id         = "frontend-s3"
  backend_origin_id          = "backend-alb"
  ecs_subnet_ids             = slice(aws_subnet.app[*].id, 0, var.ecs_subnet_count)
  interface_endpoint_subnets = slice(aws_subnet.app[*].id, 0, var.interface_endpoint_subnet_count)
  backend_http_port          = 80
  backend_https_port         = 443
  alb_http_port              = 80
  backend_port               = 3000
  postgres_port              = 5432
  redis_port                 = 6379
  endpoint_https_port        = 443

  tags = {
    Project     = var.project
    ManagedBy   = "terraform"
    Environment = "aws"
  }
}

resource "aws_ecr_repository" "backend" {
  name                 = "${var.project}-backend"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Retain the most recent 10 tagged backend images"
        selection = {
          tagStatus      = "tagged"
          countType      = "imageCountMoreThan"
          countNumber    = 10
          tagPatternList = ["*"]
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images after one day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      },
    ]
  })
}

resource "aws_s3_bucket" "frontend" {
  bucket = "${local.name_prefix}-frontend-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name_prefix}-frontend"
  description                       = "CloudFront access to the private frontend bucket."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_acm_certificate" "frontend" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "cloudflare_dns_record" "certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.frontend.domain_validation_options : option.domain_name => option
  }

  zone_id = data.cloudflare_zone.site.id
  name    = each.value.resource_record_name
  content = each.value.resource_record_value
  type    = each.value.resource_record_type
  ttl     = 60
  proxied = false
}

resource "aws_acm_certificate_validation" "frontend" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.frontend.arn
  validation_record_fqdns = [for record in cloudflare_dns_record.certificate_validation : record.name]
}

resource "aws_cloudfront_function" "api_rewrite" {
  name    = "${local.name_prefix}-api-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Strip public API prefix and block operational endpoints."
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;

      delete request.headers['x-forwarded-for'];

      if (
        request.uri === '/api/readyz' ||
        request.uri === '/api/livez' ||
        request.uri === '/api/metrics' ||
        request.uri.indexOf('/api/readyz/') === 0 ||
        request.uri.indexOf('/api/livez/') === 0 ||
        request.uri.indexOf('/api/metrics/') === 0
      ) {
        return {
          statusCode: 404,
          statusDescription: 'Not Found'
        };
      }

      if (request.uri === '/api') {
        request.uri = '/';
        return request;
      }

      if (request.uri.indexOf('/api/') === 0) {
        request.uri = request.uri.substring(4);
      }

      return request;
    }
  JS
}

resource "aws_cloudfront_function" "short_link_headers" {
  name    = "${local.name_prefix}-short-link-headers"
  runtime = "cloudfront-js-2.0"
  comment = "Strip viewer supplied forwarding headers."
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      delete request.headers['x-forwarded-for'];
      return request;
    }
  JS
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

resource "aws_cloudfront_origin_request_policy" "backend" {
  name    = "${local.name_prefix}-backend"
  comment = "Forward dynamic backend request data without forwarding Host."

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "whitelist"

    headers {
      items = [
        "Accept",
        "Authorization",
        "Access-Control-Request-Headers",
        "Access-Control-Request-Method",
        "CloudFront-Forwarded-Proto",
        "CloudFront-Viewer-Address",
        "Content-Type",
        "Origin",
        "X-Request-Id",
        "X-Forwarded-For",
      ]
    }
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

resource "aws_cloudfront_vpc_origin" "backend" {
  vpc_origin_endpoint_config {
    name                   = "${local.name_prefix}-backend"
    arn                    = aws_lb.backend.arn
    http_port              = local.backend_http_port
    https_port             = local.backend_https_port
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

data "aws_security_group" "cloudfront_vpc_origin" {
  filter {
    name   = "group-name"
    values = ["CloudFront-VPCOrigins-Service-SG"]
  }

  filter {
    name   = "vpc-id"
    values = [aws_vpc.main.id]
  }

  depends_on = [aws_cloudfront_vpc_origin.backend]
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${local.name_prefix} frontend"
  default_root_object = "index.html"
  aliases             = [var.domain_name]

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = local.frontend_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id

    s3_origin_config {
      origin_access_identity = ""
    }
  }

  origin {
    domain_name = aws_lb.backend.dns_name
    origin_id   = local.backend_origin_id

    vpc_origin_config {
      vpc_origin_id = aws_cloudfront_vpc_origin.backend.id
    }
  }

  default_cache_behavior {
    target_origin_id       = local.frontend_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = local.backend_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.backend.id
    compress                 = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.api_rewrite.arn
    }
  }

  ordered_cache_behavior {
    path_pattern             = "/s/*"
    target_origin_id         = local.backend_origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.backend.id
    compress                 = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.short_link_headers.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.frontend.certificate_arn
    minimum_protocol_version = "TLSv1.2_2021"
    ssl_support_method       = "sni-only"
  }

  depends_on = [aws_vpc_security_group_ingress_rule.alb_from_cloudfront_vpc_origin]
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontRead"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.frontend.arn,
          "${aws_s3_bucket.frontend.arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
    ]
  })
}

resource "cloudflare_dns_record" "frontend" {
  zone_id = data.cloudflare_zone.site.id
  name    = var.domain_name
  content = aws_cloudfront_distribution.frontend.domain_name
  type    = "CNAME"
  ttl     = 1
  proxied = false
}

resource "aws_budgets_budget" "alerts" {
  for_each = toset(var.monthly_budget_alert_thresholds_usd)

  name         = "${local.name_prefix}-${each.value}-usd"
  budget_type  = "COST"
  limit_amount = each.value
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
