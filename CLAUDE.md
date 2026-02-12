# Rules for codebase
- All methods should aim to be DRY, refactored, and professional / production ready
- All methods should be well-documented with docstrings
- All methods should be well-tested with unit tests

# Database Safety
- **NEVER drop, delete, or recreate the database** — not even locally. This includes `DROP DATABASE`, `docker compose down -v`, removing Docker volumes, or any equivalent destructive action.
- Do NOT wipe tables or truncate data as a troubleshooting shortcut. Fix the root cause instead.
- Migrations should be additive. If a schema change is needed, write a new migration — never delete or rewrite existing migration files.

# Player names
- player_name in API responses (e.g. league members, player list) must be full_name only. Do not use nickname as the primary display name in API payloads (Nicknames are used on the backend for name matching only, e.g. search, photo match, fuzzy match).

# Navigation
- Every page in the web app MUST include the Navbar. No page should render without it — including public/unauthenticated pages (e.g. SEO landing pages, public league views).
