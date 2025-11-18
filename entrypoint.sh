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

