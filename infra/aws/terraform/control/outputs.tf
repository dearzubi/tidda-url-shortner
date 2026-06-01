output "deploy_role_arn" {
  description = "IAM role ARN used by the AWS deploy workflow."
  value       = aws_iam_role.deploy.arn
}

output "destroy_role_arn" {
  description = "IAM role ARN used by the AWS destroy workflow."
  value       = aws_iam_role.destroy.arn
}

output "application_role_permissions_boundary_arn" {
  description = "Expected permissions boundary ARN created by the application Terraform root."
  value       = local.app_boundary_arn
}

output "state_bucket_name" {
  description = "Shared S3 bucket used by the control and application Terraform roots for remote state."
  value       = local.state_bucket
}

output "backend_config_example" {
  description = "Backend config values for the shared Terraform state bucket."
  value = {
    bucket       = local.state_bucket
    region       = var.aws_region
    use_lockfile = true
  }
}
