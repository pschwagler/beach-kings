#!/usr/bin/env bash

set -euo pipefail

DEBUG_BACKEND="${DEBUG_BACKEND:-0}"
BACKEND_APP="${BACKEND_APP:-backend.api.main:app}"
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
DEBUGPY_PORT="${DEBUGPY_PORT:-5678}"

if [ ! -x "./venv/bin/uvicorn" ]; then
  echo "❌ uvicorn not found in ./venv/bin. Did you run 'make install'?"
  exit 1
fi

if [ "$DEBUG_BACKEND" = "1" ]; then
  if ! ./venv/bin/python -c "import debugpy" >/dev/null 2>&1; then
    echo "❌ debugpy is required for DEBUG_BACKEND=1. Install via 'pip install debugpy'."
    exit 1
  fi
  echo "🪲 DEBUG_BACKEND=1 → waiting for debugger on localhost:${DEBUGPY_PORT}..."
  echo "   Start the VS Code 'Attach to backend' config to continue."
  exec ./venv/bin/python -m debugpy \
    --listen "127.0.0.1:${DEBUGPY_PORT}" \
    --wait-for-client \
    -m uvicorn "${BACKEND_APP}" \
    --host "${BACKEND_HOST}" \
    --port "${BACKEND_PORT}"
fi

exec ./venv/bin/uvicorn "${BACKEND_APP}" \
  --reload \
  --host "${BACKEND_HOST}" \
  --port "${BACKEND_PORT}"




