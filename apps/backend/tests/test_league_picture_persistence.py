"""Exercise private picture persistence and live membership checks in PostgreSQL."""

from io import BytesIO

import httpx
import pytest
from fastapi import FastAPI
from PIL import Image
from sqlalchemy import delete, select

from backend.api.routes import league_pictures as routes
from backend.database.models import League, LeagueMember, LeaguePicture, Player, User


@pytest.mark.asyncio
async def test_picture_replacement_and_revoked_membership_with_real_database(db_session):
    admin = User()
    member = User()
    league = League(name="Private picture persistence")
    db_session.add_all([admin, member, league])
    await db_session.flush()
    admin_player = Player(full_name="Picture admin", user_id=admin.id)
    member_player = Player(full_name="Picture member", user_id=member.id)
    db_session.add_all([admin_player, member_player])
    await db_session.flush()
    db_session.add_all(
        [
            LeagueMember(league_id=league.id, player_id=admin_player.id, role="admin"),
            LeagueMember(league_id=league.id, player_id=member_player.id, role="member"),
        ]
    )
    await db_session.commit()

    viewer = {"id": admin.id}
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[routes.require_user] = lambda: viewer
    app.dependency_overrides[routes.get_db_session] = lambda: db_session
    path = f"/api/leagues/{league.id}/picture"
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        revisions = []
        for color in ("blue", "red"):
            output = BytesIO()
            Image.new("RGB", (80, 60), color).save(output, format="PNG")
            uploaded = await client.post(
                path, files={"file": ("picture.png", output.getvalue(), "image/png")}
            )
            assert uploaded.status_code == 200
            revisions.append(uploaded.json()["revision"])
        assert revisions[0] != revisions[1]
        assert len((await db_session.scalars(select(LeaguePicture))).all()) == 1

        viewer["id"] = member.id
        response = await client.get(path)
        assert response.status_code == 200
        assert response.json() == uploaded.json()
        assert (await client.delete(path)).status_code == 403

        # Revoking membership must take effect even though this user just read it.
        await db_session.execute(
            delete(LeagueMember).where(LeagueMember.player_id == member_player.id)
        )
        await db_session.commit()
        assert (await client.get(path)).status_code == 403

        viewer["id"] = admin.id
        assert (await client.delete(path)).status_code == 200
        assert (await client.get(path)).json() == {"data_uri": None, "revision": None}
        assert await db_session.get(LeaguePicture, league.id) is None
