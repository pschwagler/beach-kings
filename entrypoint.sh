#!/bin/bash
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
echo "   Checking current migration version..."
if ! (cd /app/backend && PYTHONPATH=/app python -m alembic current 2>&1); then
    echo "   ⚠️  Could not check current version (this is OK if database is new)"
fi
echo ""
echo "   Running migrations..."
if ! (cd /app/backend && PYTHONPATH=/app python -m alembic upgrade head 2>&1); then
    echo ""
    echo "❌ ERROR: Database migrations failed!"
    echo "   This is a critical error. The application may not work correctly."
    echo "   Check the error messages above for details."
    echo "   You may need to manually fix the database state."
    exit 1
fi
echo ""
echo "✅ Migrations complete!"
echo "   Verifying migration version..."
(cd /app/backend && PYTHONPATH=/app python -m alembic current 2>&1) || echo "   ⚠️  Could not verify version"
echo ""

# Start WhatsApp service if ENABLE_WHATSAPP is true (or True or TRUE). Default to true.
if [ "${ENABLE_WHATSAPP:-true}" = "true" ] || [ "${ENABLE_WHATSAPP:-true}" = "True" ] || [ "${ENABLE_WHATSAPP:-true}" = "TRUE" ]; then
    echo "📱 Starting WhatsApp service on port 3001..."
    cd /app/whatsapp-service
    # Set WHATSAPP_PORT to avoid conflicts with Railway's PORT env var
    WHATSAPP_PORT=3001 node server.js &
    WHATSAPP_PID=$!
    echo "✅ WhatsApp service started (PID: $WHATSAPP_PID)"
    echo ""
    cd /app
else
    echo "⚠️  WhatsApp service disabled (ENABLE_WHATSAPP=false)"
    echo ""
fi

# Start main backend API
echo "📡 Starting Backend API on port 8000..."
# Use --reload in development (when ENV is not production)
if [ "${ENV:-development}" != "production" ]; then
    echo "🔄 Auto-reload enabled (development mode)"
    exec uvicorn backend.api.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "⚡ Production mode (no reload)"
    exec uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
fi

