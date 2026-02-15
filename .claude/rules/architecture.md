# App Architecture Overview

Monorepo (Turborepo) with apps and shared packages.

## Backend
- `apps/backend/` — Python async, FastAPI + PostgreSQL (async)
- Runs via Docker in dev and prod

## Frontend
- `apps/web/` — React + Next.js
- Managed by Turborepo tasks, npm scripts, and Makefile shorthands

## Database
- PostgreSQL via Docker Compose
- Migrations run automatically on startup (FastAPI lifespan)

## Dockerized Development
- Docker Compose manages containers for backend, frontend, db, workers, etc.

## Testing
- **All tests:** `make test`
- **Per package:** `turbo run test` or `cd apps/backend && pytest`
- **E2E (Playwright):** `cd apps/web && npm run test:e2e` — tests in `apps/web/tests/e2e/`

## Shared Libraries
- `packages/` or `libs/` — shared domain logic, types, and utilities
