#!/bin/bash
# Snapshot the production database.
# Creates a gzipped pg_dump at ~/snapshots/latest.sql.gz.
#
# Usage: bash deployment/snapshot-db.sh

set -e

SNAPSHOT_DIR="${HOME}/snapshots"
SNAPSHOT_PATH="${SNAPSHOT_DIR}/latest.sql.gz"

echo "📸 Creating database snapshot..."

mkdir -p "$SNAPSHOT_DIR"

docker exec beach-kings-postgres \
    pg_dump -U beachkings -d beachkings \
    | gzip > "$SNAPSHOT_PATH"

SIZE=$(du -h "$SNAPSHOT_PATH" | cut -f1)
echo "✅ Snapshot saved: ${SNAPSHOT_PATH} (${SIZE})"
