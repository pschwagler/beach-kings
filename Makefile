.PHONY: help install dev dev-basic dev-backend watch build start clean clean-venv test whatsapp whatsapp-install ensure-docker migrate

BACKEND_PORT ?= 8000
BACKEND_HOST ?= 0.0.0.0
BACKEND_APP ?= backend.api.main:app
DEBUG_BACKEND ?= 0
DEBUGPY_PORT ?= 5678

ensure-docker:
	@echo "Checking Docker services..."
	@if ! command -v docker-compose >/dev/null 2>&1 && ! command -v docker >/dev/null 2>&1; then \
		echo "❌ Docker is not installed. Please install Docker to continue."; \
		exit 1; \
	fi
	@if ! docker ps >/dev/null 2>&1; then \
		echo "❌ Docker daemon is not running. Please start Docker and try again."; \
		exit 1; \
	fi
	@echo "✅ Docker is ready!"

help:
	@echo "Beach Volleyball ELO - Available Commands:"
	@echo ""
	@echo "  make install           - Install all dependencies (Python + Frontend + WhatsApp)"
	@echo "  make dev               - Start ALL services (backend + postgres + WhatsApp + frontend dev server)"
	@echo "  make dev-basic         - Start backend + postgres + frontend dev server (no WhatsApp)"
	@echo "  make dev-backend       - Start backend only with Docker Compose"
	@echo "  make watch             - Watch and rebuild frontend only"
	@echo "  make build             - Build frontend for production"
	@echo "  make start             - Build frontend + start backend"
	@echo "  make clean             - Remove build artifacts and Docker containers/volumes"
	@echo "  make clean-venv        - Remove Python virtual environment"
	@echo "  make migrate           - Run database migrations (alembic upgrade head)"
	@echo "  make test              - Run tests"
	@echo ""
	@echo "WhatsApp Integration:"
	@echo "  make whatsapp-install  - Install WhatsApp service dependencies"
	@echo "  make whatsapp          - Start WhatsApp service only (run in separate terminal)"
	@echo ""
	@echo "Quick Start:"
	@echo "  make install           → Install everything"
	@echo "  make dev               → Start all services and code!"
	@echo ""

install:
	@echo "Setting up Python virtual environment..."
	@if [ ! -d "venv" ]; then \
		PYTHON_CMD=""; \
		for cmd in python3.12 python3.11 python3.10 python3.9 python3.8 python3; do \
			if command -v $$cmd >/dev/null 2>&1; then \
				VERSION=$$($$cmd --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1); \
				MAJOR=$$(echo $$VERSION | cut -d. -f1); \
				MINOR=$$(echo $$VERSION | cut -d. -f2); \
				if [ "$$MAJOR" -eq 3 ] && [ "$$MINOR" -ge 8 ]; then \
					PYTHON_CMD=$$cmd; \
					echo "Found $$cmd (Python $$VERSION)"; \
					break; \
				fi; \
			fi; \
		done; \
		if [ -z "$$PYTHON_CMD" ]; then \
			echo "❌ ERROR: Python 3.8+ is required but not found."; \
			echo "Please install Python 3.8 or higher and try again."; \
			exit 1; \
		fi; \
		$$PYTHON_CMD -m venv venv; \
		echo "✅ Virtual environment created with $$PYTHON_CMD!"; \
	else \
		echo "Virtual environment already exists"; \
	fi
	@echo "Installing Python dependencies..."
	./venv/bin/pip install --upgrade pip
	./venv/bin/pip install -r requirements.txt
	@echo "Installing frontend dependencies..."
	cd frontend && npm install
	@echo "Installing WhatsApp service dependencies..."
	cd whatsapp-service && npm install
	@echo "✅ All dependencies installed!"
	@echo ""
	@echo "Ready to go! Run 'make dev' to start all services."

whatsapp-install:
	@echo "Installing WhatsApp service dependencies..."
	cd whatsapp-service && npm install
	@echo "✅ WhatsApp service dependencies installed!"

dev: ensure-docker
	@echo "🚀 Starting ALL services (backend + postgres + WhatsApp + frontend)..."
	@echo "📡 Backend: http://localhost:8000 (auto-reload)"
	@echo "📱 WhatsApp: http://localhost:3001"
	@echo "🎨 Frontend: http://localhost:3000 (Vite dev server)"
	@echo ""
	@echo "🌐 Visit: http://localhost:3000 (frontend dev server)"
	@echo "📱 WhatsApp setup: http://localhost:8000/whatsapp"
	@echo ""
	@echo "Press Ctrl+C to stop all services"
	@echo ""
	@trap 'docker compose down' EXIT INT TERM; \
	cd frontend && npx concurrently --names "DOCKER,FRONTEND" --prefix-colors "blue,green" \
		"docker compose up" \
		"npm run dev"

dev-basic: ensure-docker
	@echo "🚀 Starting backend + postgres + frontend (no WhatsApp)..."
	@echo "📡 Backend: http://localhost:8000 (auto-reload)"
	@echo "🎨 Frontend: http://localhost:3000 (Vite dev server)"
	@echo ""
	@echo "🌐 Visit: http://localhost:3000 (frontend dev server)"
	@echo ""
	@echo "Press Ctrl+C to stop"
	@echo ""
	@trap 'ENABLE_WHATSAPP=false docker compose down' EXIT INT TERM; \
	cd frontend && npx concurrently --names "DOCKER,FRONTEND" --prefix-colors "blue,green" \
		"ENABLE_WHATSAPP=false docker compose up" \
		"npm run dev"

dev-backend: ensure-docker
	@echo "Starting backend only with Docker Compose (auto-reload)..."
	@echo "Visit: http://localhost:8000"
	@docker compose up backend

watch:
	@echo "Watching frontend files and rebuilding on changes..."
	@echo "Backend must be running (make dev-backend in another terminal)"
	@echo "Visit: http://localhost:8000 (refresh browser after changes)"
	cd frontend && npm run build -- --watch

build:
	@echo "Building frontend..."
	cd frontend && npm run build
	@echo "✅ Frontend built!"

start: ensure-docker build
	@echo "Starting production server with Docker Compose..."
	@ENV=production docker compose up

clean:
	@echo "Cleaning up..."
	@echo "Stopping and removing Docker containers and volumes..."
	@docker compose down -v 2>/dev/null || docker-compose down -v 2>/dev/null || true
	@if [ -n "$$(docker ps -a --filter 'name=beach-kings' --format '{{.ID}}' 2>/dev/null)" ]; then \
		docker ps -a --filter "name=beach-kings" --format "{{.ID}}" | xargs docker rm -f 2>/dev/null || true; \
	fi
	@if [ -n "$$(docker volume ls --filter 'name=beach-kings' --format '{{.Name}}' 2>/dev/null)" ]; then \
		docker volume ls --filter "name=beach-kings" --format "{{.Name}}" | xargs docker volume rm 2>/dev/null || true; \
	fi
	@if [ -n "$$(docker volume ls --filter 'name=postgres_data' --format '{{.Name}}' 2>/dev/null)" ]; then \
		docker volume ls --filter "name=postgres_data" --format "{{.Name}}" | xargs docker volume rm 2>/dev/null || true; \
	fi
	@echo "Removing build artifacts..."
	rm -rf frontend/dist
	rm -rf **/__pycache__
	rm -rf backend/**/__pycache__
	@echo "✅ Cleanup complete!"

clean-venv:
	@echo "Removing Python virtual environment..."
	rm -rf venv
	@echo "✅ Virtual environment removed!"
	@echo ""
	@echo "Run 'make install' to create a new venv with Python 3.8+"

migrate:
	@echo "Running database migrations..."
	@if ! docker ps --format '{{.Names}}' | grep -q '^beach-kings-backend$$'; then \
		echo "❌ Backend container is not running. Start it with 'make dev' or 'docker compose up -d backend'"; \
		exit 1; \
	fi
	@docker exec beach-kings-backend bash -c "cd /app/backend && PYTHONPATH=/app python -m alembic upgrade head"
	@echo "✅ Migrations complete!"

test:
	@echo "Running tests..."
	./venv/bin/pytest backend/tests/ -v

whatsapp:
	@echo "🚀 Starting WhatsApp service..."
	@echo "📱 Service: http://localhost:3001"
	@echo "🌐 Visit /whatsapp in the app to connect"
	@echo ""
	@echo "Press Ctrl+C to stop"
	@echo ""
	cd whatsapp-service && npm start


