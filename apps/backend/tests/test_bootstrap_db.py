"""Unit tests for the database bootstrap helper.

``bootstrap_db._detect_and_init`` decides how a starting container initializes
the schema:

- empty database  -> create the schema from the models and return ``"fresh"``
  (the entrypoint then ``alembic stamp head`` -- it must NOT replay migrations,
  because migration 001 already builds the current schema via create_all()).
- populated database -> return ``"existing"`` without touching the schema (the
  entrypoint then ``alembic upgrade head``).

The engine is faked so these tests need no live database.
"""

import asyncio

from backend.scripts import bootstrap_db


class _FakeResult:
    """Minimal stand-in for a SQLAlchemy ``Result``."""

    def __init__(self, value: int) -> None:
        self._value = value

    def scalar_one(self) -> int:
        return self._value


class _FakeConn:
    """Records ``run_sync`` calls (i.e. whether create_all ran)."""

    def __init__(self, table_count: int) -> None:
        self._table_count = table_count
        self.run_sync_calls: list = []

    async def execute(self, *_args, **_kwargs) -> _FakeResult:
        return _FakeResult(self._table_count)

    async def run_sync(self, fn) -> None:
        self.run_sync_calls.append(fn)


class _FakeCM:
    """Async context manager yielding a fixed connection."""

    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeConn:
        return self._conn

    async def __aexit__(self, *_exc) -> bool:
        return False


class _FakeEngine:
    """Fake async engine exposing connect/begin/dispose."""

    def __init__(self, table_count: int) -> None:
        self._table_count = table_count
        # begin() must reuse one connection so the test can inspect run_sync.
        self.begin_conn = _FakeConn(table_count)
        self.disposed = False

    def connect(self) -> _FakeCM:
        return _FakeCM(_FakeConn(self._table_count))

    def begin(self) -> _FakeCM:
        return _FakeCM(self.begin_conn)

    async def dispose(self) -> None:
        self.disposed = True


def test_empty_database_creates_schema_and_returns_fresh(monkeypatch) -> None:
    """An empty DB triggers create_all() and reports 'fresh'."""
    fake = _FakeEngine(table_count=0)
    monkeypatch.setattr(bootstrap_db, "engine", fake)

    state = asyncio.run(bootstrap_db._detect_and_init())

    assert state == "fresh"
    assert len(fake.begin_conn.run_sync_calls) == 1  # create_all was invoked
    # Base.metadata.create_all yields a fresh bound-method each access, so compare
    # the function name and bound instance rather than object identity.
    invoked = fake.begin_conn.run_sync_calls[0]
    assert invoked.__name__ == "create_all"
    assert invoked.__self__ is bootstrap_db.Base.metadata
    assert fake.disposed is True


def test_populated_database_returns_existing_without_creating(monkeypatch) -> None:
    """A populated DB reports 'existing' and never calls create_all()."""
    fake = _FakeEngine(table_count=42)
    monkeypatch.setattr(bootstrap_db, "engine", fake)

    state = asyncio.run(bootstrap_db._detect_and_init())

    assert state == "existing"
    assert fake.begin_conn.run_sync_calls == []  # create_all was NOT invoked
    assert fake.disposed is True


def test_engine_disposed_even_when_execute_raises(monkeypatch) -> None:
    """The engine pool is closed even if the state query fails."""

    class _BoomEngine(_FakeEngine):
        def connect(self) -> _FakeCM:
            raise RuntimeError("connection refused")

    fake = _BoomEngine(table_count=0)
    monkeypatch.setattr(bootstrap_db, "engine", fake)

    try:
        asyncio.run(bootstrap_db._detect_and_init())
    except RuntimeError:
        pass

    assert fake.disposed is True
