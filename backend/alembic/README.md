# Alembic Migrations

This directory contains database migrations managed by Alembic.

## Current Migration

- **001_initial_schema.py** - Initial database schema that creates all tables from scratch

## Running Migrations

### From the backend directory:

```bash
cd backend
source ../venv/bin/activate
PYTHONPATH=/path/to/beach-kings python -m alembic upgrade head
```

### Or from the project root:

```bash
cd backend
source ../venv/bin/activate
PYTHONPATH=$(pwd)/.. python -m alembic upgrade head
```

## Creating New Migrations

### Auto-generate migration from model changes:

```bash
cd backend
source ../venv/bin/activate
PYTHONPATH=$(pwd)/.. python -m alembic revision --autogenerate -m "description_of_changes"
```

### Create empty migration (manual):

```bash
cd backend
source ../venv/bin/activate
PYTHONPATH=$(pwd)/.. python -m alembic revision -m "description_of_changes"
```

## Migration Commands

- `alembic current` - Show current database revision
- `alembic history` - Show migration history
- `alembic upgrade head` - Apply all pending migrations
- `alembic upgrade +1` - Apply next migration
- `alembic downgrade -1` - Rollback last migration
- `alembic downgrade <revision>` - Rollback to specific revision
- `alembic downgrade base` - Rollback all migrations (drop all tables)

## Migration Files

All migration files are stored in `alembic/versions/` and follow the naming pattern:
`<revision_id>_<description>.py`

Each migration file contains:
- `upgrade()` - Function to apply the migration
- `downgrade()` - Function to rollback the migration

## Notes

- Migrations are sequential and tracked in the `alembic_version` table in the database
- Always review auto-generated migrations before applying them
- Test migrations on a development database first
- Never edit a migration that has already been applied to production
- The initial migration (001) creates all tables from scratch - safe to wipe DB and start over

