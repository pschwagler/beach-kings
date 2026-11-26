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
    private_league = League(name="Unrelated private picture")
    db_session.add_all([admin, member, league, private_league])
    await db_session.flush()
    admin_player = Player(full_name="Picture admin", user_id=admin.id)
    member_player = Player(full_name="Picture member", user_id=member.id)
    db_session.add_all([admin_player, member_player])
    await db_session.flush()
    db_session.add_all(
        [
            LeagueMember(league_id=league.id, player_id=admin_player.id, role="admin"),
            LeagueMember(league_id=league.id, player_id=member_player.id, role="member"),
            LeagueMember(league_id=private_league.id, player_id=admin_player.id, role="admin"),
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

        unrelated_upload = await client.post(
            f"/api/leagues/{private_league.id}/picture",
            files={"file": ("picture.png", output.getvalue(), "image/png")},
        )
        assert unrelated_upload.status_code == 200
        thumbnail_path = "/api/leagues/pictures/thumbnails"
        thumbnail_params = {"league_ids": [league.id, private_league.id]}
        admin_thumbnails = await client.get(thumbnail_path, params=thumbnail_params)
        assert admin_thumbnails.status_code == 200
        assert set(admin_thumbnails.json()) == {str(league.id), str(private_league.id)}

        viewer["id"] = member.id
        member_thumbnails = await client.get(thumbnail_path, params=thumbnail_params)
        assert member_thumbnails.status_code == 200
        assert set(member_thumbnails.json()) == {str(league.id)}
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
        revoked_thumbnails = await client.get(thumbnail_path, params=thumbnail_params)
        assert revoked_thumbnails.status_code == 200
        assert revoked_thumbnails.json() == {}

        viewer["id"] = admin.id
        assert (await client.delete(path)).status_code == 200
        assert (await client.get(path)).json() == {"data_uri": None, "revision": None}
        assert await db_session.get(LeaguePicture, league.id) is None


@pytest.mark.asyncio
async def test_discovery_opt_in_tags_joined_leagues_and_preserves_visibility(db_session):
    from backend.database.models import LeagueRequest
    from backend.services.leagues.league_data import query_leagues

    viewer = User()
    db_session.add(viewer)
    await db_session.flush()
    player = Player(full_name="Discovery member", user_id=viewer.id)
    joined = League(name="Picture Search Joined", is_public=True)
    pending = League(name="Picture Search Pending", is_public=True)
    private = League(name="Picture Search Private", is_public=False)
    db_session.add_all([player, joined, pending, private])
    await db_session.flush()
    db_session.add_all(
        [
            LeagueMember(league_id=joined.id, player_id=player.id, role="member"),
            LeagueMember(league_id=private.id, player_id=player.id, role="member"),
            LeagueRequest(league_id=pending.id, player_id=player.id, status="pending"),
        ]
    )
    await db_session.commit()

    params = {"q": "Picture Search", "user_id": viewer.id}
    default_discovery = await query_leagues(db_session, include_joined=False, **params)
    assert {row["id"] for row in default_discovery["items"]} == {pending.id}

    search = await query_leagues(db_session, include_joined=True, **params)
    items = {row["id"]: row for row in search["items"]}
    assert set(items) == {joined.id, pending.id}
    assert items[joined.id]["is_member"] is True
    assert items[joined.id]["has_pending_request"] is False
    assert items[pending.id]["is_member"] is False
    assert items[pending.id]["has_pending_request"] is True
