"""Release targeting, API enforcement, audit, and concurrent-edit regressions."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.api.auth_dependencies import get_current_user_optional
from backend.api.routes.feature_flags import (
    FlagCreate,
    FlagUpdate,
    create_flag,
    require_feature,
    router,
    update_flag,
)
from backend.database.db import get_db_session
from backend.database.models.feature_flags import FeatureFlag, FeatureFlagChange
from backend.services.platform.feature_flag_service import evaluate, snapshot


def flag(**overrides):
    return SimpleNamespace(
        **{
            "key": "tournaments",
            "description": "Tournament release",
            "enabled": True,
            "rollout_percent": 0,
            "user_ids": [12],
            "platforms": ["web", "ios"],
            "revision": 1,
        }
        | overrides
    )


def test_disabled_overrides_selected_users_and_full_rollout():
    assert not evaluate(flag(enabled=False, rollout_percent=100), 12, "web")


def test_selected_users_and_platforms():
    assert evaluate(flag(), 12, "web")
    assert not evaluate(flag(), 13, "web")
    assert not evaluate(flag(), 12, "android")
    assert not evaluate(flag(), None, "web")
    assert evaluate(flag(rollout_percent=100), None, "web")


def test_percentage_is_stable_across_platforms_and_grows_monotonically():
    low = flag(rollout_percent=10, user_ids=[])
    high = flag(rollout_percent=50, user_ids=[])
    low_users = {i for i in range(2000) if evaluate(low, i, "web")}
    high_users = {i for i in range(2000) if evaluate(high, i, "web")}
    assert 140 < len(low_users) < 260
    assert low_users < high_users
    assert all(evaluate(high, i, "web") == evaluate(high, i, "ios") for i in range(2000))


@pytest.mark.parametrize(
    "values",
    [
        {"rollout_percent": -1},
        {"rollout_percent": 101},
        {"rollout_percent": 1.5},
        {"platforms": ["unknown"]},
        {"platforms": []},
        {"reason": "   "},
        {"key": "../unsafe"},
    ],
)
def test_invalid_flag_configuration_rejected(values):
    with pytest.raises(ValidationError):
        FlagCreate(
            **({"key": "tournaments", "description": "Release", "reason": "Testing"} | values)
        )


@pytest.mark.asyncio
async def test_update_audits_before_and_after_and_commits_together():
    row = flag()
    session = AsyncMock()
    session.get.return_value = row
    session.add = Mock()
    payload = FlagUpdate(
        description="Paused",
        enabled=False,
        rollout_percent=0,
        user_ids=[],
        revision=1,
        reason="Investigating failures",
    )
    result = await update_flag("tournaments", payload, {"id": 9}, session)
    assert result["enabled"] is False and result["revision"] == 2
    audit = session.add.call_args_list[1].args[0]
    assert isinstance(audit, FeatureFlagChange)
    assert audit.actor_user_id == 9
    assert audit.before["enabled"] is True
    assert audit.after["enabled"] is False
    assert audit.reason == "Investigating failures"
    session.commit.assert_awaited_once()
    session.get.assert_awaited_once_with(FeatureFlag, "tournaments", with_for_update=True)


@pytest.mark.asyncio
async def test_stale_revision_cannot_overwrite_another_admin():
    session = AsyncMock()
    session.get.return_value = flag(revision=2)
    with pytest.raises(HTTPException) as exc:
        await update_flag(
            "tournaments",
            FlagUpdate(description="Edit", revision=1, reason="Test"),
            {"id": 9},
            session,
        )
    assert exc.value.status_code == 409
    session.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_unknown_selected_user_cannot_be_saved():
    session = AsyncMock()
    session.scalars.return_value = Mock(all=list)
    with pytest.raises(HTTPException) as exc:
        await create_flag(
            FlagCreate(key="release", description="New release", user_ids=[99], reason="Pilot"),
            {"id": 9},
            session,
        )
    assert exc.value.status_code == 422
    session.commit.assert_not_awaited()


def make_client(row, user=None):
    app = FastAPI()
    app.include_router(router)
    from fastapi import Depends

    @app.post("/guarded", dependencies=[Depends(require_feature("tournaments"))])
    async def guarded():
        return {"ok": True}

    session = AsyncMock()
    session.get.return_value = row
    session.scalars.return_value = Mock(all=lambda: [row] if row else [])
    app.dependency_overrides[get_db_session] = lambda: session
    app.dependency_overrides[get_current_user_optional] = lambda: user
    return TestClient(app)


def test_evaluation_only_exposes_booleans_and_never_caches_personal_results():
    client = make_client(flag(), {"id": 12})
    response = client.get("/api/feature-flags?platform=ios")
    assert response.status_code == 200
    assert response.json() == {"tournaments": True}
    assert response.headers["cache-control"] == "private, no-store"
    assert client.get("/api/feature-flags?platform=invalid").status_code == 422


def test_backend_gate_blocks_disabled_or_unknown_flags_and_direct_api_requests():
    for row in [None, flag(enabled=False), flag()]:
        client = make_client(row, {"id": 13})
        response = client.post("/guarded")
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "FEATURE_DISABLED"
    client = make_client(flag(), {"id": 12})
    assert client.post("/guarded").status_code == 200
    assert client.post("/guarded", headers={"X-Client-Platform": "android"}).status_code == 403


def test_management_requires_authentication():
    client = make_client(None)
    assert (
        client.get("/api/admin-view/feature-flags").status_code == 403
        or client.get("/api/admin-view/feature-flags").status_code == 401
    )
    assert client.post("/api/admin-view/feature-flags", json={}).status_code in (401, 403)


def test_kob_routes_have_server_gates():
    from backend.api.routes.kob import router as kob_router

    creation = next(
        r for r in kob_router.routes if r.path == "/api/kob/tournaments" and "POST" in r.methods
    )
    assert len(creation.dependencies) == 2
    assert all(r.dependencies for r in kob_router.routes)


def test_non_admin_cannot_read_or_change_flags(monkeypatch):
    from backend.api.auth_dependencies import get_current_user
    from backend.services import role_service

    monkeypatch.setattr(role_service, "is_system_admin", AsyncMock(return_value=False))
    client = make_client(None)
    client.app.dependency_overrides[get_current_user] = lambda: {"id": 12}
    assert client.get("/api/admin-view/feature-flags").status_code == 403
    assert client.post("/api/admin-view/feature-flags", json={}).status_code == 403
    assert client.put("/api/admin-view/feature-flags/test", json={}).status_code == 403
    assert client.get("/api/admin-view/feature-flags/test/history").status_code == 403


def test_migration_creates_seeded_flags_and_audit_table(monkeypatch):
    import importlib

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import create_engine, select, text
    from sqlalchemy.orm import Session

    from backend.database.models.feature_flags import FeatureFlagChange

    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        connection.execute(text("INSERT INTO users VALUES (1)"))
        migration = importlib.import_module("backend.alembic.versions.081_add_feature_flags")
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(connection)))
        migration.upgrade()
    with Session(engine) as session:
        row = session.get(FeatureFlag, "kob_tournaments")
        assert evaluate(row, None, "web") is True
        creation = session.get(FeatureFlag, "kob_tournament_creation")
        assert creation.enabled and creation.rollout_percent == 100
        before = snapshot(row)
        row.enabled = False
        row.revision += 1
        session.add(
            FeatureFlagChange(
                flag_key=row.key,
                actor_user_id=1,
                reason="Rollback",
                before=before,
                after=snapshot(row),
            )
        )
        session.commit()
    with Session(engine) as session:
        assert not evaluate(session.get(FeatureFlag, "kob_tournaments"), 1, "web")
        change = session.scalars(select(FeatureFlagChange)).one()
        assert change.before["enabled"] is True
        assert change.after["enabled"] is False
    engine.dispose()


def test_migration_can_generate_postgresql_sql_without_database(monkeypatch):
    import importlib
    from io import StringIO

    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    output = StringIO()
    context = MigrationContext.configure(
        dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}
    )
    migration = importlib.import_module("backend.alembic.versions.081_add_feature_flags")
    monkeypatch.setattr(migration, "op", Operations(context))
    migration.upgrade()
    sql = output.getvalue()
    assert "CREATE TABLE feature_flags" in sql
    assert "CREATE TABLE feature_flag_changes" in sql
    assert "INSERT INTO feature_flags" in sql
    assert "kob_tournament_creation" in sql
    assert '\'["web", "ios", "android"]\'' in sql
