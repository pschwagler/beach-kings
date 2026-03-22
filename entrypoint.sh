#!/bin/bash
# Use set -e but allow controlled error handling for migrations
set -e

echo "🏐 Beach Volleyball ELO System - Starting Services"
echo "=================================================="
echo ""

# Wait for PostgreSQL to be ready (if pg_isready is available)
if command -v pg_isready &> /dev/null; then
    echo "⏳ Waiting for PostgreSQL to be ready..."
    until pg_isready -h "${POSTGRES_HOST:-postgres}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-beachkings}" 2>/dev/null; do
        echo "   PostgreSQL is unavailable - sleeping"
        sleep 1
    done
    echo "✅ PostgreSQL is ready!"
    echo ""
else
    # Fallback: simple sleep if pg_isready not available
    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 3
    echo "✅ Proceeding (pg_isready not available, using sleep)..."
    echo ""
fi

# Run database migrations
echo "🔄 Running database migrations..."
echo "   Current directory: $(pwd)"
echo "   DATABASE_URL: ${DATABASE_URL:-not set}"
echo "   Environment: ${ENV:-development}"
echo "   ENV variable value: '${ENV}'"

echo "   Checking current migration version..."
set +e  # Temporarily disable exit on error
(cd /app/backend && PYTHONPATH=/app python -m alembic current 2>&1) || echo "   ⚠️  Could not check current version (this is OK if database is new)"
set -e  # Re-enable exit on error
echo ""
echo "   Running migrations..."
set +e
MIGRATION_OUTPUT=$(cd /app/backend && PYTHONPATH=/app python -m alembic upgrade head 2>&1)
MIGRATION_EXIT=$?
set -e

if [ $MIGRATION_EXIT -ne 0 ]; then
    echo ""
    echo "❌ ERROR: Database migrations failed!"
    echo "   Migration output:"
    echo "$MIGRATION_OUTPUT" | tail -20
    exit 1
fi
echo ""
echo "✅ Migrations complete!"
echo "   Verifying migration version..."
set +e  # Temporarily disable exit on error
(cd /app/backend && PYTHONPATH=/app python -m alembic current 2>&1) || echo "   ⚠️  Could not verify version"
set -e  # Re-enable exit on error
echo ""

# Start WhatsApp service if ENABLE_WHATSAPP is true (or True or TRUE). Default to true.
# Commented out - WhatsApp service is inactive
# if [ "${ENABLE_WHATSAPP:-true}" = "true" ] || [ "${ENABLE_WHATSAPP:-true}" = "True" ] || [ "${ENABLE_WHATSAPP:-true}" = "TRUE" ]; then
#     echo "📱 Starting WhatsApp service on port 3001..."
#     cd /app/services/whatsapp
#     WHATSAPP_PORT=3001 node server.js &
#     WHATSAPP_PID=$!
#     echo "✅ WhatsApp service started (PID: $WHATSAPP_PID)"
#     echo ""
#     cd /app
# else
#     echo "⚠️  WhatsApp service disabled (ENABLE_WHATSAPP=false)"
#     echo ""
# fi
echo "⚠️  WhatsApp service is inactive (whatsapp-web.js uninstalled)"
echo ""

# Start main backend API
echo "📡 Starting Backend API on port ${BACKEND_INTERNAL_PORT:-8000}..."

# Check if DEBUG_BACKEND is enabled
if [ "${DEBUG_BACKEND:-0}" = "1" ]; then
    echo "🪲 DEBUG_BACKEND=1 → Starting with debugpy on port 5678..."
    echo "   Attach VS Code debugger to localhost:5678"
    exec python -m debugpy \
        --listen 0.0.0.0:${DEBUGPY_PORT:-5678} \
        --wait-for-client \
        -m uvicorn backend.api.main:app \
        --host 0.0.0.0 \
        --port ${BACKEND_INTERNAL_PORT:-8000} \
        --reload \
        --reload-dir /app/backend
elif [ "${ENV:-development}" != "production" ] && [ "${ENV:-development}" != "staging" ]; then
    echo "🔄 Auto-reload enabled (development mode)"
    echo "   Watching: /app/backend for changes..."
    exec uvicorn backend.api.main:app \
        --host 0.0.0.0 \
        --port ${BACKEND_INTERNAL_PORT:-8000} \
        --reload \
        --reload-dir /app/backend
else
    echo "⚡ Production mode (no reload)"
    exec uvicorn backend.api.main:app --host 0.0.0.0 --port ${BACKEND_INTERNAL_PORT:-8000}
fi