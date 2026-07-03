"""Detect database state and initialize the schema for a fresh database.

Prints a single token to **stdout** for the entrypoint to branch on:

- ``fresh``    -- the database was empty; the schema has just been created from
  the SQLAlchemy models via ``Base.metadata.create_all()``. The caller must
  ``alembic stamp head`` (record the current revision **without** replaying
  migrations).
- ``existing`` -- the database already has tables; the caller must
  ``alembic upgrade head`` (normal incremental migration).

Diagnostics go to **stderr** so stdout carries only the token.

Why this exists: migration ``001_initial_schema`` builds the *current* schema
with ``Base.metadata.create_all()``. Replaying ``002..head`` on top of that
create_all baseline collides -- e.g. ``device_tokens`` already exists when
migration ``040`` tries to create it -- which aborts startup on any brand-new
(empty) database. A fresh database is therefore initialized directly from the
models and stamped at head, while existing databases keep migrating
incrementally.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import text

from backend.database.db import Base, engine
from backend.database import models  # noqa: F401  register all tables on Base.metadata


async def _detect_and_init() -> str:
    """Return ``"fresh"`` (empty DB, schema just created) or ``"existing"``."""
    try:
        async with engine.connect() as conn:
            result = await conn.execute(
                text(
                    "SELECT count(*) FROM information_schema.tables "
                    "WHERE table_schema = 'public'"
                )
            )
            table_count = int(result.scalar_one())

        if table_count == 0:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return "fresh"
        return "existing"
    finally:
        await engine.dispose()


def main() -> None:
    """Detect state, initialize a fresh schema, and emit the branch token."""
    state = asyncio.run(_detect_and_init())
    message = (
        "empty database detected -> created schema from models (stamp head)"
        if state == "fresh"
        else "existing database detected -> incremental migrations (upgrade head)"
    )
    print(message, file=sys.stderr)
    print(state)


if __name__ == "__main__":
    main()
