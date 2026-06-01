variable "aws_region" {
  description = "AWS region used for regional IAM policy resource ARNs."
  type        = string
  default     = "eu-west-1"
}

variable "project" {
  description = "Project name used as the AWS resource prefix."
  type        = string
  default     = "tidda"
}

variable "github_owner" {
  description = "GitHub repository owner."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository name."
  type        = string
}

variable "github_environment" {
  description = "GitHub environment allowed to assume the deployment roles."
  type        = string
  default     = "production"
}
