#!/bin/bash

# Beach Volleyball ELO - Start All Services
# This script starts both the main app and WhatsApp service

echo "🏐 Beach League"
echo "================================"
echo ""
echo "Starting all services..."
echo ""

# Check if WhatsApp service dependencies are installed
if [ ! -d "whatsapp-service/node_modules" ]; then
    echo "⚠️  WhatsApp service dependencies not found"
    echo "📦 Installing WhatsApp service dependencies..."
    cd whatsapp-service && npm install && cd ..
    echo "✅ Dependencies installed!"
    echo ""
fi

# Check if Python dependencies are installed
if ! ./venv/bin/python -c "import httpx" 2>/dev/null; then
    echo "⚠️  Python httpx not found"
    echo "📦 Installing Python dependencies..."
    ./venv/bin/pip install httpx
    echo "✅ Dependencies installed!"
    echo ""
fi

# Start PostgreSQL if docker-compose is available
if command -v docker-compose &> /dev/null; then
    echo "🐘 Starting PostgreSQL database..."
    docker-compose up -d postgres
    echo "✅ PostgreSQL started!"
    echo ""
    # Wait for PostgreSQL to be ready
    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 3
fi

echo "🚀 Starting services..."
echo ""
echo "📡 Main Backend: http://localhost:8000"
echo "📱 WhatsApp Service: http://localhost:3001"
echo "🌐 Frontend: http://localhost:8000 (or 5173 if using Vite)"
echo ""
echo "Visit: http://localhost:8000/whatsapp to connect WhatsApp"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Start both services in the background with trap to kill all on Ctrl+C
trap 'kill 0' EXIT

# Start WhatsApp service
(
    cd whatsapp-service
    echo "📱 Starting WhatsApp service on port 3001..."
    npm start
) &

# Give WhatsApp service a moment to start
sleep 2

# Start main backend with auto-reload
echo "📡 Starting main backend on port 8000..."
./venv/bin/uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000

# Wait for background processes
wait

