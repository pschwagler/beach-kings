# Project board
- Task tracking: https://github.com/users/pschwagler/projects/2

Note - this is a public repo. Don't leak any PII or anything that could compromise security.

# Rules for codebase
- All methods should aim to be DRY, refactored, and professional / production ready
- All methods should be well-documented with docstrings
- All methods should be well-tested with unit tests

# Testing
- **TDD is required.** Write tests before implementation.
- **100% test coverage** target for all new code.
- **Comprehensive E2E tests** for critical user flows.
- Run tests locally before every commit.
- When running checks or tests, always fix failing tests — even if they are pre-existing and unrelated to current changes. Leave the test suite greener than you found it.

# Database Safety — CRITICAL
- **NEVER destroy, drop, delete, or recreate the database or its data** — not even locally, not even to "fix" something.
- **Prohibited commands** (this list is NOT exhaustive — use judgment):
  - `docker compose down -v` (the `-v` flag destroys volumes)
  - `docker volume rm`, `docker volume prune`
  - `docker compose rm` on db containers
  - Any script or Makefile target that recreates the database from scratch
- If a database issue arises, **ask the user** before taking any action that could affect data.

# Navigation
- Every page in the web app MUST include the Navbar. No page should render without it — including public/unauthenticated pages (e.g. SEO landing pages, public league views).

# Components
- Functional components, exported default
- Explicit return types: `React.ReactNode` or `JSX.Element`
- Props defined as `interface` (not `type`), destructured in function signature
- Composable via spread: `{ ...rest }` with extended Chakra props (e.g., `FlexProps`)
- `'use client'` only on components/pages that need interactivity

# General
- Prefer immutability
- Many small files over few large ones (200-400 lines typical, 800 max)

# Tools

Always use headless mode when using agent-browser, playwright, chrome devtools if you can

# Local dev utilities

These Makefile targets exist specifically to unblock agents and humans during local development and testing. Prefer them over re-deriving the same queries/scripts ad hoc. Run `make help` for the full list.

- `make dev-login ID=<player_id>` — print access + refresh tokens and a JS snippet to paste into the browser console to log in as that player. `make dev-login` with no ID lists players.
- `make dev-otp EMAIL=<email>` / `make dev-otp PHONE=<e164>` — fetch the latest unused, unexpired signup or password-reset verification code from the local DB. Use during UI/E2E validation of OTP flows (email is stubbed locally when `ENABLE_EMAIL=false`, but the code is still persisted in `verification_codes`). `make dev-otp` with no args returns the latest code for any identifier.
- `make seed-users` — create three test users with password `test1234` for quick manual exercise of auth flows.
