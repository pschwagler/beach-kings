#!/bin/bash
# Restore a gzipped DB snapshot on the dev environment.
# Stops app containers, drops/recreates DB, restores dump, sanitizes PII,
# then restarts everything.
#
# Usage: bash deployment/restore-db.sh ~/snapshots/latest.sql.gz

set -e

SNAPSHOT_PATH="${1:?Usage: bash deployment/restore-db.sh <path-to-snapshot.sql.gz>}"

if [ ! -f "$SNAPSHOT_PATH" ]; then
    echo "❌ Snapshot file not found: ${SNAPSHOT_PATH}"
    exit 1
fi

echo "🗄️  Restoring database from ${SNAPSHOT_PATH}"
echo "=================================================="

# ---------------------------------------------------------------------------
# 1. Stop app containers (keep postgres + redis running)
# ---------------------------------------------------------------------------
echo ""
echo "⏹️  Stopping app containers..."
docker compose stop backend frontend || true

# ---------------------------------------------------------------------------
# 2. Drop and recreate database
# ---------------------------------------------------------------------------
echo ""
echo "🔄 Dropping and recreating database..."
docker exec beach-kings-postgres \
    psql -U beachkings -d postgres -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = 'beachkings' AND pid <> pg_backend_pid();
    " > /dev/null 2>&1 || true

docker exec beach-kings-postgres \
    psql -U beachkings -d postgres -c "DROP DATABASE IF EXISTS beachkings;"

docker exec beach-kings-postgres \
    psql -U beachkings -d postgres -c "CREATE DATABASE beachkings OWNER beachkings;"

echo "✅ Database recreated"

# ---------------------------------------------------------------------------
# 3. Restore from gzipped dump
# ---------------------------------------------------------------------------
echo ""
echo "📥 Restoring dump..."
gunzip -c "$SNAPSHOT_PATH" | docker exec -i beach-kings-postgres \
    psql -U beachkings -d beachkings --quiet --single-transaction

echo "✅ Dump restored"

# ---------------------------------------------------------------------------
# 4. Sanitize PII and prevent outbound comms
# ---------------------------------------------------------------------------
echo ""
echo "🧹 Sanitizing data..."
docker exec beach-kings-postgres \
    psql -U beachkings -d beachkings -c "
-- Auth tokens (no need to preserve sessions)
TRUNCATE refresh_tokens, password_reset_tokens, verification_codes;

-- Contact info: replace with dev placeholders (keep names per project preference)
UPDATE users SET
    phone_number = 'dev-' || id,
    email = 'dev-' || id || '@test.local',
    password_hash = '\$2b\$12\$DevEnvironmentFixedHashForAllUsersXXXXXXXXXXXX';

-- Player PII: clear sensitive fields (keep full_name, nickname, stats)
UPDATE players SET
    date_of_birth = NULL,
    profile_picture_url = NULL,
    city_latitude = NULL,
    city_longitude = NULL,
    avp_playerProfileId = NULL;

-- External identifiers
UPDATE leagues SET whatsapp_group_id = NULL;

-- User-generated content that may contain PII
TRUNCATE league_messages, feedback, notifications;

-- CRITICAL: prevent SMS/email sends via DB settings override
DELETE FROM settings WHERE key IN ('enable_sms', 'enable_email');
INSERT INTO settings (key, value) VALUES ('enable_sms', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false';
INSERT INTO settings (key, value) VALUES ('enable_email', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false';
"

echo "✅ PII sanitized, SMS/email disabled in DB settings"

# ---------------------------------------------------------------------------
# 5. Restart all containers (migrations run automatically via entrypoint.sh)
# ---------------------------------------------------------------------------
echo ""
echo "🚀 Starting all containers..."
docker compose up -d --build

echo ""
echo "=================================================="
echo "✅ Database restore complete"
echo "   Alembic migrations will run automatically on backend startup."
