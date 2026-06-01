#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
APP_DIR="$REPO_ROOT/infra/aws/terraform/app"
APP_STATE_KEY="app/terraform.tfstate"
BACKEND_CONTAINER_NAME="backend"
MIGRATION_CONTAINER_NAME="migrate"

log() {
  printf '[deploy-bash] %s\n' "$*"
}

fail() {
  printf '[deploy-bash] ERROR: %s\n' "$*" >&2
  exit 1
}

unexpected_error() {
  local exit_code="$1"
  local line_number="$2"
  local command="$3"
  printf '[deploy-bash] ERROR: Unexpected failure at line %s with exit code %s: %s\n' \
    "$line_number" \
    "$exit_code" \
    "$command" >&2
  exit "$exit_code"
}

trap 'unexpected_error "$?" "$LINENO" "$BASH_COMMAND"' ERR

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "$name is required"
  fi
}

require_command() {
  local name="$1"
  if ! command -v "$name" > /dev/null 2>&1; then
    fail "$name is required"
  fi
}

json_get() {
  local path="$1"
  jq -er --arg path "$path" 'getpath($path | split(".")) | if type == "array" then .[] else . end'
}

read_config() {
  require_env AWS_REGION
  require_env EXPECTED_AWS_ACCOUNT_ID
  require_env PROJECT
  require_env DOMAIN_NAME
  require_env CLOUDFLARE_ZONE_NAME
  require_env BUDGET_ALERT_EMAIL
  require_env CLOUDFLARE_API_TOKEN
  require_env GITHUB_SHA
  require_env GITHUB_RUN_ID
  require_env GITHUB_RUN_ATTEMPT

  ECS_SUBNET_COUNT="${ECS_SUBNET_COUNT:-1}"
  INTERFACE_ENDPOINT_SUBNET_COUNT="${INTERFACE_ENDPOINT_SUBNET_COUNT:-1}"
  BACKEND_CPU="${BACKEND_CPU:-256}"
  BACKEND_MEMORY="${BACKEND_MEMORY:-512}"
  BACKEND_DESIRED_COUNT="${BACKEND_DESIRED_COUNT:-1}"
  RDS_INSTANCE_CLASS="${RDS_INSTANCE_CLASS:-db.t4g.micro}"
  RDS_ALLOCATED_STORAGE_GB="${RDS_ALLOCATED_STORAGE_GB:-20}"
  RDS_MAX_ALLOCATED_STORAGE_GB="${RDS_MAX_ALLOCATED_STORAGE_GB:-100}"
  RDS_MULTI_AZ="${RDS_MULTI_AZ:-false}"
  RDS_BACKUP_RETENTION_DAYS="${RDS_BACKUP_RETENTION_DAYS:-1}"
  REDIS_NODE_TYPE="${REDIS_NODE_TYPE:-cache.t4g.micro}"
  REDIS_REPLICAS_PER_NODE_GROUP="${REDIS_REPLICAS_PER_NODE_GROUP:-0}"
  LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-7}"
  APP_SECRET_RECOVERY_WINDOW_DAYS="${APP_SECRET_RECOVERY_WINDOW_DAYS:-0}"

  local short_sha
  short_sha="$(printf '%s' "$GITHUB_SHA" | cut -c1-7 | tr '[:upper:]' '[:lower:]')"
  IMAGE_TAG="$short_sha-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
  STATE_BUCKET_NAME="${PROJECT}-terraform-state-${EXPECTED_AWS_ACCOUNT_ID}-${AWS_REGION}"
}

assert_expected_account() {
  log "Checking AWS account"
  local identity
  identity="$(aws sts get-caller-identity --region "$AWS_REGION" --output json)"
  local account_id
  account_id="$(printf '%s' "$identity" | json_get Account)"

  if [[ "$account_id" != "$EXPECTED_AWS_ACCOUNT_ID" ]]; then
    fail "AWS account mismatch: expected $EXPECTED_AWS_ACCOUNT_ID, got $account_id"
  fi
}

set_app_tf_vars() {
  local backend_image_tag="${1:-$IMAGE_TAG}"
  local migration_image_tag="${2:-$IMAGE_TAG}"
  local backend_desired_count="${3:-$BACKEND_DESIRED_COUNT}"

  export TF_INPUT=0
  export TF_VAR_project="$PROJECT"
  export TF_VAR_aws_region="$AWS_REGION"
  export TF_VAR_domain_name="$DOMAIN_NAME"
  export TF_VAR_cloudflare_zone_name="$CLOUDFLARE_ZONE_NAME"
  export TF_VAR_cloudflare_api_token="$CLOUDFLARE_API_TOKEN"
  export TF_VAR_budget_alert_email="$BUDGET_ALERT_EMAIL"
  export TF_VAR_ecs_subnet_count="$ECS_SUBNET_COUNT"
  export TF_VAR_interface_endpoint_subnet_count="$INTERFACE_ENDPOINT_SUBNET_COUNT"
  export TF_VAR_backend_cpu="$BACKEND_CPU"
  export TF_VAR_backend_memory="$BACKEND_MEMORY"
  export TF_VAR_backend_desired_count="$backend_desired_count"
  export TF_VAR_rds_instance_class="$RDS_INSTANCE_CLASS"
  export TF_VAR_rds_allocated_storage_gb="$RDS_ALLOCATED_STORAGE_GB"
  export TF_VAR_rds_max_allocated_storage_gb="$RDS_MAX_ALLOCATED_STORAGE_GB"
  export TF_VAR_rds_multi_az="$RDS_MULTI_AZ"
  export TF_VAR_rds_backup_retention_days="$RDS_BACKUP_RETENTION_DAYS"
  export TF_VAR_redis_node_type="$REDIS_NODE_TYPE"
  export TF_VAR_redis_replicas_per_node_group="$REDIS_REPLICAS_PER_NODE_GROUP"
  export TF_VAR_backend_image_tag="$backend_image_tag"
  export TF_VAR_migration_image_tag="$migration_image_tag"
  export TF_VAR_log_retention_days="$LOG_RETENTION_DAYS"
  export TF_VAR_app_secret_recovery_window_days="$APP_SECRET_RECOVERY_WINDOW_DAYS"
  export TF_VAR_rds_skip_final_snapshot=true
  unset TF_VAR_rds_final_snapshot_identifier
}

init_app() {
  log "Initialising app Terraform from shared state bucket $STATE_BUCKET_NAME"
  set_app_tf_vars
  terraform -chdir="$APP_DIR" init \
    -reconfigure \
    -backend-config="bucket=$STATE_BUCKET_NAME" \
    -backend-config="key=$APP_STATE_KEY" \
    -backend-config="region=$AWS_REGION" \
    -backend-config="encrypt=true" \
    -backend-config="use_lockfile=true" \
    -input=false
}

state_exists() {
  local terraform_dir="$1"
  local error_file output
  error_file="$(mktemp)"

  if output="$(terraform -chdir="$terraform_dir" state pull 2>"$error_file")"; then
    rm -f "$error_file"
    if printf '%s' "$output" | jq -e '(.resources // []) | length > 0' > /dev/null; then
      return 0
    fi
    return 1
  fi

  if grep -Eiq 'No state file was found|No stored state was found|NoSuchKey' "$error_file"; then
    rm -f "$error_file"
    return 1
  fi

  cat "$error_file" >&2
  rm -f "$error_file"
  return 2
}

list_tainted_resources() {
  terraform -chdir="$APP_DIR" state pull | jq -r '
    .resources[]? as $resource
    | select($resource.mode == "managed")
    | ($resource.type + "." + $resource.name) as $address
    | $resource.instances[]?
    | select(.status == "tainted")
    | if has("index_key") then
        $address + "[" + (.index_key | tojson) + "]"
      else
        $address
      end
  '
}

state_resource_id() {
  local address="$1"
  terraform -chdir="$APP_DIR" state pull | jq -er --arg address "$address" '
    [
      .resources[]?
      | select(.mode == "managed" and ((.type + "." + .name) == $address))
      | .instances[]?
      | .attributes.id
    ][0] // empty
  '
}

bucket_exists() {
  local bucket="$1"
  local error_file
  error_file="$(mktemp)"

  if aws s3api head-bucket --bucket "$bucket" --region "$AWS_REGION" 2>"$error_file"; then
    rm -f "$error_file"
    return 0
  fi

  if grep -Eiq '\bNoSuchBucket\b|\bNotFound\b|\bNot Found\b|\b404\b' "$error_file"; then
    rm -f "$error_file"
    return 1
  fi

  cat "$error_file" >&2
  rm -f "$error_file"
  return 2
}

secret_exists() {
  local secret_id="$1"
  local error_file secret_json
  error_file="$(mktemp)"

  if secret_json="$(aws secretsmanager describe-secret \
    --secret-id "$secret_id" \
    --region "$AWS_REGION" \
    --output json 2>"$error_file")"; then
    rm -f "$error_file"
    if printf '%s' "$secret_json" | jq -e '.DeletedDate? != null' > /dev/null; then
      return 1
    fi
    return 0
  fi

  if grep -Eiq 'ResourceNotFoundException|not found|marked for deletion' "$error_file"; then
    rm -f "$error_file"
    return 1
  fi

  cat "$error_file" >&2
  rm -f "$error_file"
  return 2
}

ensure_state_bucket_exists() {
  local bucket_status=0
  bucket_exists "$STATE_BUCKET_NAME" || bucket_status=$?

  if [[ "$bucket_status" -eq 0 ]]; then
    log "Decision control_ready state_bucket=$STATE_BUCKET_NAME"
  elif [[ "$bucket_status" -eq 1 ]]; then
    fail "Shared state bucket $STATE_BUCKET_NAME is missing. Create the shared state bucket before deployment."
  else
    fail "Unable to determine whether shared state bucket exists"
  fi
}

recover_tainted_frontend_bucket() {
  local address="$1"
  local bucket_name
  bucket_name="$(state_resource_id "$address")" || fail "Unable to read state id for tainted resource $address"

  local bucket_status=0
  bucket_exists "$bucket_name" || bucket_status=$?
  if [[ "$bucket_status" -eq 1 ]]; then
    fail "Cannot recover tainted resource $address because S3 bucket $bucket_name is missing"
  elif [[ "$bucket_status" -ne 0 ]]; then
    fail "Unable to determine whether S3 bucket $bucket_name exists before recovering tainted resource $address"
  fi

  log "Recovering tainted Terraform resource $address after confirming S3 bucket $bucket_name exists"
  terraform -chdir="$APP_DIR" untaint "$address"
}

recover_tainted_app_secret() {
  local address="$1"
  local secret_id
  secret_id="$(state_resource_id "$address")" || fail "Unable to read state id for tainted resource $address"

  local secret_status=0
  secret_exists "$secret_id" || secret_status=$?
  if [[ "$secret_status" -eq 1 ]]; then
    fail "Cannot recover tainted resource $address because Secrets Manager secret $secret_id is missing or pending deletion"
  elif [[ "$secret_status" -ne 0 ]]; then
    fail "Unable to determine whether Secrets Manager secret $secret_id exists before recovering tainted resource $address"
  fi

  log "Recovering tainted Terraform resource $address after confirming Secrets Manager secret exists"
  terraform -chdir="$APP_DIR" untaint "$address"
}

recover_first_deployment_taints() {
  local tainted_output
  tainted_output="$(list_tainted_resources)" || fail "Unable to read tainted Terraform resources from state"
  if [[ -z "$tainted_output" ]]; then
    return
  fi

  local address
  while IFS= read -r address; do
    [[ -z "$address" ]] && continue
    case "$address" in
      aws_s3_bucket.frontend)
        recover_tainted_frontend_bucket "$address"
        ;;
      aws_secretsmanager_secret.app)
        recover_tainted_app_secret "$address"
        ;;
      *)
        fail "Terraform state contains tainted resource $address. Resolve it manually before deployment."
        ;;
    esac
  done < <(printf '%s\n' "$tainted_output")
}

read_app_outputs() {
  local outputs
  outputs="$(terraform -chdir="$APP_DIR" output -json)"
  BACKEND_REPOSITORY_URL="$(printf '%s' "$outputs" | json_get backend_repository_url.value)"
  FRONTEND_BUCKET_NAME="$(printf '%s' "$outputs" | json_get frontend_bucket_name.value)"
  CLOUDFRONT_DISTRIBUTION_ID="$(printf '%s' "$outputs" | json_get cloudfront_distribution_id.value)"
  PUBLIC_URL="$(printf '%s' "$outputs" | json_get public_url.value)"
  ECS_CLUSTER_NAME="$(printf '%s' "$outputs" | json_get ecs_cluster_name.value)"
  BACKEND_SERVICE_NAME="$(printf '%s' "$outputs" | json_get backend_service_name.value)"
  MIGRATION_TASK_DEFINITION_ARN="$(printf '%s' "$outputs" | json_get migration_task_definition_arn.value)"
  ECS_TASK_SECURITY_GROUP_ID="$(printf '%s' "$outputs" | json_get ecs_task_security_group_id.value)"
  ECS_SUBNET_IDS=()
  while IFS= read -r subnet_id; do
    ECS_SUBNET_IDS+=("$subnet_id")
  done < <(printf '%s' "$outputs" | json_get ecs_subnet_ids.value)
}

app_outputs_exist() {
  local outputs
  outputs="$(terraform -chdir="$APP_DIR" output -json)" || return 2

  if printf '%s' "$outputs" | jq -e '
    . as $outputs
    | all([
      "backend_repository_url",
      "frontend_bucket_name",
      "cloudfront_distribution_id",
      "public_url",
      "ecs_cluster_name",
      "backend_service_name",
      "migration_task_definition_arn",
      "ecs_task_security_group_id",
      "ecs_subnet_ids"
    ][]; $outputs[.]?.value != null)
  ' > /dev/null; then
    return 0
  fi
  return 1
}

describe_backend_service() {
  aws ecs describe-services \
    --cluster "$ECS_CLUSTER_NAME" \
    --services "$BACKEND_SERVICE_NAME" \
    --region "$AWS_REGION" \
    --output json
}

read_backend_desired_count() {
  local service_json
  service_json="$(describe_backend_service)" || return 1

  if printf '%s' "$service_json" | jq -e '((.failures // []) | length) > 0' > /dev/null; then
    if printf '%s' "$service_json" | jq -e 'all(.failures[]?; .reason == "MISSING")' > /dev/null; then
      return 2
    fi
    printf '%s\n' "$service_json" | jq -r '"ECS describe-services returned failures: \(.failures | tojson)"' >&2
    return 1
  fi

  printf '%s' "$service_json" | jq -er '
    if ((.failures // []) | length) > 0 then
      "ECS describe-services returned failures: \(.failures | tojson)" | halt_error(1)
    elif (.services[0]? == null) then
      empty
    else
      .services[0].desiredCount | tostring
    end
  ' || return 2
}

read_current_backend_image_tag() {
  local service_json task_definition task_json
  service_json="$(describe_backend_service)"
  if printf '%s' "$service_json" | jq -e '((.failures // []) | length) > 0' > /dev/null; then
    printf '%s\n' "$service_json" | jq -r '"ECS describe-services returned failures: \(.failures | tojson)"' >&2
    return 1
  fi

  local task_definition_status=0
  task_definition="$(printf '%s' "$service_json" | jq -er '.services[0].taskDefinition // empty')" || task_definition_status=$?
  if [[ "$task_definition_status" -ne 0 ]]; then
    return 2
  fi

  task_json="$(aws ecs describe-task-definition \
    --task-definition "$task_definition" \
    --region "$AWS_REGION" \
    --output json)"

  printf '%s' "$task_json" | jq -er --arg container_name "$BACKEND_CONTAINER_NAME" '
    first(.taskDefinition.containerDefinitions[]? | select(.name == $container_name) | .image) as $image
    | select(($image != null) and (($image | contains("@")) | not))
    | select(($image | rindex(":")) > (($image | rindex("/")) // -1))
    | $image[(($image | rindex(":")) + 1):]
  ' || return 2
}

ecr_image_exists() {
  local repository_url="$1"
  local image_tag="$2"
  local repository_name="${repository_url#*/}"
  local error_file
  error_file="$(mktemp)"

  if aws ecr describe-images \
    --repository-name "$repository_name" \
    --image-ids "imageTag=$image_tag" \
    --region "$AWS_REGION" \
    --output json > /dev/null 2>"$error_file"; then
    rm -f "$error_file"
    return 0
  fi

  if grep -Eiq '\bImageNotFound(Exception)?\b' "$error_file"; then
    rm -f "$error_file"
    return 1
  fi

  cat "$error_file" >&2
  rm -f "$error_file"
  return 2
}

detect_deployment_mode() {
  local desired_count current_tag
  local desired_count_status=0
  desired_count="$(read_backend_desired_count)" || desired_count_status=$?
  if [[ "$desired_count_status" -eq 2 ]]; then
    DEPLOYMENT_MODE="first_resume"
    DEPLOYMENT_REASON="backend_service_missing"
    CURRENT_BACKEND_IMAGE_TAG=""
    return
  elif [[ "$desired_count_status" -ne 0 ]]; then
    fail "Unable to read the backend desired count"
  fi

  if [[ "$desired_count" == "0" ]]; then
    DEPLOYMENT_MODE="first_resume"
    DEPLOYMENT_REASON="service_scaled_zero"
    CURRENT_BACKEND_IMAGE_TAG=""
    return
  fi

  local tag_status=0
  current_tag="$(read_current_backend_image_tag)" || tag_status=$?
  if [[ "$tag_status" -eq 2 ]]; then
    DEPLOYMENT_MODE="first_resume"
    DEPLOYMENT_REASON="current_backend_image_missing"
    CURRENT_BACKEND_IMAGE_TAG=""
    return
  elif [[ "$tag_status" -ne 0 ]]; then
    fail "Unable to read the current backend image tag"
  fi

  local image_status=0
  ecr_image_exists "$BACKEND_REPOSITORY_URL" "$current_tag" || image_status=$?
  if [[ "$image_status" -eq 1 ]]; then
    DEPLOYMENT_MODE="first_resume"
    DEPLOYMENT_REASON="current_backend_image_missing_in_ecr"
    CURRENT_BACKEND_IMAGE_TAG=""
    return
  elif [[ "$image_status" -ne 0 ]]; then
    fail "Unable to check whether the current backend image exists in ECR"
  fi

  DEPLOYMENT_MODE="repeat"
  DEPLOYMENT_REASON="current_backend_image_present"
  CURRENT_BACKEND_IMAGE_TAG="$current_tag"
}

ecr_login() {
  local registry="${BACKEND_REPOSITORY_URL%%/*}"
  aws ecr get-login-password --region "$AWS_REGION" |
    docker login --username AWS --password-stdin "$registry"
}

build_and_push_backend() {
  log "Building and pushing backend image $BACKEND_REPOSITORY_URL:$IMAGE_TAG"
  docker buildx build \
    --platform linux/arm64 \
    --file "$REPO_ROOT/infra/docker/backend.Dockerfile" \
    --target aws-runtime \
    --tag "$BACKEND_REPOSITORY_URL:$IMAGE_TAG" \
    --push \
    "$REPO_ROOT"
}

build_network_configuration() {
  local joined_subnets
  joined_subnets="$(IFS=,; printf '%s' "${ECS_SUBNET_IDS[*]}")"
  printf 'awsvpcConfiguration={subnets=[%s],securityGroups=[%s],assignPublicIp=DISABLED}' \
    "$joined_subnets" \
    "$ECS_TASK_SECURITY_GROUP_ID"
}

tail_logs_best_effort() {
  local log_group="$1"
  aws logs tail "$log_group" --since 10m --region "$AWS_REGION" || true
}

run_migration_task() {
  log "Running migration task"
  local run_json task_arn describe_json network_configuration
  network_configuration="$(build_network_configuration)"
  run_json="$(aws ecs run-task \
    --cluster "$ECS_CLUSTER_NAME" \
    --task-definition "$MIGRATION_TASK_DEFINITION_ARN" \
    --launch-type FARGATE \
    --network-configuration "$network_configuration" \
    --count 1 \
    --region "$AWS_REGION" \
    --output json)"

  task_arn="$(printf '%s' "$run_json" | jq -er '
    if ((.failures // []) | length) > 0 then
      "ECS run-task returned failures: \(.failures | tojson)" | halt_error(1)
    elif (.tasks[0].taskArn? == null) then
      "ECS run-task did not start a migration task" | halt_error(1)
    else
      .tasks[0].taskArn
    end
  ')"

  aws ecs wait tasks-stopped \
    --cluster "$ECS_CLUSTER_NAME" \
    --tasks "$task_arn" \
    --region "$AWS_REGION"

  describe_json="$(aws ecs describe-tasks \
    --cluster "$ECS_CLUSTER_NAME" \
    --tasks "$task_arn" \
    --region "$AWS_REGION" \
    --output json)"

  printf '%s' "$describe_json" | jq -er --arg container_name "$MIGRATION_CONTAINER_NAME" '
    if ((.failures // []) | length) > 0 then
      "ECS describe-tasks returned failures: \(.failures | tojson)" | halt_error(1)
    elif (.tasks[0]? == null) then
      "ECS describe-tasks did not return the migration task" | halt_error(1)
    else
      .tasks[0] as $task
      | (first($task.containers[]? | select(.name == $container_name)) // null) as $container
      | if $container == null then
          "Migration task did not include a migrate container result" | halt_error(1)
        elif $container.exitCode == null then
          "Migration task stopped without a migrate container exit code" | halt_error(1)
        elif $container.exitCode != 0 then
          "Migration task failed with exit code \($container.exitCode)\((($container.reason // $task.stoppedReason // "") | if . == "" then "" else ": \(.)" end))" | halt_error(1)
        else
          true
        end
    end
  ' > /dev/null
}

run_migration_with_log_tail() {
  if ! run_migration_task; then
    tail_logs_best_effort "/aws/ecs/$PROJECT/migrate"
    return 1
  fi
}

plan_app() {
  terraform -chdir="$APP_DIR" plan -input=false
}

apply_app() {
  terraform -chdir="$APP_DIR" apply -auto-approve -input=false
}

run_first_deployment() {
  log "Planning first deployment with the backend service scaled to zero"
  set_app_tf_vars "$IMAGE_TAG" "$IMAGE_TAG" "0"
  plan_app
  apply_app

  read_app_outputs
  ecr_login
  build_and_push_backend
  run_migration_with_log_tail

  log "Applying app Terraform with desired backend count $BACKEND_DESIRED_COUNT"
  set_app_tf_vars "$IMAGE_TAG" "$IMAGE_TAG" "$BACKEND_DESIRED_COUNT"
  apply_app
  read_app_outputs
  finish_deployment
}

run_repeat_deployment() {
  ecr_login
  build_and_push_backend

  local current_tag="$CURRENT_BACKEND_IMAGE_TAG"
  if [[ -z "$current_tag" ]]; then
    current_tag="$(read_current_backend_image_tag)"
  fi
  if [[ -z "$current_tag" ]]; then
    fail "Repeat deployment lost the current backend image tag before migrations"
  fi

  log "Applying migration task definition with backend image held at $current_tag"
  set_app_tf_vars "$current_tag" "$IMAGE_TAG" "$BACKEND_DESIRED_COUNT"
  plan_app
  apply_app
  read_app_outputs
  run_migration_with_log_tail

  log "Applying app Terraform with backend image $IMAGE_TAG"
  set_app_tf_vars "$IMAGE_TAG" "$IMAGE_TAG" "$BACKEND_DESIRED_COUNT"
  apply_app
  read_app_outputs
  finish_deployment
}

wait_for_backend_service() {
  log "Waiting for ECS backend service to become stable"
  aws ecs wait services-stable \
    --cluster "$ECS_CLUSTER_NAME" \
    --services "$BACKEND_SERVICE_NAME" \
    --region "$AWS_REGION"
}

build_and_sync_frontend() {
  log "Building frontend"
  pnpm --filter @tidda/shared build
  pnpm --filter @tidda/web build

  log "Syncing frontend assets to s3://$FRONTEND_BUCKET_NAME"
  aws s3 sync "$REPO_ROOT/apps/web/dist" "s3://$FRONTEND_BUCKET_NAME" --delete --region "$AWS_REGION"
}

invalidate_cloudfront() {
  log "Creating CloudFront invalidation"
  local invalidation_json invalidation_id
  invalidation_json="$(aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths '/*' \
    --region "$AWS_REGION" \
    --output json)"
  invalidation_id="$(printf '%s' "$invalidation_json" | json_get Invalidation.Id)"

  aws cloudfront wait invalidation-completed \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --id "$invalidation_id" \
    --region "$AWS_REGION"
}

smoke_url() {
  local path="$1"
  printf '%s%s\n' "${PUBLIC_URL%/}" "$path"
}

body_summary() {
  awk '
    {
      text = text (text == "" ? "" : " ") $0
    }
    END {
      gsub(/[[:space:]]+/, " ", text)
      sub(/^ /, "", text)
      sub(/ $/, "", text)
      if (length(text) > 160) {
        print substr(text, 1, 160) "..."
      } else {
        print text
      }
    }
  '
}

run_smoke_check() {
  local path="$1"
  local label="$2"
  local expected="$3"
  local backoffs=("0" "0.1" "0.25" "0.5")
  local body_file status http_code url summary
  url="$(smoke_url "$path")"

  for backoff in "${backoffs[@]}"; do
    if [[ "$backoff" != "0" ]]; then
      sleep "$backoff"
    fi

    body_file="$(mktemp)"
    status=0
    http_code="$(curl --silent --show-error --location --max-time 5 --output "$body_file" --write-out '%{http_code}' "$url")" || status=$?

    if [[ "$status" -eq 0 ]]; then
      if [[ "$expected" == "2xx" && "$http_code" =~ ^2[0-9][0-9]$ ]]; then
        rm -f "$body_file"
        return 0
      fi
      if [[ "$expected" != "2xx" && "$http_code" == "$expected" ]]; then
        rm -f "$body_file"
        return 0
      fi
    fi

    summary="$(body_summary < "$body_file")"
    rm -f "$body_file"
  done

  SMOKE_FAILURE_MESSAGE="Smoke check failed for $path: expected $label, got ${http_code:-request failure}. Body: ${summary:-}"
  printf '[deploy-bash] ERROR: %s\n' "$SMOKE_FAILURE_MESSAGE" >&2
  return 1
}

run_smoke_checks() {
  log "Running smoke checks against $PUBLIC_URL"
  if ! {
    run_smoke_check "/" "200" "200" &&
      run_smoke_check "/api/status" "2xx" "2xx" &&
      run_smoke_check "/api/readyz" "404" "404"
  }; then
    tail_logs_best_effort "/aws/ecs/$PROJECT/backend"
    fail "${SMOKE_FAILURE_MESSAGE:-Smoke checks failed}"
  fi
}

finish_deployment() {
  wait_for_backend_service
  build_and_sync_frontend
  invalidate_cloudfront
  run_smoke_checks
}

main() {
  cd "$REPO_ROOT"
  require_command jq
  read_config
  log "Starting deployment for $PROJECT with image tag $IMAGE_TAG"
  assert_expected_account
  ensure_state_bucket_exists
  init_app

  local app_state_status=0
  state_exists "$APP_DIR" || app_state_status=$?
  if [[ "$app_state_status" -eq 1 ]]; then
    log "Decision deployment_mode mode=first reason=app_state_empty"
    run_first_deployment
    return
  elif [[ "$app_state_status" -ne 0 ]]; then
    fail "Unable to determine whether app Terraform state exists"
  fi

  local app_outputs_status=0
  app_outputs_exist || app_outputs_status=$?
  if [[ "$app_outputs_status" -eq 1 ]]; then
    log "Decision deployment_mode mode=first reason=app_outputs_missing"
    recover_first_deployment_taints
    run_first_deployment
    return
  elif [[ "$app_outputs_status" -ne 0 ]]; then
    fail "Unable to determine whether app Terraform outputs exist"
  fi

  read_app_outputs
  detect_deployment_mode
  log "Decision deployment_mode mode=$DEPLOYMENT_MODE reason=$DEPLOYMENT_REASON"

  if [[ "$DEPLOYMENT_MODE" == "repeat" ]]; then
    run_repeat_deployment
  else
    recover_first_deployment_taints
    run_first_deployment
  fi
}

main "$@"
