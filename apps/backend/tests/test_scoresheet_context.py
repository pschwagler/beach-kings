"""Real PostgreSQL coverage for roster selection, bounds, and prompt context."""

from datetime import date, datetime, timezone
from unittest.mock import AsyncMock

import pytest

from backend.database.models import Match, Player, Session, SessionParticipant
from backend.services.games import scoresheet_context as context
from backend.services.games import scoresheet_prompt as prompt


@pytest.mark.asyncio
async def test_shared_sessions_include_legacy_matches_dedupe_and_rank_by_actual_date(db_session):
    players = [Player(full_name=f"Player {i}") for i in range(1, 9)]
    players[-2].deleted_at = datetime.now(timezone.utc)
    db_session.add_all(players)
    await db_session.flush()
    owner, recent, old, same_session, outsider, future, deleted, guest = players
    # Backfilled records have today's created_at: ranking must use session.date.
    old_session = Session(date="1/1/2020", name="Old")
    recent_session = Session(date="2026-11-01", name="Recent")
    future_session = Session(date="2027-01-01", name="Future")
    unrelated = Session(date="2026-11-01", name="Unrelated")
    db_session.add_all([old_session, recent_session, future_session, unrelated])
    await db_session.flush()
    # Legacy session: no participants. Repeated games still count as one session.
    for _ in range(3):
        db_session.add(
            Match(
                session_id=old_session.id,
                team1_player1_id=owner.id,
                team1_player2_id=old.id,
                team2_player1_id=same_session.id,
                team2_player2_id=deleted.id,
                team1_score=21,
                team2_score=19,
                winner=1,
            )
        )
    for session_obj, ids in [
        (recent_session, [owner.id, recent.id, same_session.id]),
        (future_session, [owner.id, future.id]),
        (unrelated, [outsider.id]),
    ]:
        db_session.add_all(
            [SessionParticipant(session_id=session_obj.id, player_id=pid) for pid in ids]
        )
    # Recent's second match doesn't contain the owner: shared SESSION still counts.
    db_session.add(
        Match(
            session_id=recent_session.id,
            team1_player1_id=recent.id,
            team1_player2_id=same_session.id,
            team2_player1_id=guest.id,
            team2_player2_id=deleted.id,
            team1_score=21,
            team2_score=19,
            winner=1,
        )
    )
    await db_session.flush()
    rows = [
        dict(row)
        for row in (
            await db_session.execute(context.history_statement(owner.id, date(2026, 11, 7)))
        ).mappings()
    ]
    assert {row["player_id"] for row in rows} == {recent.id, old.id, same_session.id, guest.id}
    by_id = {row["player_id"]: row for row in rows}
    assert by_id[same_session.id]["shared_sessions"] == 2
    assert by_id[old.id]["last_shared_session"] == "2020-01-01"
    ordered = [row["player_id"] for row in rows]
    assert ordered.index(recent.id) < ordered.index(old.id)
    assert by_id[recent.id]["shared_sessions"] == 1


@pytest.mark.asyncio
async def test_query_caps_history_at_100_in_a_deterministic_order(db_session):
    players = [Player(full_name=f"Candidate {i:03d}") for i in range(106)]
    db_session.add_all(players)
    game_day = Session(date="11/1/2026", name="Shared")
    db_session.add(game_day)
    await db_session.flush()
    db_session.add_all(
        [SessionParticipant(session_id=game_day.id, player_id=p.id) for p in players]
    )
    await db_session.flush()
    rows = (
        (await db_session.execute(context.history_statement(players[0].id, date(2026, 11, 7))))
        .mappings()
        .all()
    )
    assert len(rows) == 100
    assert [row["player_id"] for row in rows] == [p.id for p in players[1:101]]


def test_all_league_members_survive_cap_with_history_and_membership_preserved():
    history = [
        {"player_id": i, "player_name": f"Player {i}", "shared_sessions": 5} for i in range(2, 104)
    ]
    members = [{"player_id": i, "player_name": f"Player {i}"} for i in range(50, 180)]
    result = context.merge_candidates({"id": 1, "full_name": "Uploader"}, history, members)
    by_id = {row["player_id"]: row for row in result}
    assert len(result) == len(by_id)
    assert set(range(50, 180)) <= by_id.keys()
    assert by_id[50]["shared_sessions"] == 5 and by_id[50]["is_league_member"]
    assert not by_id[2]["is_league_member"]
    assert result[0]["is_uploader"]
    # 102 and 103 lie beyond the top 100 history candidates, but are retained
    # because they belong to the selected league.
    assert by_id[102]["is_league_member"]


@pytest.mark.asyncio
async def test_corrections_reuse_original_candidate_snapshot(monkeypatch):
    members = [{"player_id": 2, "player_name": "Guest", "is_league_member": False}]
    lookup = AsyncMock()
    monkeypatch.setattr(context, "context_members", lookup)
    assert (
        await context.draft_context(None, "draft", {"player_context": members}, {"id": 7}, 1)
        == members
    )
    lookup.assert_not_awaited()


@pytest.mark.asyncio
async def test_legacy_corrections_reconstruct_for_original_uploader(monkeypatch):
    from backend.services import photo_match_service

    lookup = AsyncMock(return_value=[])
    update = AsyncMock()
    monkeypatch.setattr(context, "context_members", lookup)
    monkeypatch.setattr(photo_match_service, "update_session_data", update)
    await context.draft_context(None, "draft", {"user_id": 3}, {"id": 7}, 1)
    lookup.assert_awaited_once_with(None, {"id": 3}, 1)
    update.assert_awaited_once_with("draft", {"player_context": []})


@pytest.mark.parametrize(
    "build", [prompt.build_scoreboard_prompt, prompt.build_clarification_prompt_for_array]
)
def test_prompts_identify_guests_history_ambiguity_and_exclude_profile_data(build):
    text = build(
        [
            {
                "player_id": 1,
                "player_name": "Alex Example",
                "player_nickname": "Ace",
                "is_league_member": True,
                "is_uploader": True,
                "shared_sessions": 4,
                "last_shared_session": "2026-11-01",
                "email": "not-for-model@example.test",
            },
            {"player_id": 2, "player_name": "Alex Guest", "is_league_member": False},
        ]
    )
    assert '"league_member": true' in text and '"league_member": false' in text
    assert '"shared_sessions": 4' in text and '"nickname": "Ace"' in text
    assert "outside the selected league" in text
    assert "return the raw name for review" in text
    assert "not-for-model" not in text


@pytest.mark.asyncio
async def test_upload_snapshots_the_same_context_sent_to_the_model(monkeypatch):
    from types import SimpleNamespace

    from backend.services import data_service, photo_match_service
    from backend.services.games import photo_draft_service as drafts

    candidates = [{"player_id": 9, "player_name": "Guest", "is_league_member": False}]
    monkeypatch.setattr(data_service, "get_player_by_user_id", AsyncMock(return_value={"id": 1}))
    monkeypatch.setattr(drafts, "context_members", AsyncMock(return_value=candidates))
    monkeypatch.setattr(photo_match_service, "validate_image_file", lambda *args: (True, None))
    monkeypatch.setattr(photo_match_service, "preprocess_image", lambda image: (image, "encoded"))
    store = AsyncMock(return_value=True)
    monkeypatch.setattr(photo_match_service, "store_session_data", store)
    monkeypatch.setattr(photo_match_service, "create_photo_match_job", AsyncMock(return_value=3))
    process = AsyncMock()
    monkeypatch.setattr(photo_match_service, "process_photo_job", process)
    monkeypatch.setattr(drafts, "spawn", lambda coroutine: coroutine.close())
    file = SimpleNamespace(
        read=AsyncMock(return_value=b"photo"), content_type="image/jpeg", filename="sheet.jpg"
    )
    await drafts.start_upload(None, {"id": 7}, file, league_id=10)
    assert store.await_args.args[1]["player_context"] == candidates
    assert process.call_args.args[-1] == candidates
