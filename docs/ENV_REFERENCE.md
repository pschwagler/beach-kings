# Environment Variables Reference

Source: `.env.example`, `docker-compose.yml`, `docker-compose.test.yml`

## Required

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_USER` | PostgreSQL username | `beachkings` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `change-me-in-production` |
| `POSTGRES_DB` | PostgreSQL database name | `beachkings` |
| `POSTGRES_HOST` | PostgreSQL hostname | `postgres` (Docker) / `localhost` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `JWT_SECRET_KEY` | Secret key for JWT signing | `openssl rand -hex 32` |

## Optional (with defaults)

### Application

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV` | `development` | `development`, `production`, or `test` |
| `JWT_EXPIRATION_HOURS` | `72` | JWT access token TTL |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins |
| `DEBUG_BACKEND` | `0` | Enable debug mode |

### Ports

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_PORT` | `8000` | Backend API port |
| `FRONTEND_PORT` | `3000` | Next.js frontend port |
| `WHATSAPP_PORT` | `3001` | WhatsApp service port (inactive) |

### Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_HOST` | `redis` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_DB` | `0` | Redis database number |

### Google SSO

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | (empty) | Google OAuth 2.0 Client ID (backend token verification) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | (empty) | Google OAuth 2.0 Client ID (frontend, exposed to browser) |

### Twilio SMS

| Variable | Default | Description |
|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | (empty) | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | (empty) | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | (empty) | Twilio sending phone number |
| `ENABLE_SMS` | `true` | Set `false` to disable SMS |

### SendGrid Email

| Variable | Default | Description |
|----------|---------|-------------|
| `SENDGRID_API_KEY` | (empty) | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | `noreply@beachleaguevb.com` | Sender email |
| `ADMIN_EMAIL` | `admin@beachleaguevb.com` | Admin notification email |
| `ENABLE_EMAIL` | `true` | Set `false` to disable email |

### AWS S3

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | (empty) | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | (empty) | AWS secret key |
| `AWS_S3_BUCKET` | (empty) | S3 bucket name |
| `AWS_S3_REGION` | `us-west-2` | AWS region |

### External APIs

| Variable | Default | Description |
|----------|---------|-------------|
| `GEOAPIFY_API_KEY` | (empty) | Geoapify geocoding API key |
| `GEMINI_API_KEY` | (empty) | Google Gemini API key (photo score extraction) |

### Build-Time Variables (NEXT_PUBLIC_*)

These must be set at **Docker build time** — Next.js inlines them during compilation.

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | (empty) | Frontend API base URL. Empty for production (nginx proxy), `http://localhost:8000` for local dev |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | (empty) | Mapbox GL JS token for court maps |

### Server-Side Rendering

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_INTERNAL_URL` | `http://localhost:8000` | Internal URL for SSR calls to backend. Docker: `http://backend:8000` |
| `BACKEND_PROXY_TARGET` | `http://localhost:8000` | Next.js dev proxy target. E2E tests set to `http://localhost:8001` |

## Test-Only

These are set in `docker-compose.test.yml` for the test environment.

| Variable | Value | Description |
|----------|-------|-------------|
| `TEST_DATABASE_URL` | `postgresql+asyncpg://...@postgres-test:5432/beachkings_test` | Test DB connection |
| `TEST_POSTGRES_DB` | `beachkings_test` | Test database name |
| `BACKEND_TEST_PORT` | `8001` | Test backend port (avoids conflicts) |
| `ENV` | `test` | Disables rate limiting, enables test mode |
| `ENABLE_SMS` | `false` | Disabled in tests |
| `ENABLE_EMAIL` | `false` | Disabled in tests |
| `JWT_SECRET_KEY` | `test-secret-key-...` | Test JWT key |
| `ALLOWED_ORIGINS` | `http://localhost:3002,http://localhost:3000` | Test CORS origins |

### Test Infrastructure Ports

| Service | Host Port | Container Port |
|---------|-----------|----------------|
| `postgres-test` | `5433` | `5432` |
| `redis-test` | `6380` | `6379` |
| `backend-test` | `8001` | `8000` |
