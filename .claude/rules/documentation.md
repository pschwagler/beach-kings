# Documentation Maintenance Rules

When making changes to the codebase, keep reference docs in sync:

- **DB table added/modified** → Update `docs/DATABASE_SCHEMA.md`
- **API route added/modified** → Update `docs/API_ROUTES.md`
- **Env var added/modified** → Update `docs/ENV_REFERENCE.md`
- **New migration written** → Include migration number in commit message (e.g., "Add friends table (migration 022)")
