#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
APP_DIR="$REPO_ROOT/infra/aws/terraform/app"
APP_STATE_KEY="app/terraform.tfstate"
MAX_S3_DELETE_OBJECTS=1000

log() {
  printf '[destroy-bash] %s\n' "$*"
}

fail() {
  printf '[destroy-bash] ERROR: %s\n' "$*" >&2
  exit 1
}

unexpected_error() {
  local exit_code="$1"
  local line_number="$2"
  local command="$3"
  printf '[destroy-bash] ERROR: Unexpected failure at line %s with exit code %s: %s\n' \
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
  RDS_FINAL_SNAPSHOT="${RDS_FINAL_SNAPSHOT:-skip}"

  if [[ "$RDS_FINAL_SNAPSHOT" != "skip" && "$RDS_FINAL_SNAPSHOT" != "create" ]]; then
    fail "RDS_FINAL_SNAPSHOT must be skip or create"
  fi
  if [[ "${CONFIRM_PROJECT:-}" != "$PROJECT" ]]; then
    fail "CONFIRM_PROJECT must match PROJECT before destroy can continue"
  fi

  local short_sha
  short_sha="$(printf '%s' "$GITHUB_SHA" | cut -c1-7 | tr '[:upper:]' '[:lower:]')"
  IMAGE_TAG="$short_sha-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
  STATE_BUCKET_NAME="${PROJECT}-terraform-state-${EXPECTED_AWS_ACCOUNT_ID}-${AWS_REGION}"
}

assert_expected_account() {
  log "Checking AWS account"
  local identity account_id
  identity="$(aws sts get-caller-identity --region "$AWS_REGION" --output json)"
  account_id="$(printf '%s' "$identity" | json_get Account)"

  if [[ "$account_id" != "$EXPECTED_AWS_ACCOUNT_ID" ]]; then
    fail "AWS account mismatch: expected $EXPECTED_AWS_ACCOUNT_ID, got $account_id"
  fi
}

set_app_tf_vars() {
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
  export TF_VAR_backend_desired_count="$BACKEND_DESIRED_COUNT"
  export TF_VAR_rds_instance_class="$RDS_INSTANCE_CLASS"
  export TF_VAR_rds_allocated_storage_gb="$RDS_ALLOCATED_STORAGE_GB"
  export TF_VAR_rds_max_allocated_storage_gb="$RDS_MAX_ALLOCATED_STORAGE_GB"
  export TF_VAR_rds_multi_az="$RDS_MULTI_AZ"
  export TF_VAR_rds_backup_retention_days="$RDS_BACKUP_RETENTION_DAYS"
  export TF_VAR_redis_node_type="$REDIS_NODE_TYPE"
  export TF_VAR_redis_replicas_per_node_group="$REDIS_REPLICAS_PER_NODE_GROUP"
  export TF_VAR_backend_image_tag="$IMAGE_TAG"
  export TF_VAR_migration_image_tag="$IMAGE_TAG"
  export TF_VAR_log_retention_days="$LOG_RETENTION_DAYS"
  export TF_VAR_app_secret_recovery_window_days="$APP_SECRET_RECOVERY_WINDOW_DAYS"

  if [[ "$RDS_FINAL_SNAPSHOT" == "create" ]]; then
    export TF_VAR_rds_skip_final_snapshot=false
    export TF_VAR_rds_final_snapshot_identifier
    TF_VAR_rds_final_snapshot_identifier="$(final_snapshot_identifier)"
  else
    export TF_VAR_rds_skip_final_snapshot=true
    unset TF_VAR_rds_final_snapshot_identifier
  fi
}

final_snapshot_identifier() {
  printf '%s-final-%s\n' "$PROJECT" "$(date -u +%Y%m%d-%H%M%S)" | tr '[:upper:]' '[:lower:]'
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

read_app_outputs() {
  local outputs
  outputs="$(terraform -chdir="$APP_DIR" output -json)"
  FRONTEND_BUCKET_NAME="$(printf '%s' "$outputs" | json_get frontend_bucket_name.value)"
}

read_frontend_bucket_name() {
  local bucket outputs
  outputs="$(terraform -chdir="$APP_DIR" output -json)" || return 2

  bucket="$(printf '%s' "$outputs" | jq -er '.frontend_bucket_name.value // empty')" || return 1
  if [[ -z "$bucket" ]]; then
    return 1
  fi

  printf '%s\n' "$bucket"
}

delete_s3_payload() {
  local bucket="$1"
  local payload="$2"
  local result
  result="$(aws s3api delete-objects \
    --bucket "$bucket" \
    --delete "$payload" \
    --region "$AWS_REGION" \
    --output json)"

  if [[ -z "${result//[[:space:]]/}" ]]; then
    return 0
  fi

  printf '%s' "$result" | jq -er '
    if ((.Errors // []) | length) > 0 then
      "S3 delete failed: \(.Errors | tojson)" | halt_error(1)
    else
      true
    end
  ' > /dev/null
}

payloads_from_current_objects() {
  jq -c --argjson max "$MAX_S3_DELETE_OBJECTS" '
    [.Contents[]? | { Key }] as $objects
    | range(0; ($objects | length); $max) as $index
    | { Objects: $objects[$index:($index + $max)], Quiet: true }
  '
}

payloads_from_versions() {
  jq -c --argjson max "$MAX_S3_DELETE_OBJECTS" '
    ([.Versions[]? | { Key, VersionId }] + [.DeleteMarkers[]? | { Key, VersionId }]) as $objects
    | range(0; ($objects | length); $max) as $index
    | { Objects: $objects[$index:($index + $max)], Quiet: true }
  '
}

empty_s3_current_objects() {
  local bucket="$1"
  local continuation_token=""
  local list_json next_token payload

  while :; do
    if [[ -n "$continuation_token" ]]; then
      list_json="$(aws s3api list-objects-v2 \
        --bucket "$bucket" \
        --continuation-token "$continuation_token" \
        --region "$AWS_REGION" \
        --output json)"
    else
      list_json="$(aws s3api list-objects-v2 \
        --bucket "$bucket" \
        --region "$AWS_REGION" \
        --output json)"
    fi

    while IFS= read -r payload; do
      [[ -n "$payload" ]] && delete_s3_payload "$bucket" "$payload"
    done < <(printf '%s' "$list_json" | payloads_from_current_objects)

    next_token="$(printf '%s' "$list_json" | jq -r 'select(.IsTruncated == true) | .NextContinuationToken // empty')"
    [[ -z "$next_token" ]] && break
    continuation_token="$next_token"
  done
}

empty_s3_versions_and_delete_markers() {
  local bucket="$1"
  local key_marker=""
  local version_id_marker=""
  local list_json next_key_marker next_version_id_marker payload
  local args

  while :; do
    args=(s3api list-object-versions --bucket "$bucket" --region "$AWS_REGION" --output json)
    if [[ -n "$key_marker" ]]; then
      args+=(--key-marker "$key_marker")
    fi
    if [[ -n "$version_id_marker" ]]; then
      args+=(--version-id-marker "$version_id_marker")
    fi
    list_json="$(aws "${args[@]}")"

    while IFS= read -r payload; do
      [[ -n "$payload" ]] && delete_s3_payload "$bucket" "$payload"
    done < <(printf '%s' "$list_json" | payloads_from_versions)

    next_key_marker="$(printf '%s' "$list_json" | jq -r 'select(.IsTruncated == true) | .NextKeyMarker // empty')"
    next_version_id_marker="$(printf '%s' "$list_json" | jq -r 'select(.IsTruncated == true) | .NextVersionIdMarker // empty')"
    [[ -z "$next_key_marker" ]] && break
    key_marker="$next_key_marker"
    version_id_marker="$next_version_id_marker"
  done
}

empty_s3_bucket() {
  local bucket="$1"
  log "Emptying S3 bucket $bucket"
  empty_s3_current_objects "$bucket"
  empty_s3_versions_and_delete_markers "$bucket"
}

destroy_app_when_state_exists() {
  local app_state_status=0
  state_exists "$APP_DIR" || app_state_status=$?

  if [[ "$app_state_status" -eq 1 ]]; then
    log "Decision destroy_app_skip reason=app_state_missing"
    return
  elif [[ "$app_state_status" -ne 0 ]]; then
    fail "Unable to determine whether app Terraform state exists"
  fi

  local frontend_bucket_status=0
  FRONTEND_BUCKET_NAME="$(read_frontend_bucket_name)" || frontend_bucket_status=$?
  if [[ "$frontend_bucket_status" -eq 0 && -n "$FRONTEND_BUCKET_NAME" ]]; then
    empty_s3_bucket "$FRONTEND_BUCKET_NAME"
  elif [[ "$frontend_bucket_status" -eq 1 ]]; then
    log "Decision empty_frontend_bucket_skip reason=frontend_bucket_output_missing"
  else
    fail "Unable to read frontend bucket output before destroy"
  fi

  set_app_tf_vars
  terraform -chdir="$APP_DIR" destroy -auto-approve -input=false
}

main() {
  cd "$REPO_ROOT"
  require_command jq
  read_config
  log "Decision destroy_start project=$PROJECT"
  assert_expected_account

  local state_bucket_status=0
  bucket_exists "$STATE_BUCKET_NAME" || state_bucket_status=$?
  if [[ "$state_bucket_status" -eq 0 ]]; then
    init_app
    destroy_app_when_state_exists
  elif [[ "$state_bucket_status" -eq 1 ]]; then
    log "Decision destroy_app_skip reason=app_state_missing"
  else
    fail "Unable to determine whether shared state bucket exists"
  fi
}

main "$@"
