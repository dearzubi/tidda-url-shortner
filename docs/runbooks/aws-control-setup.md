# AWS Control Setup Runbook

This runbook covers the one-time AWS and GitHub setup for production deploys
from GitHub Actions. Run commands from the repository root unless noted.

## Shared State Bucket

Create one encrypted, versioned S3 bucket for all AWS Terraform state:

```text
<project>-terraform-state-<aws-account-id>-<aws-region>
```

For this project, using the default project and region, the shape is:

```text
tidda-terraform-state-<aws-account-id>-eu-west-1
```

The bucket stores separate state objects by key:

```text
control/terraform.tfstate
app/terraform.tfstate
```

Create the bucket once:

```bash
export AWS_REGION=eu-west-1
export PROJECT=tidda
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
export STATE_BUCKET="${PROJECT}-terraform-state-${AWS_ACCOUNT_ID}-${AWS_REGION}"

aws s3api create-bucket \
  --bucket "$STATE_BUCKET" \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

aws s3api put-bucket-versioning \
  --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-ownership-controls \
  --bucket "$STATE_BUCKET" \
  --ownership-controls '{"Rules":[{"ObjectOwnership":"BucketOwnerEnforced"}]}'

aws s3api put-bucket-encryption \
  --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block \
  --bucket "$STATE_BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-lifecycle-configuration \
  --bucket "$STATE_BUCKET" \
  --lifecycle-configuration '{"Rules":[{"ID":"expire-old-state-versions","Status":"Enabled","Filter":{"Prefix":""},"NoncurrentVersionExpiration":{"NoncurrentDays":90}}]}'

cat > /tmp/tidda-state-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::$STATE_BUCKET",
        "arn:aws:s3:::$STATE_BUCKET/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket "$STATE_BUCKET" \
  --policy file:///tmp/tidda-state-policy.json
```

If the bucket already exists in the target account, check its versioning,
ownership controls, encryption, public access block, lifecycle, and bucket
policy settings before continuing.

## Apply The Control Root

The control root owns:

- the GitHub OIDC provider;
- the GitHub deploy and destroy IAM roles;
- the GitHub deploy and destroy IAM policies attached to those roles;
- GitHub role access to the shared Terraform state bucket.

Initialise the root against the shared state bucket:

```bash
terraform -chdir=infra/aws/terraform/control init -reconfigure \
  -backend-config="bucket=$STATE_BUCKET" \
  -backend-config="key=control/terraform.tfstate" \
  -backend-config="region=$AWS_REGION" \
  -backend-config="encrypt=true" \
  -backend-config="use_lockfile=true" \
  -input=false
```

Apply it with the GitHub owner and repository:

```bash
terraform -chdir=infra/aws/terraform/control apply \
  -var="aws_region=$AWS_REGION" \
  -var="project=$PROJECT" \
  -var="github_owner=<owner>" \
  -var="github_repository=<repo>"
```

If the GitHub OIDC provider already exists in the AWS account, import it before
the apply:

```bash
terraform -chdir=infra/aws/terraform/control import \
  aws_iam_openid_connect_provider.github \
  arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com
```

Record the outputs:

```bash
terraform -chdir=infra/aws/terraform/control output deploy_role_arn
terraform -chdir=infra/aws/terraform/control output destroy_role_arn
terraform -chdir=infra/aws/terraform/control output state_bucket_name
terraform -chdir=infra/aws/terraform/control output application_role_permissions_boundary_arn
```

The `state_bucket_name` output is informational. The deployment scripts derive
the shared state bucket name from `PROJECT`, `EXPECTED_AWS_ACCOUNT_ID`, and
`AWS_REGION`, so do not set it as a GitHub environment variable.

The `application_role_permissions_boundary_arn` output is informational. The
application Terraform root creates and owns that policy because it needs the
exact RDS-managed master secret ARN before it can build the boundary policy.
Do not set it as a GitHub environment variable.

## GitHub Environment

Create a GitHub environment named `production`. Add an environment deployment
branch rule that allows only `main`. The AWS roles also trust only tokens with
this subject:

```text
repo:<owner>/<repo>:environment:production
```

The workflow guards still check `main`, but the environment branch rule is the
server-side protection that stops other branches from receiving a production
environment token.

## Production Variables

Set these GitHub environment variables on `production`:

| Variable | Example value | Source or note |
| --- | --- | --- |
| `AWS_REGION` | `eu-west-1` | Region used for the shared state bucket and app stack |
| `EXPECTED_AWS_ACCOUNT_ID` | `123456789012` | Twelve digit AWS account ID from `aws sts get-caller-identity` |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::123456789012:role/tidda-github-deploy` | `deploy_role_arn` control root output |
| `AWS_DESTROY_ROLE_ARN` | `arn:aws:iam::123456789012:role/tidda-github-destroy` | `destroy_role_arn` control root output |
| `PROJECT` | `tidda` | Project name used as the AWS resource prefix |
| `DOMAIN_NAME` | `tidda.dearzubair.dev` | Public application domain |
| `CLOUDFLARE_ZONE_NAME` | `dearzubair.dev` | Cloudflare zone that owns `DOMAIN_NAME` |
| `BUDGET_ALERT_EMAIL` | `ops@example.com` | Budget alert recipient |

Set this GitHub environment secret on `production`:

| Secret                 | Value                                          |
| ---------------------- | ---------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare token with DNS read and edit access |

## Optional Sizing Variables

These GitHub environment variables may be omitted or left blank. The Bash
deployment scripts apply the defaults shown here.

| Variable                          | Default           |
| --------------------------------- | ----------------- |
| `ECS_SUBNET_COUNT`                | `1`               |
| `INTERFACE_ENDPOINT_SUBNET_COUNT` | `1`               |
| `BACKEND_CPU`                     | `256`             |
| `BACKEND_MEMORY`                  | `512`             |
| `BACKEND_DESIRED_COUNT`           | `1`               |
| `RDS_INSTANCE_CLASS`              | `db.t4g.micro`    |
| `RDS_ALLOCATED_STORAGE_GB`        | `20`              |
| `RDS_MAX_ALLOCATED_STORAGE_GB`    | `100`             |
| `RDS_MULTI_AZ`                    | `false`           |
| `RDS_BACKUP_RETENTION_DAYS`       | `1`               |
| `REDIS_NODE_TYPE`                 | `cache.t4g.micro` |
| `REDIS_REPLICAS_PER_NODE_GROUP`   | `0`               |
| `LOG_RETENTION_DAYS`              | `7`               |
| `APP_SECRET_RECOVERY_WINDOW_DAYS` | `0`               |

## Workflow Behaviour

`AWS Deploy` runs after a successful push-triggered `CI` workflow on `main`, or
by manual dispatch from `main`. It assumes `AWS_DEPLOY_ROLE_ARN` and calls
`infra/aws/scripts/deploy.sh`. The shared state bucket must already exist.

`AWS Destroy` is manual only and runs from `main`. It assumes
`AWS_DESTROY_ROLE_ARN` and requires the operator to enter the project name in
`confirm_project`. It destroys the app stack only, leaving the control root,
GitHub roles, and shared state bucket intact. To retire those control
resources, use administrator credentials and run the control root deliberately.

## Security Follow-Ups

The deploy and destroy IAM policies intentionally start broad enough for
Terraform to create, update, discover, and delete the application stack. Before
using the same AWS account for unrelated resources, tighten wildcard statements
with project ARN scoping and tag conditions where AWS supports them. Prioritise
`aws:RequestTag/Project`, `aws:ResourceTag/Project`, and IAM Access Analyzer
policy validation after the first successful deployment has produced CloudTrail
evidence.

Terraform currently generates the application database and Redis passwords and
writes them to Secrets Manager, so the app Terraform state must be treated as
secret material. A stronger future design is to keep secret values out of
Terraform entirely: let Terraform create or reference only the Secrets Manager
secret metadata, and use a separate operator or rotation script to write secret
versions with `aws secretsmanager put-secret-value`. That adds first-deploy and
rotation process complexity, but prevents generated application secret values
from being stored in Terraform state.
