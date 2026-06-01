resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name_prefix}-postgres"
  subnet_ids = aws_subnet.data[*].id
}

resource "aws_db_instance" "postgres" {
  identifier                   = "${local.name_prefix}-postgres"
  allocated_storage            = var.rds_allocated_storage_gb
  max_allocated_storage        = var.rds_max_allocated_storage_gb
  db_name                      = var.database_name
  engine                       = "postgres"
  engine_version               = var.rds_engine_version
  instance_class               = var.rds_instance_class
  port                         = local.postgres_port
  username                     = var.database_admin_username
  manage_master_user_password  = true
  db_subnet_group_name         = aws_db_subnet_group.postgres.name
  vpc_security_group_ids       = [aws_security_group.db.id]
  storage_encrypted            = true
  publicly_accessible          = false
  multi_az                     = var.rds_multi_az
  deletion_protection          = var.rds_deletion_protection
  maintenance_window           = var.rds_maintenance_window
  skip_final_snapshot          = var.rds_skip_final_snapshot
  final_snapshot_identifier    = var.rds_skip_final_snapshot ? null : var.rds_final_snapshot_identifier
  copy_tags_to_snapshot        = true
  backup_retention_period      = var.rds_backup_retention_days
  performance_insights_enabled = false
  apply_immediately            = var.rds_apply_immediately

  lifecycle {
    precondition {
      condition     = var.rds_skip_final_snapshot || var.rds_final_snapshot_identifier != null
      error_message = "rds_final_snapshot_identifier is required when rds_skip_final_snapshot is false."
    }
  }
}
