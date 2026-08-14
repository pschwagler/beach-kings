# Backend Architecture

The FastAPI backend is rooted at `apps/backend`. Code is grouped first by its
role at the application boundary, then by product domain inside large layers.

## Directory map

- `api/`: FastAPI application setup, dependencies, and HTTP route modules.
- `database/models/`: SQLAlchemy entities grouped by product domain.
- `models/schemas/`: Pydantic request and response contracts grouped by domain.
- `services/`: business operations grouped into domain packages.
- `alembic/`: ordered database migrations.
- `scripts/`: backend worker and bootstrap entry points.
- `tests/`: backend tests; test filenames should identify the domain they cover.

## Domain packages

The main service domains are `auth`, `courts`, `games`, `kob`, `leagues`,
`moderation`, `notifications`, `players`, `public`, `social`, and `stats`.
External-system adapters and shared runtime infrastructure live in `platform`.

When adding behavior, place it in the narrowest matching domain. Prefer a new
focused module when an existing file approaches the repository's 800-line soft
limit. Split by responsibility—queries, commands, policies, or workers—rather
than by arbitrary line ranges.

## Compatibility surfaces

`backend.database.models` and `backend.models.schemas` re-export their public
classes. Existing callers may continue importing classes from those package
roots, while domain-aware code may import from a focused module.

`backend.services.data_service` is a legacy wildcard re-export shim. Do not add
new functions to it. New code should import the owning domain module directly.
`backend.services` also provides lazy module aliases for older imports while
call sites migrate to explicit domain paths.

## Dependency direction

Routes validate transport data and call services. Services own business rules
and database operations. ORM models must not import services or API modules.
Platform adapters must not depend on routes. Cross-domain calls should be
explicit so circular imports are visible and avoidable.

## Verification

From the repository root:

```bash
ruff check apps/backend
PYTHONPATH=apps ENV=test pytest apps/backend/tests
```

Any ORM move must also verify that importing `backend.database.db` registers
the complete table set in `Base.metadata` and that Alembic still resolves a
single migration head.
