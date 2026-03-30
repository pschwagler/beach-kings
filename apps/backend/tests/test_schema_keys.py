"""
Guard tests: Pydantic schema key format enforcement.

These tests ensure that all API response models serialize to snake_case keys only.
If someone re-introduces a Field(alias="Space Key") or PascalCase field name,
these tests will catch it.
"""

import re
from backend.models.schemas import (
    RankingResponse,
    PartnershipStats,
    OpponentStats,
    MatchResponse,
    PlayerMatchHistoryResponse,
    EloTimelineResponse,
)

SNAKE_CASE_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def _assert_all_keys_snake_case(model_cls, data: dict):
    """Instantiate a Pydantic model and verify all serialized keys are snake_case."""
    instance = model_cls(**data)
    serialized = instance.model_dump()
    for key in serialized:
        assert SNAKE_CASE_RE.match(key), (
            f"Key '{key}' in {model_cls.__name__}.model_dump() is not snake_case. "
            f"Remove any Field(alias=...) with spaces or PascalCase field names."
        )
    return serialized


def _assert_json_keys_snake_case(model_cls, data: dict):
    """Check that model_dump(by_alias=True) also produces snake_case keys."""
    instance = model_cls(**data)
    serialized = instance.model_dump(by_alias=True)
    for key in serialized:
        assert SNAKE_CASE_RE.match(key), (
            f"Key '{key}' in {model_cls.__name__}.model_dump(by_alias=True) is not "
            f"snake_case. This means an alias with spaces or PascalCase was added."
        )


# ---------------------------------------------------------------------------
# RankingResponse
# ---------------------------------------------------------------------------

SAMPLE_RANKING = {
    "name": "Alice",
    "points": 100,
    "games": 10,
    "win_rate": 0.8,
    "wins": 8,
    "losses": 2,
    "avg_pt_diff": 3.5,
    "elo": 1250,
    "season_rank": 1,
}


def test_ranking_response_keys_are_snake_case():
    """RankingResponse must serialize with snake_case keys."""
    _assert_all_keys_snake_case(RankingResponse, SAMPLE_RANKING)


def test_ranking_response_alias_keys_are_snake_case():
    """RankingResponse alias serialization must also be snake_case."""
    _assert_json_keys_snake_case(RankingResponse, SAMPLE_RANKING)


def test_ranking_response_has_expected_fields():
    """RankingResponse must include all required stat fields."""
    serialized = _assert_all_keys_snake_case(RankingResponse, SAMPLE_RANKING)
    expected = {
        "name",
        "points",
        "games",
        "win_rate",
        "wins",
        "losses",
        "avg_pt_diff",
        "elo",
        "season_rank",
    }
    assert set(serialized.keys()) == expected


# ---------------------------------------------------------------------------
# PartnershipStats / OpponentStats
# ---------------------------------------------------------------------------

SAMPLE_PARTNERSHIP = {
    "player_id": 1,
    "partner_opponent": "Bob",
    "points": 50,
    "games": 5,
    "wins": 3,
    "losses": 2,
    "win_rate": 0.6,
    "avg_pt_diff": 2.0,
}


def test_partnership_stats_keys_are_snake_case():
    """PartnershipStats must serialize with snake_case keys."""
    _assert_all_keys_snake_case(PartnershipStats, SAMPLE_PARTNERSHIP)
    _assert_json_keys_snake_case(PartnershipStats, SAMPLE_PARTNERSHIP)


def test_opponent_stats_keys_are_snake_case():
    """OpponentStats must serialize with snake_case keys."""
    _assert_all_keys_snake_case(OpponentStats, SAMPLE_PARTNERSHIP)
    _assert_json_keys_snake_case(OpponentStats, SAMPLE_PARTNERSHIP)


def test_partnership_stats_has_partner_opponent_not_slash():
    """Field must be 'partner_opponent', not 'Partner/Opponent'."""
    serialized = _assert_all_keys_snake_case(PartnershipStats, SAMPLE_PARTNERSHIP)
    assert "partner_opponent" in serialized
    assert serialized["partner_opponent"] == "Bob"


# ---------------------------------------------------------------------------
# MatchResponse
# ---------------------------------------------------------------------------

SAMPLE_MATCH = {
    "date": "2024-01-15",
    "team_1_player_1": "Alice",
    "team_1_player_2": "Bob",
    "team_2_player_1": "Carol",
    "team_2_player_2": "Dave",
    "team_1_score": 21,
    "team_2_score": 15,
    "winner": "Team 1",
    "team_1_elo_change": 12.5,
    "team_2_elo_change": -12.5,
}


def test_match_response_keys_are_snake_case():
    """MatchResponse must serialize with snake_case keys."""
    _assert_all_keys_snake_case(MatchResponse, SAMPLE_MATCH)
    _assert_json_keys_snake_case(MatchResponse, SAMPLE_MATCH)


def test_match_response_has_all_team_fields():
    """MatchResponse must have team_N_player_N and team_N_score fields."""
    serialized = _assert_all_keys_snake_case(MatchResponse, SAMPLE_MATCH)
    for team in [1, 2]:
        for player in [1, 2]:
            assert f"team_{team}_player_{player}" in serialized
        assert f"team_{team}_score" in serialized
        assert f"team_{team}_elo_change" in serialized


# ---------------------------------------------------------------------------
# PlayerMatchHistoryResponse
# ---------------------------------------------------------------------------

SAMPLE_HISTORY = {
    "date": "2024-01-15",
    "partner": "Bob",
    "partner_id": 2,
    "opponent_1": "Carol",
    "opponent_1_id": 3,
    "opponent_2": "Dave",
    "opponent_2_id": 4,
    "result": "W",
    "score": "21-15",
    "elo_change": 12.5,
}


def test_match_history_keys_are_snake_case():
    """PlayerMatchHistoryResponse must serialize with snake_case keys."""
    _assert_all_keys_snake_case(PlayerMatchHistoryResponse, SAMPLE_HISTORY)
    _assert_json_keys_snake_case(PlayerMatchHistoryResponse, SAMPLE_HISTORY)


def test_match_history_no_space_keys():
    """Verify none of the old space-keyed fields appear in serialization."""
    instance = PlayerMatchHistoryResponse(**SAMPLE_HISTORY)
    serialized = instance.model_dump()
    old_keys = [
        "Partner ID",
        "Opponent 1",
        "Opponent 1 ID",
        "Opponent 2",
        "Opponent 2 ID",
        "ELO Change",
    ]
    for old_key in old_keys:
        assert old_key not in serialized, f"Old space-keyed field '{old_key}' found"


# ---------------------------------------------------------------------------
# EloTimelineResponse
# ---------------------------------------------------------------------------


def test_elo_timeline_keys_are_snake_case():
    """EloTimelineResponse must serialize with snake_case keys."""
    _assert_all_keys_snake_case(EloTimelineResponse, {"date": "2024-01-15"})
