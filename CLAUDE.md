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
