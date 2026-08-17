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
| `JWT_EXPIRATION_HOURS` | `1` | JWT access token TTL (hours) |
| `REFRESH_TOKEN_EXPIRATION_DAYS` | `30` | Refresh token TTL (days). Tokens rotate on each use — old token is deleted and a new one issued |
| `YOUTH_SAFETY_SIGNING_SECRET` | `JWT_SECRET_KEY` | Dedicated signing key for 30-minute, pre-registration youth eligibility proofs. Use an independently generated secret in production. |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins |
| `DEBUG_BACKEND` | `0` | Enable debug mode |
| `PUSH_DELIVERY_ENABLED` | `false` | Enables the separate durable Expo push worker. Requires `EXPO_ACCESS_TOKEN` to be configured securely |
| `PUSH_MAX_ATTEMPTS` | `5` | Maximum durable delivery attempts for transient Expo failures |
| `EXPO_ACCESS_TOKEN` | (empty) | Protected server-only Expo enhanced-security access token; required when push delivery is enabled |

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
| `GOOGLE_CLIENT_IDS` | (empty) | Optional comma-separated additional first-party token audiences; the singular variable remains supported |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | (empty) | Google OAuth 2.0 Client ID (frontend, exposed to browser) |

### Sign in with Apple

These values are server-only secrets/configuration. Store them in the deployment
secret manager, never in source control. The encryption key must remain stable
for as long as pending Apple revocation jobs exist.

| Variable | Default | Description |
|----------|---------|-------------|
| `APPLE_CLIENT_ID` | (empty) | App ID used as the Apple token audience and OAuth client ID |
| `APPLE_CLIENT_IDS` | (empty) | Optional comma-separated additional first-party App ID / Services ID token audiences; the singular variable remains supported |
| `APPLE_TEAM_ID` | (empty) | Apple Developer team identifier used to sign client-secret JWTs |
| `APPLE_KEY_ID` | (empty) | Sign in with Apple private-key identifier |
| `APPLE_PRIVATE_KEY` | (empty) | Server-only ES256 private key; literal `\\n` separators are supported |
| `APPLE_TOKEN_ENCRYPTION_KEY` | (empty) | Stable Fernet key used to encrypt Apple refresh tokens at rest |

### Twilio SMS

| Variable | Default | Description |
|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | (empty) | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | (empty) | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | (empty) | Twilio sending phone number |
| `ENABLE_SMS` | `true` | Set `false` to disable SMS |

### Resend Email

| Variable | Default | Description |
|----------|---------|-------------|
| `RESEND_API_KEY` | (empty) | Resend API key |
| `RESEND_FROM_EMAIL` | `Beach League <noreply@beachleaguevb.com>` | Sender identity on a verified Resend domain |
| `ADMIN_EMAIL` | `admin@beachleaguevb.com` | Admin notification email |
| `ENABLE_EMAIL` | `true` | Set `false` to disable email |

### AWS S3

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | (empty) | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | (empty) | AWS secret key |
| `AWS_S3_BUCKET` | (empty) | S3 bucket name |
| `AWS_S3_REGION` | `us-west-2` | AWS region |
| `AWS_MODERATION_EVIDENCE_BUCKET` | (empty) | Separate private S3 bucket for restricted moderation evidence; enable Block Public Access and encryption |
| `MODERATION_MODE` | `off` | Local durable moderation behavior: `off`, `shadow`, or `enforce`. Server code forces `enforce` in production and staging so unreviewed UGC fails closed |
| `MODERATION_MODEL` | `omni-moderation-latest` | Configurable text/image classification model |
| `MODERATION_AUTO_ENFORCE_SCORE` | `0.95` | Conservative severe-category score threshold for automatic bans or seven-day suspensions; all other flags remain quarantined |
| `DIRECT_MESSAGE_WRITES_ENABLED` | unset locally | Emergency control for new direct messages. Production/staging require an explicit valid value or the surface fails closed; the `direct_message_writes_enabled` database setting takes precedence |
| `LEAGUE_CHAT_WRITES_ENABLED` | unset locally | Emergency control for new league-chat messages. Production/staging require an explicit valid value or the surface fails closed; the `league_chat_writes_enabled` database setting takes precedence |
| `MODERATION_TRIAGE_MODEL` | `gpt-5.6-luna` | Configurable recommendation-only structured triage model |
| `MODERATION_PROVIDER_TIMEOUT` | `20` | Provider request timeout in seconds |
| `MODERATION_MAX_ATTEMPTS` | `5` | Bounded durable-job retry count |
| `OPENAI_API_KEY` | (empty) | Server-only provider credential used by the separate moderation worker; the worker refuses to start without it whenever moderation is enabled |
| `MODERATION_ALERTS_ENABLED` | `false` | Enables durable moderation owner alerts; required in production |
| `MODERATION_ALERT_EMAIL` | (empty) | Protected controlled-inbox recipient for privacy-minimized moderation alerts; required in production |
| `MODERATION_ALERT_MAX_ATTEMPTS` | `5` | Maximum bounded Resend attempts per alert job |

### System Admin

System-admin access is stored as auditable user-linked role assignments. No
environment variable or contact allowlist grants administrator access.

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
