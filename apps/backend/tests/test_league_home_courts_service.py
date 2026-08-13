from unittest.mock import AsyncMock, Mock

import pytest

from backend.services.leagues.league_data import get_league_home_courts


@pytest.mark.asyncio
async def test_home_court_summary_selects_only_response_columns():
    result = Mock()
    result.all.return_value = [(2, 17, "Pier Courts", "1 Ocean Ave")]
    session = Mock()
    session.execute = AsyncMock(return_value=result)

    rows = await get_league_home_courts(session, league_id=9)

    assert rows == [
        {
            "id": 17,
            "name": "Pier Courts",
            "address": "1 Ocean Ave",
            "position": 2,
        }
    ]
    statement = session.execute.await_args.args[0]
    sql = str(statement)
    assert "courts.catalog_managed" not in sql
    assert "courts.catalog_source" not in sql
    assert "courts.catalog_revision" not in sql
