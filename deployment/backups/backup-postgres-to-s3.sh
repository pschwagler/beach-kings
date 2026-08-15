#!/usr/bin/env bash
# Daily PostgreSQL backup with integrity validation and S3 archival.

set -Eeuo pipefail

BACKUP_BUCKET="${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
BACKUP_PREFIX="${BACKUP_S3_PREFIX:-database/production}"
AWS_REGION="${BACKUP_AWS_REGION:-us-east-1}"
POSTGRES_CONTAINER="${BACKUP_POSTGRES_CONTAINER:-}"
COMPOSE_PROJECT_DIR="${BACKUP_COMPOSE_PROJECT_DIR:-/home/ubuntu/beach-kings}"
POSTGRES_DATABASE="${BACKUP_POSTGRES_DB:-beachkings}"
POSTGRES_USER="${BACKUP_POSTGRES_USER:-beachkings}"
LOCAL_RETENTION_DAYS="${BACKUP_LOCAL_RETENTION_DAYS:-2}"
SSE_MODE="${BACKUP_S3_SSE:-AES256}"
KMS_KEY_ID="${BACKUP_S3_KMS_KEY_ID:-}"
SNS_TOPIC_ARN="${BACKUP_SNS_TOPIC_ARN:-}"
BACKUP_WORK_DIR="${BACKUP_WORK_DIR:-/var/lib/beach-kings-backups}"
LOCK_FILE="${BACKUP_LOCK_FILE:-/tmp/beach-kings-db-backup.lock}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
date_prefix="$(date -u +%Y/%m/%d)"
backup_name="beach-kings-${timestamp}.dump"
backup_path="${BACKUP_WORK_DIR}/${backup_name}"
checksum_path="${backup_path}.sha256"
object_key="${BACKUP_PREFIX%/}/${date_prefix}/${backup_name}"

notify_failure() {
    local exit_code=$?
    trap - ERR
    echo "ERROR: database backup failed (exit ${exit_code})" >&2
    if [[ -n "$SNS_TOPIC_ARN" ]] && command -v aws >/dev/null 2>&1; then
        aws sns publish \
            --region "$AWS_REGION" \
            --topic-arn "$SNS_TOPIC_ARN" \
            --subject "Beach Kings production database backup failed" \
            --message "Database backup failed on $(hostname) at ${timestamp}. Check the systemd journal." \
            >/dev/null 2>&1 || true
    fi
    exit "$exit_code"
}
trap notify_failure ERR

for command_name in aws docker flock sha256sum; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "ERROR: required command is unavailable: ${command_name}" >&2
        exit 1
    fi
done

if ! [[ "$LOCAL_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
    echo "ERROR: BACKUP_LOCAL_RETENTION_DAYS must be a non-negative integer" >&2
    exit 1
fi

mkdir -p "$BACKUP_WORK_DIR"
chmod 700 "$BACKUP_WORK_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    echo "ERROR: another database backup is already running" >&2
    exit 1
fi

if [[ -z "$POSTGRES_CONTAINER" ]]; then
    if docker compose version >/dev/null 2>&1; then
        compose_command=(docker compose)
    elif command -v docker-compose >/dev/null 2>&1; then
        compose_command=(docker-compose)
    else
        echo "ERROR: Docker Compose is unavailable" >&2
        exit 1
    fi

    POSTGRES_CONTAINER="$("${compose_command[@]}" \
        --project-directory "$COMPOSE_PROJECT_DIR" \
        ps -q postgres)"
    if [[ -z "$POSTGRES_CONTAINER" ]]; then
        echo "ERROR: the Compose PostgreSQL container is not running" >&2
        exit 1
    fi
fi

cleanup_partial_files() {
    rm -f "$backup_path" "$checksum_path"
}
trap cleanup_partial_files EXIT

echo "Creating PostgreSQL backup ${backup_name}"
docker exec "$POSTGRES_CONTAINER" \
    pg_dump \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DATABASE" \
    --format custom \
    --compress 9 \
    --no-owner \
    --no-acl >"$backup_path"

if [[ ! -s "$backup_path" ]]; then
    echo "ERROR: pg_dump produced an empty file" >&2
    exit 1
fi

# A custom-format dump can be listed without restoring it. This catches a
# truncated or otherwise unreadable archive before it is sent off-host.
docker exec -i "$POSTGRES_CONTAINER" pg_restore --list <"$backup_path" >/dev/null

(
    cd "$BACKUP_WORK_DIR"
    sha256sum "$backup_name" >"${backup_name}.sha256"
)

sse_args=(--sse "$SSE_MODE")
if [[ "$SSE_MODE" == "aws:kms" ]]; then
    if [[ -z "$KMS_KEY_ID" ]]; then
        echo "ERROR: BACKUP_S3_KMS_KEY_ID is required when BACKUP_S3_SSE=aws:kms" >&2
        exit 1
    fi
    sse_args+=(--sse-kms-key-id "$KMS_KEY_ID")
elif [[ "$SSE_MODE" != "AES256" ]]; then
    echo "ERROR: BACKUP_S3_SSE must be AES256 or aws:kms" >&2
    exit 1
fi

echo "Uploading encrypted backup to s3://${BACKUP_BUCKET}/${object_key}"
aws s3 cp "$backup_path" "s3://${BACKUP_BUCKET}/${object_key}" \
    --region "$AWS_REGION" \
    --only-show-errors \
    "${sse_args[@]}"
aws s3 cp "$checksum_path" "s3://${BACKUP_BUCKET}/${object_key}.sha256" \
    --region "$AWS_REGION" \
    --only-show-errors \
    "${sse_args[@]}"

# Confirm that both objects are visible before reporting success.
aws s3api head-object \
    --bucket "$BACKUP_BUCKET" \
    --key "$object_key" \
    --region "$AWS_REGION" >/dev/null
aws s3api head-object \
    --bucket "$BACKUP_BUCKET" \
    --key "${object_key}.sha256" \
    --region "$AWS_REGION" >/dev/null

# The backup is durable in S3 now. Keep successful local files according to the
# configured short retention window; the EXIT trap only cleans partial runs.
trap - EXIT
if (( LOCAL_RETENTION_DAYS == 0 )); then
    rm -f "$backup_path" "$checksum_path"
else
    find "$BACKUP_WORK_DIR" -maxdepth 1 -type f \
        \( -name 'beach-kings-*.dump' -o -name 'beach-kings-*.dump.sha256' \) \
        -mtime "+${LOCAL_RETENTION_DAYS}" -delete
fi

size_bytes="$(stat -c %s "$backup_path" 2>/dev/null || echo uploaded)"
echo "Backup complete: s3://${BACKUP_BUCKET}/${object_key} (${size_bytes} bytes)"
