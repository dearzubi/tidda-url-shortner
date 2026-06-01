data "aws_caller_identity" "current" {}

locals {
  account_id          = data.aws_caller_identity.current.account_id
  repo_slug           = "${var.github_owner}/${var.github_repository}"
  oidc_sub            = "repo:${local.repo_slug}:environment:${var.github_environment}"
  state_bucket        = "${var.project}-terraform-state-${local.account_id}-${var.aws_region}"
  frontend_bucket     = "${var.project}-frontend-${local.account_id}"
  backend_repository  = "${var.project}-backend"
  app_boundary_policy = "${var.project}-application-role-boundary"
  app_boundary_arn    = "arn:aws:iam::${local.account_id}:policy/${local.app_boundary_policy}"
  app_secret_arn      = "arn:aws:secretsmanager:${var.aws_region}:${local.account_id}:secret:${var.project}-app-*"

  project_role_arns = [
    "arn:aws:iam::${local.account_id}:role/${var.project}-*",
  ]

  state_bucket_arns = [
    "arn:aws:s3:::${local.state_bucket}",
    "arn:aws:s3:::${local.state_bucket}/*",
  ]

  frontend_bucket_arns = [
    "arn:aws:s3:::${local.frontend_bucket}",
    "arn:aws:s3:::${local.frontend_bucket}/*",
  ]

  log_group_arns = [
    "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/aws/ecs/${var.project}/*",
    "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/aws/ecs/${var.project}/*:log-stream:*",
  ]

  ecr_repository_arn = "arn:aws:ecr:${var.aws_region}:${local.account_id}:repository/${local.backend_repository}"

  tags = {
    Project     = var.project
    ManagedBy   = "terraform"
    Environment = "aws"
  }
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "github_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.oidc_sub]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "${var.project}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_trust.json
}

resource "aws_iam_role" "destroy" {
  name               = "${var.project}-github-destroy"
  assume_role_policy = data.aws_iam_policy_document.github_trust.json
}

data "aws_iam_policy_document" "deploy_storage" {
  statement {
    sid = "AccessSharedStateBucket"
    actions = [
      "s3:DeleteObject",
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket",
      "s3:ListBucketVersions",
      "s3:PutObject",
    ]
    resources = local.state_bucket_arns
  }

  statement {
    sid = "ManageFrontendBucket"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:CreateBucket",
      "s3:DeleteBucket",
      "s3:DeleteBucketPolicy",
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:GetAccelerateConfiguration",
      "s3:GetBucket*",
      "s3:GetBucketAcl",
      "s3:GetBucketLocation",
      "s3:GetBucketOwnershipControls",
      "s3:GetBucketPolicy",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketTagging",
      "s3:GetBucketVersioning",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket",
      "s3:ListBucketVersions",
      "s3:PutBucketOwnershipControls",
      "s3:PutBucketPolicy",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketTagging",
      "s3:PutBucketVersioning",
      "s3:PutEncryptionConfiguration",
      "s3:PutLifecycleConfiguration",
      "s3:PutObject",
    ]
    resources = local.frontend_bucket_arns
  }

  statement {
    sid = "ManageBackendRepository"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:CreateRepository",
      "ecr:DeleteLifecyclePolicy",
      "ecr:DeleteRepository",
      "ecr:DescribeImages",
      "ecr:DescribeRepositories",
      "ecr:GetDownloadUrlForLayer",
      "ecr:GetLifecyclePolicy",
      "ecr:GetRepositoryPolicy",
      "ecr:InitiateLayerUpload",
      "ecr:ListImages",
      "ecr:ListTagsForResource",
      "ecr:PutImage",
      "ecr:PutImageScanningConfiguration",
      "ecr:PutImageTagMutability",
      "ecr:PutLifecyclePolicy",
      "ecr:TagResource",
      "ecr:UntagResource",
      "ecr:UploadLayerPart",
    ]
    resources = [local.ecr_repository_arn]
  }

  statement {
    sid = "ReadApplicationSecretVersion"
    actions = [
      "secretsmanager:DescribeSecret",
      "secretsmanager:GetSecretValue",
      "secretsmanager:GetResourcePolicy",
      "secretsmanager:ListSecretVersionIds",
    ]
    resources = [local.app_secret_arn]
  }
}

data "aws_iam_policy_document" "deploy_discovery" {
  # ECR login tokens and some Terraform discovery calls do not support resource-level permissions.
  statement {
    sid = "DeployUnscopedDiscovery"
    actions = [
      "ecr:GetAuthorizationToken",
      "ec2:Describe*",
      "elasticloadbalancing:Describe*",
      "rds:Describe*",
      "rds:ListTagsForResource",
      "elasticache:Describe*",
      "elasticache:ListTagsForResource",
      "ecs:Describe*",
      "ecs:List*",
      "ecs:ListTagsForResource",
      "ecs:DeregisterTaskDefinition",
      "cloudfront:Get*",
      "cloudfront:List*",
      "cloudfront:DescribeFunction",
      "acm:DescribeCertificate",
      "acm:ListCertificates",
      "acm:ListTagsForCertificate",
      "budgets:Describe*",
      "budgets:ListTagsForResource",
      "budgets:ViewBudget",
      "aws-portal:ModifyBilling",
      "aws-portal:ViewBilling",
      "iam:Get*",
      "iam:List*",
      "logs:Describe*",
      "logs:FilterLogEvents",
      "logs:ListTagsForResource",
      "s3:ListAllMyBuckets",
      "secretsmanager:ListSecretVersionIds",
      "secretsmanager:ListSecrets",
      "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "deploy_app_resources" {
  # Creation APIs for these services require wildcard resources because ARNs do not exist before creation.
  statement {
    sid = "DeployCreateApplicationResources"
    actions = [
      "acm:AddTagsToCertificate",
      "acm:DeleteCertificate",
      "acm:RequestCertificate",
      "budgets:ModifyBudget",
      "budgets:TagResource",
      "budgets:UntagResource",
      "cloudfront:CreateDistribution",
      "cloudfront:CreateFunction",
      "cloudfront:CreateInvalidation",
      "cloudfront:CreateOriginAccessControl",
      "cloudfront:CreateOriginRequestPolicy",
      "cloudfront:CreateVpcOrigin",
      "cloudfront:DeleteDistribution",
      "cloudfront:DeleteFunction",
      "cloudfront:DeleteOriginAccessControl",
      "cloudfront:DeleteOriginRequestPolicy",
      "cloudfront:DeleteVpcOrigin",
      "cloudfront:PublishFunction",
      "cloudfront:TagResource",
      "cloudfront:UntagResource",
      "cloudfront:UpdateDistribution",
      "cloudfront:UpdateFunction",
      "cloudfront:UpdateOriginAccessControl",
      "cloudfront:UpdateOriginRequestPolicy",
      "cloudfront:UpdateVpcOrigin",
      "ec2:AssociateRouteTable",
      "ec2:AttachInternetGateway",
      "ec2:AuthorizeSecurityGroupEgress",
      "ec2:AuthorizeSecurityGroupIngress",
      "ec2:CreateInternetGateway",
      "ec2:CreateRoute",
      "ec2:CreateRouteTable",
      "ec2:CreateSecurityGroup",
      "ec2:CreateSubnet",
      "ec2:CreateTags",
      "ec2:CreateVpc",
      "ec2:CreateVpcEndpoint",
      "ec2:DeleteInternetGateway",
      "ec2:DeleteRoute",
      "ec2:DeleteRouteTable",
      "ec2:DeleteSecurityGroup",
      "ec2:DeleteSubnet",
      "ec2:DeleteTags",
      "ec2:DeleteVpc",
      "ec2:DeleteVpcEndpoints",
      "ec2:DetachInternetGateway",
      "ec2:DisassociateRouteTable",
      "ec2:ModifySubnetAttribute",
      "ec2:ModifyVpcAttribute",
      "ec2:ModifyVpcEndpoint",
      "ec2:RevokeSecurityGroupEgress",
      "ec2:RevokeSecurityGroupIngress",
      "elasticache:AddTagsToResource",
      "elasticache:CreateCacheSubnetGroup",
      "elasticache:CreateReplicationGroup",
      "elasticache:DeleteCacheSubnetGroup",
      "elasticache:DeleteReplicationGroup",
      "elasticache:ModifyReplicationGroup",
      "elasticache:RemoveTagsFromResource",
      "elasticloadbalancing:AddTags",
      "elasticloadbalancing:CreateListener",
      "elasticloadbalancing:CreateLoadBalancer",
      "elasticloadbalancing:CreateTargetGroup",
      "elasticloadbalancing:DeleteListener",
      "elasticloadbalancing:DeleteLoadBalancer",
      "elasticloadbalancing:DeleteTargetGroup",
      "elasticloadbalancing:ModifyListener",
      "elasticloadbalancing:ModifyLoadBalancerAttributes",
      "elasticloadbalancing:ModifyTargetGroup",
      "elasticloadbalancing:ModifyTargetGroupAttributes",
      "elasticloadbalancing:RemoveTags",
      "elasticloadbalancing:SetSecurityGroups",
      "elasticloadbalancing:SetSubnets",
      "rds:AddTagsToResource",
      "rds:CreateDBInstance",
      "rds:CreateDBSubnetGroup",
      "rds:DeleteDBInstance",
      "rds:DeleteDBSubnetGroup",
      "rds:ModifyDBInstance",
      "rds:ModifyDBSubnetGroup",
      "rds:RemoveTagsFromResource",
      "secretsmanager:CreateSecret",
      "secretsmanager:DeleteSecret",
      "secretsmanager:PutSecretValue",
      "secretsmanager:TagResource",
      "secretsmanager:UntagResource",
      "secretsmanager:UpdateSecret",
    ]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "deploy_ecs_logs" {
  statement {
    sid = "ManageProjectEcsAndLogs"
    actions = [
      "ecs:CreateCluster",
      "ecs:CreateService",
      "ecs:DeleteCluster",
      "ecs:DeleteService",
      "ecs:RegisterTaskDefinition",
      "ecs:RunTask",
      "ecs:TagResource",
      "ecs:UntagResource",
      "ecs:UpdateService",
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:DeleteRetentionPolicy",
      "logs:ListTagsForResource",
      "logs:TagLogGroup",
      "logs:PutRetentionPolicy",
      "logs:TagResource",
      "logs:UntagLogGroup",
      "logs:UntagResource",
    ]
    resources = concat(local.log_group_arns, [
      "arn:aws:ecs:${var.aws_region}:${local.account_id}:cluster/${var.project}",
      "arn:aws:ecs:${var.aws_region}:${local.account_id}:service/${var.project}/*",
      "arn:aws:ecs:${var.aws_region}:${local.account_id}:task-definition/${var.project}-*:*",
    ])
  }
}

data "aws_iam_policy_document" "deploy_iam" {
  statement {
    sid = "ManageApplicationRoleBoundaryPolicy"
    actions = [
      "iam:CreatePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion",
      "iam:TagPolicy",
      "iam:UntagPolicy",
    ]
    resources = [local.app_boundary_arn]
  }

  statement {
    sid     = "CreateRequiredServiceLinkedRoles"
    actions = ["iam:CreateServiceLinkedRole"]
    resources = [
      "arn:aws:iam::${local.account_id}:role/aws-service-role/ecs.amazonaws.com/AWSServiceRoleForECS",
      "arn:aws:iam::${local.account_id}:role/aws-service-role/elasticache.amazonaws.com/AWSServiceRoleForElastiCache*",
      "arn:aws:iam::${local.account_id}:role/aws-service-role/elasticloadbalancing.amazonaws.com/AWSServiceRoleForElasticLoadBalancing",
      "arn:aws:iam::${local.account_id}:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS",
      "arn:aws:iam::${local.account_id}:role/aws-service-role/vpcorigin.cloudfront.amazonaws.com/AWSServiceRoleForCloudFrontVPCOrigin",
    ]

    condition {
      test     = "StringLike"
      variable = "iam:AWSServiceName"
      values = [
        "ecs.amazonaws.com",
        "elasticache.amazonaws.com",
        "elasticloadbalancing.amazonaws.com",
        "rds.amazonaws.com",
        "vpcorigin.cloudfront.amazonaws.com",
      ]
    }
  }

  statement {
    sid       = "CompleteElasticacheServiceLinkedRoleCreation"
    actions   = ["iam:PutRolePolicy"]
    resources = ["arn:aws:iam::${local.account_id}:role/aws-service-role/elasticache.amazonaws.com/AWSServiceRoleForElastiCache*"]

    condition {
      test     = "StringLike"
      variable = "iam:AWSServiceName"
      values   = ["elasticache.amazonaws.com"]
    }
  }

  statement {
    sid = "CreateProjectRolesWithBoundary"
    actions = [
      "iam:CreateRole",
    ]
    resources = local.project_role_arns

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.app_boundary_arn]
    }
  }

  statement {
    sid = "ManageProjectRoles"
    actions = [
      "iam:AttachRolePolicy",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
    ]
    resources = local.project_role_arns
  }

  statement {
    sid       = "SetProjectRoleBoundary"
    actions   = ["iam:PutRolePermissionsBoundary"]
    resources = local.project_role_arns

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.app_boundary_arn]
    }
  }

  statement {
    sid       = "PassProjectRolesToEcsTasks"
    actions   = ["iam:PassRole"]
    resources = local.project_role_arns

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "deploy_kms" {
  statement {
    sid = "UseServiceManagedKmsKeysForRdsAndSecrets"
    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:GenerateDataKey",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values = [
        "rds.${var.aws_region}.amazonaws.com",
        "secretsmanager.${var.aws_region}.amazonaws.com",
      ]
    }
  }

  statement {
    sid       = "CreateServiceKmsGrantsForRdsAndSecrets"
    actions   = ["kms:CreateGrant"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values = [
        "rds.${var.aws_region}.amazonaws.com",
        "secretsmanager.${var.aws_region}.amazonaws.com",
      ]
    }

    condition {
      test     = "Bool"
      variable = "kms:GrantIsForAWSResource"
      values   = ["true"]
    }
  }
}

data "aws_iam_policy_document" "destroy" {
  statement {
    sid = "AccessSharedStateBucketForDestroy"
    actions = [
      "s3:DeleteObject",
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket",
      "s3:ListBucketVersions",
      "s3:PutObject",
    ]
    resources = local.state_bucket_arns
  }

  statement {
    sid = "DestroyFrontendBucket"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:DeleteBucket",
      "s3:DeleteBucketPolicy",
      "s3:DeleteObject",
      "s3:DeleteObjectVersion",
      "s3:GetAccelerateConfiguration",
      "s3:GetBucket*",
      "s3:GetBucketLocation",
      "s3:GetBucketOwnershipControls",
      "s3:GetBucketPolicy",
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketTagging",
      "s3:GetBucketVersioning",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
      "s3:ListBucketVersions",
      "s3:PutBucketOwnershipControls",
      "s3:PutBucketPolicy",
      "s3:PutBucketPublicAccessBlock",
      "s3:PutBucketTagging",
    ]
    resources = local.frontend_bucket_arns
  }

  statement {
    sid = "DestroyBackendRepository"
    actions = [
      "ecr:BatchDeleteImage",
      "ecr:DeleteLifecyclePolicy",
      "ecr:DeleteRepository",
      "ecr:DescribeImages",
      "ecr:DescribeRepositories",
      "ecr:GetLifecyclePolicy",
      "ecr:ListImages",
      "ecr:ListTagsForResource",
      "ecr:UntagResource",
    ]
    resources = [local.ecr_repository_arn]
  }

  statement {
    sid = "ReadApplicationSecretVersionForDestroy"
    actions = [
      "secretsmanager:DescribeSecret",
      "secretsmanager:GetSecretValue",
      "secretsmanager:GetResourcePolicy",
      "secretsmanager:ListSecretVersionIds",
    ]
    resources = [local.app_secret_arn]
  }

  # Destroy needs account-wide discovery to find Terraform-managed resources and AWS APIs do not scope these reads.
  statement {
    sid = "DestroyUnscopedDiscovery"
    actions = [
      "acm:DescribeCertificate",
      "acm:ListCertificates",
      "acm:ListTagsForCertificate",
      "budgets:Describe*",
      "budgets:ListTagsForResource",
      "budgets:ModifyBudget",
      "budgets:ViewBudget",
      "aws-portal:ModifyBilling",
      "aws-portal:ViewBilling",
      "cloudfront:Get*",
      "cloudfront:List*",
      "cloudfront:DescribeFunction",
      "ec2:Describe*",
      "ecs:Describe*",
      "ecs:DeregisterTaskDefinition",
      "ecs:List*",
      "elasticache:Describe*",
      "elasticache:ListTagsForResource",
      "elasticloadbalancing:Describe*",
      "iam:Get*",
      "iam:List*",
      "logs:Describe*",
      "logs:ListTagsForResource",
      "rds:Describe*",
      "rds:ListTagsForResource",
      "s3:ListAllMyBuckets",
      "secretsmanager:ListSecretVersionIds",
      "secretsmanager:ListSecrets",
      "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }

  # Delete and final-snapshot APIs span services whose resource ARNs can be absent from local state during recovery.
  statement {
    sid = "DestroyApplicationResources"
    actions = [
      "acm:DeleteCertificate",
      "acm:RemoveTagsFromCertificate",
      "budgets:UntagResource",
      "cloudfront:DeleteDistribution",
      "cloudfront:DeleteFunction",
      "cloudfront:DeleteOriginAccessControl",
      "cloudfront:DeleteOriginRequestPolicy",
      "cloudfront:DeleteVpcOrigin",
      "cloudfront:UntagResource",
      "cloudfront:UpdateDistribution",
      "cloudfront:UpdateVpcOrigin",
      "ec2:DeleteInternetGateway",
      "ec2:DeleteRoute",
      "ec2:DeleteRouteTable",
      "ec2:DeleteSecurityGroup",
      "ec2:DeleteSubnet",
      "ec2:DeleteTags",
      "ec2:DeleteVpc",
      "ec2:DeleteVpcEndpoints",
      "ec2:DetachInternetGateway",
      "ec2:DisassociateRouteTable",
      "ec2:RevokeSecurityGroupEgress",
      "ec2:RevokeSecurityGroupIngress",
      "elasticache:DeleteCacheSubnetGroup",
      "elasticache:DeleteReplicationGroup",
      "elasticache:RemoveTagsFromResource",
      "elasticloadbalancing:DeleteListener",
      "elasticloadbalancing:DeleteLoadBalancer",
      "elasticloadbalancing:DeleteTargetGroup",
      "elasticloadbalancing:RemoveTags",
      "rds:CreateDBSnapshot",
      "rds:DeleteDBInstance",
      "rds:DeleteDBSubnetGroup",
      "rds:RemoveTagsFromResource",
      "secretsmanager:DeleteSecret",
      "secretsmanager:UntagResource",
    ]
    resources = ["*"]
  }

  statement {
    sid = "DestroyProjectEcsAndLogs"
    actions = [
      "ecs:DeleteCluster",
      "ecs:DeleteService",
      "ecs:UntagResource",
      "ecs:UpdateService",
      "logs:DeleteLogGroup",
      "logs:DeleteRetentionPolicy",
      "logs:ListTagsForResource",
      "logs:UntagLogGroup",
      "logs:UntagResource",
    ]
    resources = concat(local.log_group_arns, [
      "arn:aws:ecs:${var.aws_region}:${local.account_id}:cluster/${var.project}",
      "arn:aws:ecs:${var.aws_region}:${local.account_id}:service/${var.project}/*",
      "arn:aws:ecs:${var.aws_region}:${local.account_id}:task-definition/${var.project}-*:*",
    ])
  }

  statement {
    sid = "DestroyProjectRoles"
    actions = [
      "iam:DeleteRolePermissionsBoundary",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
    ]
    resources = local.project_role_arns
  }

  statement {
    sid = "DestroyApplicationRoleBoundaryPolicy"
    actions = [
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion",
    ]
    resources = [local.app_boundary_arn]
  }

  statement {
    sid       = "PassProjectRolesToEcsTasksForDestroy"
    actions   = ["iam:PassRole"]
    resources = local.project_role_arns

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "destroy_kms" {
  statement {
    sid = "UseServiceManagedKmsKeysForRdsSnapshot"
    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:GenerateDataKey",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["rds.${var.aws_region}.amazonaws.com"]
    }
  }

  statement {
    sid       = "CreateServiceKmsGrantsForRdsSnapshot"
    actions   = ["kms:CreateGrant"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["rds.${var.aws_region}.amazonaws.com"]
    }

    condition {
      test     = "Bool"
      variable = "kms:GrantIsForAWSResource"
      values   = ["true"]
    }
  }
}

resource "aws_iam_policy" "deploy" {
  name        = "${var.project}-github-deploy"
  description = "GitHub Actions deploy storage permissions for ${var.project}."
  policy      = data.aws_iam_policy_document.deploy_storage.json
}

resource "aws_iam_policy" "deploy_discovery" {
  name        = "${var.project}-github-deploy-discovery"
  description = "GitHub Actions deploy discovery permissions for ${var.project}."
  policy      = data.aws_iam_policy_document.deploy_discovery.json
}

resource "aws_iam_policy" "deploy_app_resources" {
  name        = "${var.project}-github-deploy-app-resources"
  description = "GitHub Actions deploy application resource permissions for ${var.project}."
  policy      = data.aws_iam_policy_document.deploy_app_resources.json
}

resource "aws_iam_policy" "deploy_ecs_logs" {
  name        = "${var.project}-github-deploy-ecs-logs"
  description = "GitHub Actions deploy ECS and log permissions for ${var.project}."
  policy      = data.aws_iam_policy_document.deploy_ecs_logs.json
}

resource "aws_iam_policy" "deploy_iam" {
  name        = "${var.project}-github-deploy-iam"
  description = "GitHub Actions deploy IAM permissions for ${var.project}."
  policy      = data.aws_iam_policy_document.deploy_iam.json
}

resource "aws_iam_policy" "deploy_kms" {
  name        = "${var.project}-github-deploy-kms"
  description = "GitHub Actions deploy KMS permissions for ${var.project}."
  policy      = data.aws_iam_policy_document.deploy_kms.json
}

resource "aws_iam_policy" "destroy" {
  name        = "${var.project}-github-destroy"
  description = "GitHub Actions destroy permissions for ${var.project}."
  policy      = data.aws_iam_policy_document.destroy.json
}

resource "aws_iam_policy" "destroy_kms" {
  name        = "${var.project}-github-destroy-kms"
  description = "GitHub Actions destroy KMS permissions for ${var.project}."
  policy      = data.aws_iam_policy_document.destroy_kms.json
}

resource "aws_iam_role_policy_attachment" "deploy" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.deploy.arn
}

resource "aws_iam_role_policy_attachment" "deploy_discovery" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.deploy_discovery.arn
}

resource "aws_iam_role_policy_attachment" "deploy_app_resources" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.deploy_app_resources.arn
}

resource "aws_iam_role_policy_attachment" "deploy_ecs_logs" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.deploy_ecs_logs.arn
}

resource "aws_iam_role_policy_attachment" "deploy_iam" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.deploy_iam.arn
}

resource "aws_iam_role_policy_attachment" "deploy_kms" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.deploy_kms.arn
}

resource "aws_iam_role_policy_attachment" "destroy" {
  role       = aws_iam_role.destroy.name
  policy_arn = aws_iam_policy.destroy.arn
}

resource "aws_iam_role_policy_attachment" "destroy_kms" {
  role       = aws_iam_role.destroy.name
  policy_arn = aws_iam_policy.destroy_kms.arn
}
