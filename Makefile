.PHONY: help install dev dev-backend dev-frontend build docker-build docker-up start clean clean-venv test test-local test-clean whatsapp whatsapp-install frontend-install ensure-docker migrate mobile-install mobile-dev mobile-ios mobile-android mobile-test mobile-build mobile-build-ios mobile-build-android

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
	@echo "📱 Mobile App (Expo):"
	@echo "  make mobile-install   - Install mobile app dependencies"
	@echo "  make mobile-dev       - Start mobile dev server (opens Expo dev tools)"
	@echo "  make mobile-ios       - Start mobile dev server and open iOS simulator"
	@echo "  make mobile-android   - Start mobile dev server and open Android emulator"
	@echo "  make mobile-test      - Run mobile app tests"
	@echo "  make mobile-build     - Build mobile app with EAS (requires EAS CLI)"
	@echo "  make mobile-build-ios - Build iOS app only (EAS)"
	@echo "  make mobile-build-android - Build Android app only (EAS)"
	@echo ""
	@echo "🌐 Web App:"
	@echo "  make install           - Install all dependencies (Python + Frontend)"
	@echo "  make dev               - Start ALL services (backend + postgres + frontend dev server)"
	@echo "  make dev-backend       - Start backend only with Docker Compose"
	@echo "  make dev-frontend      - Start frontend dev server only (requires backend running)"
	@echo "  make build             - Build frontend for production"
	@echo "  make start             - Build frontend + start all services with Docker Compose"
	@echo ""
	@echo "🐳 Docker:"
	@echo "  make docker-build      - Build all Docker images"
	@echo "  make docker-up         - Start all services with Docker Compose"
	@echo ""
	@echo "🧹 Maintenance:"
	@echo "  make clean             - Remove build artifacts and Docker containers/volumes"
	@echo "  make clean-venv        - Remove Python virtual environment"
	@echo "  make migrate           - Run database migrations (alembic upgrade head)"
	@echo ""
	@echo "🧪 Testing:"
	@echo "  make test              - Run tests in Docker containers"
	@echo "  make test-local        - Run tests locally (requires venv)"
	@echo ""
	@echo "Quick Start:"
	@echo "  make install           → Install everything"
	@echo "  make dev               → Start all web services"
	@echo "  make mobile-dev        → Start mobile app development"
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
	@echo "Installing root dependencies (Turborepo)..."
	npm install --legacy-peer-deps
	@echo "Installing frontend dependencies..."
	cd apps/web && npm install --legacy-peer-deps
	@echo "Installing mobile dependencies..."
	@echo "(Mobile deps installed via root workspace install above)"
	@echo "✅ All dependencies installed!"
	@echo ""
	@echo "Ready to go! Run 'make dev' to start all services."
	@echo "For mobile: Run 'make mobile-dev' to start mobile app development."

whatsapp-install:
	@echo "Installing WhatsApp service dependencies..."
	cd services/whatsapp && npm install
	@echo "✅ WhatsApp service dependencies installed!"

frontend-install:
	@echo "Installing frontend dependencies..."
	cd apps/web && npm install --legacy-peer-deps
	@echo "✅ Frontend dependencies installed!"

dev: ensure-docker
	@echo "🚀 Starting ALL services (backend + postgres + frontend)..."
	@echo "📡 Backend: http://localhost:8000 (auto-reload)"
	@echo "🎨 Frontend: http://localhost:3000 (Next.js dev server)"
	@echo ""
	@echo "🌐 Visit: http://localhost:3000 (frontend dev server)"
	@echo "📱 Or from your phone: http://<your-ip>:3000"
	@echo ""
	@echo "Press Ctrl+C to stop all services"
	@echo ""
	@if [ ! -d "apps/web/node_modules" ]; then \
		echo "⚠️  Frontend dependencies not found. Installing..."; \
		cd apps/web && npm install --legacy-peer-deps; \
	fi
	@trap 'pkill -f "next dev" 2>/dev/null || true; docker compose down' EXIT INT TERM; \
	cd apps/web && npx concurrently --names "DOCKER,FRONTEND" --prefix-colors "blue,green" \
		"docker compose up postgres redis backend" \
		"BACKEND_PROXY_TARGET=http://localhost:8000 npm run dev" || true; \
	pkill -f "next dev" 2>/dev/null || true; \
	docker compose down

dev-backend: ensure-docker
	@echo "Starting backend only with Docker Compose (auto-reload)..."
	@echo "Visit: http://localhost:8000"
	@docker compose up backend

dev-frontend:
	@echo "Starting frontend dev server (Next.js)..."
	@echo "Backend must be running (make dev-backend in another terminal)"
	@echo "Visit: http://localhost:3000"
	@if [ ! -d "apps/web/node_modules" ]; then \
		echo "⚠️  Frontend dependencies not found. Installing..."; \
		cd apps/web && npm install --legacy-peer-deps; \
	fi
	cd apps/web && BACKEND_PROXY_TARGET=http://localhost:8000 npm run dev

build:
	@echo "Building frontend for production..."
	@if [ ! -d "apps/web/node_modules" ]; then \
		echo "⚠️  Frontend dependencies not found. Installing..."; \
		cd apps/web && npm install --legacy-peer-deps; \
	fi
	cd apps/web && npm run build
	@echo "✅ Frontend built!"

docker-build:
	@echo "Building all Docker images..."
	docker compose build
	@echo "✅ Docker images built!"

docker-up: ensure-docker
	@echo "Starting all services with Docker Compose..."
	docker compose up

start: ensure-docker
	@echo "Building and starting all services in production mode..."
	@NODE_ENV=production docker compose up --build

clean:
	@echo "Cleaning up..."
	@echo "Stopping and removing Docker containers and volumes..."
	@docker compose down -v 2>/dev/null || docker-compose down -v 2>/dev/null || true
	@docker compose -f docker-compose.test.yml down -v 2>/dev/null || true
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
	rm -rf apps/web/dist
	rm -rf apps/web/.next
	rm -rf apps/web/out
	rm -rf apps/mobile/.expo
	rm -rf apps/mobile/dist
	rm -rf **/__pycache__
	rm -rf apps/backend/**/__pycache__
	rm -rf node_modules
	rm -rf apps/*/node_modules
	rm -rf packages/*/node_modules
	rm -rf services/*/node_modules
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

test: ensure-docker
	@echo "🧪 Running tests in Docker containers..."
	@echo "This will start PostgreSQL and Redis containers for testing..."
	@echo ""
	@docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test-runner
	@docker compose -f docker-compose.test.yml down

test-local:
	@echo "Running tests locally (requires venv and local PostgreSQL/Redis)..."
	@if [ ! -d "venv" ]; then \
		echo "❌ Virtual environment not found. Run 'make install' first."; \
		exit 1; \
	fi
	@./venv/bin/pytest apps/backend/tests/ -v

test-clean:
	@echo "Cleaning up test containers and volumes..."
	@docker compose -f docker-compose.test.yml down -v 2>/dev/null || true
	@echo "✅ Test cleanup complete!"

whatsapp:
	@echo "🚀 Starting WhatsApp service..."
	@echo "📱 Service: http://localhost:3001"
	@echo "🌐 Visit /whatsapp in the app to connect"
	@echo ""
	@echo "Press Ctrl+C to stop"
	@echo ""
	cd services/whatsapp && npm start

# Mobile App Commands
mobile-install:
	@echo "📱 Installing mobile app dependencies..."
	@echo "Installing from monorepo root to resolve workspace dependencies..."
	@npm install --legacy-peer-deps
	@echo "✅ Mobile dependencies installed!"
	@echo ""
	@echo "💡 Tip: Make sure you have:"
	@echo "   - Node.js 18+ installed"
	@echo "   - Expo CLI: npm install -g expo-cli (optional, npx works too)"
	@echo "   - For iOS: Xcode (only needed for simulator or local builds)"
	@echo "   - For Android: Android Studio (only needed for emulator or local builds)"

mobile-dev:
	@echo "📱 Starting mobile app development server..."
	@echo ""
	@echo "This will open Expo Dev Tools in your browser."
	@echo "You can then:"
	@echo "  - Press 'i' to open iOS simulator (requires Xcode)"
	@echo "  - Press 'a' to open Android emulator (requires Android Studio)"
	@echo "  - Scan QR code with Expo Go app on your phone"
	@echo ""
	@echo "💡 Make sure backend is running (make dev-backend in another terminal)"
	@echo ""
	@echo "📋 Viewing Errors & QR Code:"
	@echo "   - QR code appears in terminal AND Expo Dev Tools (browser)"
	@echo "   - Expo Dev Tools: http://localhost:19002 (auto-opens)"
	@echo "   - In Expo Go: Shake device or Cmd+D → 'Debug Remote JS' to see errors"
	@echo "   - Check terminal output for build/runtime errors"
	@echo ""
	@if [ ! -d "apps/mobile/node_modules" ]; then \
		echo "⚠️  Mobile dependencies not found. Installing from root..."; \
		npm install --legacy-peer-deps; \
	fi
	@cd apps/mobile && npx expo start --clear
	@echo ""
	@echo "💡 Tips:"
	@echo "   - QR code is also in Expo Dev Tools: http://localhost:19002"
	@echo "   - Shake device or Cmd+D → 'Debug Remote JS' to see errors"
	@echo "   - All errors also appear in this terminal output"

mobile-ios:
	@echo "📱 Starting mobile app with iOS simulator..."
	@echo ""
	@echo "💡 Requires:"
	@echo "   - Xcode installed"
	@echo "   - iOS Simulator available"
	@echo "   - Backend running (make dev-backend in another terminal)"
	@echo ""
	@echo "🔧 If you get 'No iOS devices available' or 'runtime not available' error:"
	@echo "   Run: ./scripts/setup-ios-simulator.sh"
	@echo "   Or manually: Xcode → Settings → Platforms → Install iOS Simulator"
	@echo "   Or use Expo Go (no Xcode needed): just run 'make mobile-dev' and scan QR"
	@echo ""
	@if [ ! -d "apps/mobile/node_modules" ]; then \
		echo "⚠️  Mobile dependencies not found. Installing from root..."; \
		npm install --legacy-peer-deps; \
	fi
	@cd apps/mobile && npm run ios

mobile-android:
	@echo "📱 Starting mobile app with Android emulator..."
	@echo ""
	@echo "💡 Requires:"
	@echo "   - Android Studio installed"
	@echo "   - Android emulator running"
	@echo "   - Backend running (make dev-backend in another terminal)"
	@echo ""
	@if [ ! -d "apps/mobile/node_modules" ]; then \
		echo "⚠️  Mobile dependencies not found. Installing from root..."; \
		npm install --legacy-peer-deps; \
	fi
	@cd apps/mobile && npm run android

mobile-test:
	@echo "🧪 Running mobile app tests..."
	@if [ ! -d "apps/mobile/node_modules" ]; then \
		echo "⚠️  Mobile dependencies not found. Installing from root..."; \
		npm install --legacy-peer-deps; \
	fi
	@cd apps/mobile && npm test

mobile-build:
	@echo "🏗️  Building mobile app with EAS Build..."
	@echo ""
	@echo "💡 Requires:"
	@echo "   - EAS CLI installed: npm install -g eas-cli"
	@echo "   - EAS account: eas login"
	@echo "   - EAS project configured: eas build:configure"
	@echo ""
	@if ! command -v eas >/dev/null 2>&1; then \
		echo "❌ EAS CLI not found. Install it with: npm install -g eas-cli"; \
		exit 1; \
	fi
	@cd apps/mobile && eas build --platform all

mobile-build-ios:
	@echo "🏗️  Building iOS app with EAS Build..."
	@if ! command -v eas >/dev/null 2>&1; then \
		echo "❌ EAS CLI not found. Install it with: npm install -g eas-cli"; \
		exit 1; \
	fi
	@cd apps/mobile && eas build --platform ios

mobile-build-android:
	@echo "🏗️  Building Android app with EAS Build..."
	@if ! command -v eas >/dev/null 2>&1; then \
		echo "❌ EAS CLI not found. Install it with: npm install -g eas-cli"; \
		exit 1; \
	fi
	@cd apps/mobile && eas build --platform android


