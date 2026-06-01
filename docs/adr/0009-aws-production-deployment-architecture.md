# ADR 0009: AWS production deployment architecture

**Status:** Accepted
**Date:** 2026-06-01
**Decision-makers:** Zubair Khalid

## Context

Tidda already has a single-VPS production path documented separately. The AWS
production path needs to provide a managed cloud deployment without replacing
that VPS option.

The deployment should:

- avoid long-lived AWS credentials in GitHub;
- keep the backend, database, and cache private;
- serve the frontend and backend through the public application domain;
- support repeat deployments with database migrations before backend rollout;
- support a low-cost profile for early production use;
- allow deliberate teardown of application resources without destroying the
  GitHub control plane or Terraform state bucket.

## Decision

Add an AWS production deployment path based on GitHub Actions, Terraform, ECS
Fargate, CloudFront, RDS PostgreSQL, and ElastiCache Redis.

Use two Terraform roots:

- `infra/aws/terraform/control` owns GitHub OIDC trust, deploy and destroy IAM
  roles, and their policies.
- `infra/aws/terraform/app` owns application runtime infrastructure.

The shared S3 Terraform state bucket is created manually before either root is
applied. The bucket stores separate state objects for the control and app roots.
Destroying the app stack does not destroy the control root or the shared state
bucket.

Use GitHub Actions OIDC to assume AWS roles. Do not store long-lived AWS access
keys in GitHub. The deploy and destroy workflows use the GitHub `production`
environment, expected-account checks, and a shared concurrency group so deploy
and destroy cannot mutate production at the same time.

Use this runtime topology:

```text
CloudFront
  frontend origin: private S3 bucket
  backend origin: CloudFront VPC origin

CloudFront VPC origin
  internal ALB
    ECS Fargate backend task
      RDS PostgreSQL
      ElastiCache Redis
      VPC endpoints for AWS service access
```

CloudFront is the only public HTTP entry point. The backend ALB is internal.
ECS tasks have no public IPs. RDS and Redis are reachable only from the ECS task
security group.

Use VPC endpoints instead of a NAT gateway for the initial low-cost profile. The
app subnets have S3 gateway endpoint access and interface endpoints for ECR,
CloudWatch Logs, and Secrets Manager. If a future backend feature needs
arbitrary internet egress, add an explicit architecture decision before adding a
NAT gateway or other egress path.

Use a two-phase deployment flow for the first deployment:

1. Apply the app Terraform root with backend desired count set to zero.
2. Build and push the backend image to ECR.
3. Run the one-shot ECS migration task.
4. Apply Terraform again with the intended backend desired count.

Use a migration-first flow for repeat deployments:

1. Build and push the new backend image.
2. Apply the migration task definition with the new image while keeping the
   backend service on the current image.
3. Run the migration task.
4. Apply the backend service update to the new image.

Because repeat deployments run migrations before the backend service is updated,
normal production migrations must be backward-compatible with the currently
deployed backend. Breaking schema changes must use expand, deploy, contract:
first add compatible schema, then deploy code that can use it, then remove old
schema only after the old backend version is gone.

After the backend is stable, build the frontend, sync it to the private S3
bucket, invalidate CloudFront, and run smoke checks against the public URL.

## Trusted proxy handling

ADR 0008 records the original VPS trusted proxy decision. AWS keeps the same
principle, but applies it to the AWS ingress topology in this ADR.

In AWS, the backend's immediate HTTP peer is the internal ALB. ALB node IPs are
managed by AWS and should not be configured as fixed trusted proxy addresses.
Set `BACKEND_TRUSTED_PROXIES` to the application subnet CIDRs instead.

This is acceptable only because ECS task ingress is restricted to the ALB
security group, and ALB ingress is restricted to the CloudFront VPC origins
service security group. The subnet CIDR value is not sufficient as the only
trust boundary. If other workloads are added to the app subnets, or if backend
ingress is widened beyond the ALB security group, trusted proxy handling must be
reviewed.

## Alternatives considered

### Long-lived AWS access keys in GitHub

Static AWS access keys would be simpler to wire up, but they create a secret
rotation and blast-radius problem. OIDC gives GitHub short-lived AWS sessions
with an environment-scoped trust policy.

### Single Terraform root

A single root would reduce files, but it couples one-time GitHub control-plane
resources to application runtime resources. Splitting the roots lets the app
stack be destroyed without removing the deploy roles, destroy role, OIDC
provider, or state bucket.

### Public ALB

A public ALB would be a simpler backend origin, but it exposes another public
entry point and complicates the boundary between public edge behaviour and
backend infrastructure. CloudFront VPC origins keep backend ingress private.

### NAT gateway for backend egress

A NAT gateway is a common default, but it adds fixed monthly cost. The first AWS
profile only needs AWS service access for image pulls, logs, and secrets. VPC
endpoints cover those needs with a narrower egress model.

### Deploy backend service before the first image exists

Letting Terraform create the ECS service before an ECR image exists makes first
deployment fragile. Scaling the service to zero for the initial infrastructure
apply avoids that circular dependency while still letting Terraform own the ECS
service definition.

### Run migrations as Terraform provisioners

Terraform provisioners would hide deployment sequencing inside infrastructure
apply. Running migrations as an explicit ECS task keeps schema changes in the
deployment script, where failures can be logged and can stop backend rollout.

## Consequences

- AWS production is private by default behind CloudFront.
- Application deploy and destroy are automated from GitHub Actions.
- The control root and shared state bucket remain manual lifecycle resources.
- Terraform app state contains generated secret values, so the app state object
  must be treated as secret material.
- Repeat deployments require backward-compatible migrations because migrations
  run before the backend service rolls forward.
- The low-cost profile trades some availability and egress flexibility for
  lower fixed cost.
- New backend dependencies that require internet access need a new egress
  decision.
- CloudFront, VPC origins, and ECS service stabilisation add deployment and
  destroy wait time.
- Trusted proxy handling depends on the ECS and ALB security group boundaries
  remaining narrow.

## References

- ADR 0008: Backend trusted proxy IP handling
- AWS control setup runbook: `docs/runbooks/aws-control-setup.md`
- AWS CloudFront VPC origins documentation:
  https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html
- GitHub Actions OIDC documentation:
  https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
