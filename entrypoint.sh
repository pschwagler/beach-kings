#!/bin/bash
set -e

echo "🏐 Beach Volleyball ELO System - Starting Services"
echo "=================================================="
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
exec uvicorn backend.api.main:app --host 0.0.0.0 --port 8000

