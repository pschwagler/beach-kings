"""Mixed legacy and ISO dates must share one chronological session list."""

from datetime import date, datetime, timezone

import pytest

from backend.database.models import League, Player, Session, SessionStatus
from backend.services.games.session_data import get_open_sessions_for_user
from backend.utils.datetime_utils import session_date_sort_key


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2026-11-22", date(2026, 11, 22)),
        ("11/22/2026", date(2026, 11, 22)),
        ("2/4/2026", date(2026, 2, 4)),
        ("02/04/2026", date(2026, 2, 4)),
        ("2026-11-22T23:00:00Z", date(2026, 11, 22)),
        (" 11/22/2026 ", date(2026, 11, 22)),
        ("2/30/2026", date.min),
        ("unknown", date.min),
        ("", date.min),
        (None, date.min),
    ],
)
def test_session_date_sort_key(value, expected):
    assert session_date_sort_key(value) == expected


@pytest.mark.asyncio
@pytest.mark.parametrize("active_only", [True, False])
async def test_my_sessions_sort_by_calendar_date(db_session, active_only):
    player = Player(full_name="Session ordering test player")
    league = League(name="Session ordering test league")
    db_session.add_all([player, league])
    await db_session.flush()
    # Same-day ties use updated_at, regardless of how the date is formatted.
    dates = [
        ("old pickup", "9/30/2026", None, 1),
        ("recent league", "2026-11-22", league.id, 1),
        ("last year", "12/31/2025", None, 1),
        ("next year", "1/2/2027", league.id, 1),
        ("same day updated pickup", "11/22/2026", None, 2),
        ("padded league", "02/04/2026", league.id, 1),
        ("invalid date", "unknown", None, 1),
    ]
    for name, session_date, league_id, hour in dates:
        db_session.add(
            Session(
                name=name,
                date=session_date,
                league_id=league_id,
                created_by=player.id,
                status=SessionStatus.ACTIVE,
                updated_at=datetime(2026, 11, 22, hour, tzinfo=timezone.utc),
            )
        )
    await db_session.commit()

    sessions = await get_open_sessions_for_user(db_session, player.id, active_only=active_only)

    assert [item["name"] for item in sessions] == [
        "next year",
        "same day updated pickup",
        "recent league",
        "old pickup",
        "padded league",
        "last year",
        "invalid date",
    ]
