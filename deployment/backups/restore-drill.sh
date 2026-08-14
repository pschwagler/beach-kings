#!/usr/bin/env bash
# Download and restore an S3 backup into an isolated disposable PostgreSQL.

set -Eeuo pipefail

if [[ $# -ne 1 || "$1" != s3://*.dump ]]; then
    echo "Usage: $0 s3://bucket/path/to/backup.dump" >&2
    exit 2
fi

AWS_REGION="${BACKUP_AWS_REGION:-us-east-1}"
POSTGRES_IMAGE="${BACKUP_DRILL_POSTGRES_IMAGE:-postgres:16-alpine}"
source_uri="$1"
drill_dir="$(mktemp -d)"
container_name="beach-kings-restore-drill-${RANDOM}-$$"
backup_name="${source_uri##*/}"
backup_path="${drill_dir}/${backup_name}"
checksum_path="${backup_path}.sha256"

cleanup() {
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    rm -rf "$drill_dir"
}
trap cleanup EXIT

for command_name in aws docker sha256sum; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "ERROR: required command is unavailable: ${command_name}" >&2
        exit 1
    fi
done

echo "Downloading backup and checksum"
aws s3 cp "$source_uri" "$backup_path" --region "$AWS_REGION" --only-show-errors
aws s3 cp "${source_uri}.sha256" "$checksum_path" --region "$AWS_REGION" --only-show-errors

(
    cd "$drill_dir"
    sha256sum --check "$(basename "$checksum_path")"
)

echo "Starting isolated PostgreSQL restore target"
docker run -d --rm \
    --name "$container_name" \
    --env POSTGRES_USER=drill \
    --env POSTGRES_PASSWORD=restore-drill-only \
    --env POSTGRES_DB=restore_drill \
    "$POSTGRES_IMAGE" >/dev/null

ready=false
for _ in $(seq 1 30); do
    if docker exec "$container_name" pg_isready -U drill -d restore_drill >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    echo "ERROR: disposable PostgreSQL did not become ready" >&2
    exit 1
fi

docker cp "$backup_path" "${container_name}:/tmp/backup.dump"
docker exec "$container_name" pg_restore \
    --username drill \
    --dbname restore_drill \
    --no-owner \
    --no-acl \
    --exit-on-error \
    /tmp/backup.dump

table_count="$(docker exec "$container_name" psql -U drill -d restore_drill -Atc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
if [[ ! "$table_count" =~ ^[1-9][0-9]*$ ]]; then
    echo "ERROR: restore completed without any public tables" >&2
    exit 1
fi

echo "Restore drill passed: ${table_count} public tables restored into an isolated container"
