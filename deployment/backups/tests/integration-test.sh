#!/usr/bin/env bash
# End-to-end backup and restore test using disposable PostgreSQL containers.

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
SOURCE_CONTAINER="beach-kings-backup-source-$$"
FAILURE_WORK_DIR="$TEST_ROOT/failure-work"
export FAKE_S3_ROOT="$TEST_ROOT/s3"
export PATH="$SCRIPT_DIR/bin:$PATH"

# macOS does not ship util-linux flock. Production and ubuntu-latest use the
# real command; the compatibility function only keeps this integration test
# runnable on a macOS workstation.
if ! command -v flock >/dev/null 2>&1; then
    flock() { return 0; }
    export -f flock
fi

cleanup() {
    docker rm -f "$SOURCE_CONTAINER" >/dev/null 2>&1 || true
    rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

mkdir -p "$FAKE_S3_ROOT" "$TEST_ROOT/work" "$FAILURE_WORK_DIR"

echo "Starting disposable source PostgreSQL"
docker run -d --rm \
    --name "$SOURCE_CONTAINER" \
    --env POSTGRES_USER=beachkings \
    --env POSTGRES_PASSWORD=integration-test-only \
    --env POSTGRES_DB=beachkings \
    postgres:16-alpine >/dev/null

ready=false
for _ in $(seq 1 30); do
    if docker exec "$SOURCE_CONTAINER" pg_isready -U beachkings -d beachkings >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    echo "source PostgreSQL did not become ready" >&2
    exit 1
fi

docker exec "$SOURCE_CONTAINER" psql -U beachkings -d beachkings -v ON_ERROR_STOP=1 -c \
    "CREATE TABLE backup_probe (id integer PRIMARY KEY, value text NOT NULL);
     INSERT INTO backup_probe VALUES (1, 'verified');" >/dev/null

echo "Running backup and filesystem-backed S3 upload"
BACKUP_S3_BUCKET=integration-backups \
BACKUP_AWS_REGION=us-east-1 \
BACKUP_POSTGRES_CONTAINER="$SOURCE_CONTAINER" \
BACKUP_WORK_DIR="$TEST_ROOT/work" \
BACKUP_LOCK_FILE="$TEST_ROOT/backup.lock" \
BACKUP_LOCAL_RETENTION_DAYS=2 \
    "$BACKUP_DIR/backup-postgres-to-s3.sh"

backup_path="$(find "$FAKE_S3_ROOT/integration-backups" -type f -name '*.dump' -print -quit)"
if [[ -z "$backup_path" || ! -f "${backup_path}.sha256" ]]; then
    echo "backup archive or checksum was not uploaded" >&2
    exit 1
fi

backup_uri="s3://integration-backups/${backup_path#"$FAKE_S3_ROOT/integration-backups/"}"
echo "Running isolated restore drill"
BACKUP_AWS_REGION=us-east-1 "$BACKUP_DIR/restore-drill.sh" "$backup_uri"

echo "Verifying checksum corruption is rejected before restore"
cp "${backup_path}.sha256" "${backup_path}.sha256.valid"
printf '%064d  %s\n' 0 "$(basename "$backup_path")" >"${backup_path}.sha256"
set +e
BACKUP_AWS_REGION=us-east-1 "$BACKUP_DIR/restore-drill.sh" "$backup_uri" >/dev/null 2>&1
checksum_status=$?
set -e
mv "${backup_path}.sha256.valid" "${backup_path}.sha256"
if [[ "$checksum_status" -eq 0 ]]; then
    echo "restore drill unexpectedly accepted a corrupt checksum" >&2
    exit 1
fi

echo "Verifying failed uploads return failure and remove partial local files"
set +e
FAKE_AWS_FAIL_UPLOAD=true \
BACKUP_S3_BUCKET=integration-backups \
BACKUP_POSTGRES_CONTAINER="$SOURCE_CONTAINER" \
BACKUP_WORK_DIR="$FAILURE_WORK_DIR" \
BACKUP_LOCK_FILE="$TEST_ROOT/failure.lock" \
    "$BACKUP_DIR/backup-postgres-to-s3.sh" >/dev/null 2>&1
upload_status=$?
set -e
if [[ "$upload_status" -eq 0 ]]; then
    echo "backup unexpectedly succeeded when S3 upload failed" >&2
    exit 1
fi
if find "$FAILURE_WORK_DIR" -type f -name '*.dump*' -print -quit | grep -q .; then
    echo "partial local backup files remained after upload failure" >&2
    exit 1
fi

echo "Backup integration test passed"
