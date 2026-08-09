# Database Schema Map

PostgreSQL is the primary datastore. The authoritative schema is the ordered
Alembic history in `apps/backend/alembic/versions/`, together with the current
SQLAlchemy declarations in `apps/backend/database/models/`.

The model registry currently contains 70 tables. Importing
`backend.database.db` loads every model module and registers those tables on
`Base.metadata`.

## Model modules

| Module | Ownership |
| --- | --- |
| `auth.py` | verification, refresh/reset tokens, and Apple credentials |
| `awards.py` | season awards |
| `courts.py` | courts, reviews, photos, suggestions, home courts, and check-ins |
| `enums.py` | shared persisted enums |
| `games.py` | sessions, participants, and matches |
| `geography.py` | regions and locations |
| `identity.py` | users, players, and placeholder invites |
| `jobs.py` | statistics, photo-match, and media-deletion jobs |
| `kob.py` | King/Queen of the Beach tournaments, players, and matches |
| `leagues.py` | leagues, configs, memberships, seasons, requests, and invites |
| `messaging.py` | league messages, feedback, and notifications |
| `moderation.py` | cases, reports, appeals, events, evidence, and worker jobs |
| `push.py` | devices, durable deliveries, and notification preferences |
| `settings.py` | database-backed settings |
| `signups.py` | schedules, signups, players, and audit events |
| `social.py` | friendships, direct messages, blocks, and restrictions |
| `stats.py` | global, season, league, partnership, opponent, and ELO statistics |

## Conventions

- Application code may import public entities from `backend.database.models`.
- Relationships generally use string targets so model modules stay loosely
  coupled while all entities are registered by the package initializer.
- Schema changes require an Alembic migration; changing an ORM declaration is
  not sufficient for an existing database.
- Never edit or remove an applied migration. Add a new migration that moves the
  schema forward.

## Validation

Check model registration without connecting to a database:

```bash
PYTHONPATH=apps python - <<'PY'
from backend.database.db import Base

print(len(Base.metadata.tables))
print(*sorted(Base.metadata.tables), sep="\n")
PY
```

Check migration topology from `apps/backend` with an environment configured for
local development:

```bash
alembic heads
alembic history
```
