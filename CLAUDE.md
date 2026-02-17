# Project board
- Task tracking: https://github.com/users/pschwagler/projects/2

# Rules for codebase
- All methods should aim to be DRY, refactored, and professional / production ready
- All methods should be well-documented with docstrings
- All methods should be well-tested with unit tests

# Database Safety — CRITICAL
- **NEVER destroy, drop, delete, or recreate the database or its data** — not even locally, not even to "fix" something.
- **Prohibited commands** (this list is NOT exhaustive — use judgment):
  - `DROP DATABASE`, `DROP TABLE`, `DROP SCHEMA`
  - `TRUNCATE`, `DELETE FROM <table>` without a narrow WHERE clause
  - `docker compose down -v` (the `-v` flag destroys volumes)
  - `docker volume rm`, `docker volume prune`
  - `docker system prune` (can remove volumes)
  - `docker compose rm` on db containers
  - Any script or Makefile target that recreates the database from scratch
- Do NOT wipe tables or truncate data as a troubleshooting shortcut. Fix the root cause instead.
- Migrations must be additive. Write a new migration — never delete or rewrite existing migration files.
- If a database issue arises, **ask the user** before taking any action that could affect data.

# Player names
- player_name in API responses (e.g. league members, player list) must be full_name only. Do not use nickname as the primary display name in API payloads (Nicknames are used on the backend for name matching only, e.g. search, photo match, fuzzy match).

# Navigation
- Every page in the web app MUST include the Navbar. No page should render without it — including public/unauthenticated pages (e.g. SEO landing pages, public league views).
