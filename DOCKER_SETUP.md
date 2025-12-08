# Docker Setup Guide

This guide explains how to run the Beach Kings application using Docker Compose with separate frontend and backend services.

## Architecture

The application consists of:
- **Frontend**: Next.js application (port 3000)
- **Backend**: FastAPI application (port 8000)
- **PostgreSQL**: Database (port 5432)
- **Redis**: Cache/Queue (port 6379)

## Prerequisites

- Docker and Docker Compose installed
- `.env` file configured with required environment variables

## Quick Start

### 1. Configure Environment Variables

Create a `.env` file in the root directory with:

```env
# Database
POSTGRES_USER=beachkings
POSTGRES_PASSWORD=beachkings
POSTGRES_DB=beachkings
POSTGRES_PORT=5432

# Backend
BACKEND_PORT=8000
JWT_SECRET_KEY=your-secret-key-here
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=your-twilio-number
ENABLE_SMS=true
SENDGRID_API_KEY=your-sendgrid-key
SENDGRID_FROM_EMAIL=noreply@beachleaguevb.com
ADMIN_EMAIL=admin@beachleaguevb.com
ENABLE_EMAIL=true
GEOAPIFY_API_KEY=your-geoapify-key
CREDENTIALS_JSON=your-google-credentials-json

# Redis
REDIS_PORT=6379
REDIS_DB=0

# Frontend
FRONTEND_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:8000
NODE_ENV=production
```

### 2. Build and Start All Services

```bash
docker-compose up --build
```

This will:
- Build all Docker images
- Start PostgreSQL, Redis, Backend, and Frontend services
- Create necessary networks and volumes

### 3. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Running Individual Services

### Start all services in detached mode:
```bash
docker-compose up -d
```

### Start only specific services:
```bash
# Frontend only
docker-compose up frontend

# Backend + Database only
docker-compose up backend postgres redis

# All services
docker-compose up
```

### Stop services:
```bash
docker-compose down
```

### View logs:
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f frontend
docker-compose logs -f backend
```

## Development Mode

For development with hot-reload, you have two options:

### Option 1: Run Frontend Locally (Recommended for Development)

1. Start backend services:
```bash
docker-compose up postgres redis backend
```

2. In a separate terminal, run frontend locally:
```bash
cd frontend
npm install
npm run dev
```

The frontend will run on http://localhost:3000 and proxy API calls to http://localhost:8000.

### Option 2: Volume Mounting (Hot Reload in Docker)

The docker-compose.yml includes volume mounts for the frontend:
```yaml
volumes:
  - ./frontend:/app
  - /app/node_modules
  - /app/.next
```

However, for full hot-reload support, Option 1 is recommended.

## Production Build

The Dockerfiles are configured for production builds:

### Frontend
- Builds Next.js application with `npm run build`
- Runs production server with `npm start`
- Serves on port 3000

### Backend
- Installs Python dependencies
- Runs FastAPI with uvicorn
- Handles database migrations via entrypoint.sh

## Troubleshooting

### Frontend can't connect to backend
- Check that `NEXT_PUBLIC_API_URL` is set correctly
- Verify backend is running: `docker-compose logs backend`
- Check network connectivity: `docker-compose ps`

### Database connection issues
- Verify PostgreSQL is healthy: `docker-compose ps postgres`
- Check database URL in backend logs
- Ensure DATABASE_URL environment variable is correct

### Port conflicts
- Change ports in `.env` file (e.g., `FRONTEND_PORT=3001`)
- Or stop conflicting services using those ports

### Rebuild after code changes
```bash
# Rebuild specific service
docker-compose build frontend
docker-compose up frontend

# Rebuild all services
docker-compose build
docker-compose up
```

## Cleaning Up

### Stop and remove containers:
```bash
docker-compose down
```

### Remove volumes (WARNING: deletes data):
```bash
docker-compose down -v
```

### Remove images:
```bash
docker-compose down --rmi all
```

## File Structure in Containers

### Frontend Container (`/app`)
- `/app` - Next.js application root
- `/app/.next` - Next.js build output
- `/app/node_modules` - Dependencies

### Backend Container (`/app`)
- `/app/backend` - FastAPI application
- `/app/whatsapp-service` - WhatsApp service
- `/app/entrypoint.sh` - Startup script

