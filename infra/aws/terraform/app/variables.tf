variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "project" {
  type    = string
  default = "tidda"
}

variable "domain_name" {
  type    = string
  default = "tidda.dearzubair.dev"
}

variable "cloudflare_zone_name" {
  type    = string
  default = "dearzubair.dev"
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "budget_alert_email" {
  description = "Email address that receives AWS Budget alerts."
  type        = string
}

variable "monthly_budget_alert_thresholds_usd" {
  description = "Monthly AWS Budget thresholds, in USD, created as separate budget alerts."
  type        = set(string)
  default     = ["10", "25", "40"]
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "app_subnet_cidrs" {
  type    = list(string)
  default = ["10.42.10.0/24", "10.42.11.0/24"]

  validation {
    condition     = length(var.app_subnet_cidrs) >= 2
    error_message = "app_subnet_cidrs must include at least two subnet CIDRs for the ALB."
  }
}

variable "data_subnet_cidrs" {
  type    = list(string)
  default = ["10.42.20.0/24", "10.42.21.0/24"]

  validation {
    condition     = length(var.data_subnet_cidrs) >= 2
    error_message = "data_subnet_cidrs must include at least two subnet CIDRs for RDS and Redis subnet groups."
  }
}

variable "ecs_subnet_count" {
  description = "Number of app subnets ECS tasks may use. Use one for the cheapest profile and two when scaling across AZs."
  type        = number
  default     = 1

  validation {
    condition     = contains([1, 2], var.ecs_subnet_count) && var.ecs_subnet_count <= length(var.app_subnet_cidrs)
    error_message = "ecs_subnet_count must be 1 or 2 and cannot exceed the number of app_subnet_cidrs."
  }
}

variable "interface_endpoint_subnet_count" {
  description = "Number of app subnets that host interface VPC endpoints. Use one for lower hourly endpoint cost and two for AZ spread."
  type        = number
  default     = 1

  validation {
    condition     = contains([1, 2], var.interface_endpoint_subnet_count) && var.interface_endpoint_subnet_count <= length(var.app_subnet_cidrs)
    error_message = "interface_endpoint_subnet_count must be 1 or 2 and cannot exceed the number of app_subnet_cidrs."
  }
}

variable "database_name" {
  type    = string
  default = "tidda"
}

variable "database_admin_username" {
  type    = string
  default = "tidda_admin"
}

variable "database_app_username" {
  type    = string
  default = "tidda_app"
}

variable "rds_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "rds_engine_version" {
  type    = string
  default = "18.3"
}

variable "rds_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "rds_max_allocated_storage_gb" {
  type    = number
  default = 100

  validation {
    condition     = var.rds_max_allocated_storage_gb >= var.rds_allocated_storage_gb
    error_message = "rds_max_allocated_storage_gb must be greater than or equal to rds_allocated_storage_gb."
  }
}

variable "rds_multi_az" {
  type    = bool
  default = false
}

variable "rds_apply_immediately" {
  description = "Whether RDS modifications are applied immediately."
  type        = bool
  default     = true
}

variable "rds_maintenance_window" {
  description = "Preferred weekly RDS maintenance window in UTC."
  type        = string
  default     = "sun:03:00-sun:04:00"
}

variable "rds_deletion_protection" {
  type    = bool
  default = false
}

variable "rds_backup_retention_days" {
  type    = number
  default = 1

  validation {
    condition     = var.rds_backup_retention_days >= 0 && var.rds_backup_retention_days <= 35
    error_message = "rds_backup_retention_days must be between 0 and 35."
  }
}

variable "rds_skip_final_snapshot" {
  description = "Whether to skip the final RDS snapshot during destroy."
  type        = bool
  default     = true
}

variable "rds_final_snapshot_identifier" {
  description = "Final RDS snapshot identifier used when rds_skip_final_snapshot is false."
  type        = string
  default     = null

  validation {
    condition     = var.rds_final_snapshot_identifier == null || can(regex("^[a-z][a-z0-9-]{1,253}[a-z0-9]$", var.rds_final_snapshot_identifier))
    error_message = "rds_final_snapshot_identifier must be a valid unique lowercase RDS snapshot identifier."
  }
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "redis_engine_version" {
  type    = string
  default = "7.1"
}

variable "redis_replicas_per_node_group" {
  type    = number
  default = 0
}

variable "backend_image_tag" {
  type = string
}

variable "migration_image_tag" {
  description = "Backend image tag used by the one-shot migration task. Defaults to backend_image_tag."
  type        = string
  default     = null
}

variable "backend_cpu" {
  type    = number
  default = 256
}

variable "backend_memory" {
  type    = number
  default = 512
}

variable "backend_desired_count" {
  type    = number
  default = 1
}

variable "log_retention_days" {
  type    = number
  default = 7
}

variable "app_secret_recovery_window_days" {
  description = "Recovery window, in days, for the application Secrets Manager secret. Use 0 for immediate deletion."
  type        = number
  default     = 0

  validation {
    condition     = var.app_secret_recovery_window_days == 0 || (var.app_secret_recovery_window_days >= 7 && var.app_secret_recovery_window_days <= 30)
    error_message = "app_secret_recovery_window_days must be 0, or between 7 and 30."
  }
}
