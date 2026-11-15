"""Carry the current review, including manual identities, into AI corrections."""

import json

from fastapi import HTTPException
from sqlalchemy import select

from backend.database.models import LeagueMember, Player

FIELDS = ("team1_player1", "team1_player2", "team2_player1", "team2_player2")


def reviewed_games(reviewed_matches):
    """Copy a confirmation payload without mutating a shared Redis draft."""
    matches = []
    for game in reviewed_matches:
        match = {"team1_score": game.scores[0], "team2_score": game.scores[1]}
        for field, player in zip(FIELDS, game.players):
            match[field] = {"name": player.rawName or player.name}
            match[field + "_id"] = player.id
        matches.append(match)
    return matches


def prompt_state(matches):
    """Keep known IDs, display names, raw aliases, and even partially read scores."""
    games = []
    for match in matches:
        players = []
        for field in FIELDS:
            raw = match.get(field)
            raw_name = raw.get("name", "") if isinstance(raw, dict) else (raw or "")
            player_id = match.get(field + "_id")
            players.append(
                {
                    "id": player_id,
                    "name": match.get(field + "_matched") or raw_name,
                    "raw_name": raw_name,
                }
            )
        games.append(
            {
                "t1": players[:2],
                "t2": players[2:],
                "scores": [match.get("team1_score"), match.get("team2_score")],
            }
        )
    return json.dumps({"matches": games}, ensure_ascii=False)


async def prepare_review(session, draft_id, members, reviewed_matches, league_id):
    """Validate reviewed identities and add selected players beyond the original roster."""
    from backend.services import photo_match_service

    if reviewed_matches is None:
        return members  # Compatibility with clients that send only a prompt.
    player_ids = {
        player.id for game in reviewed_matches for player in game.players if player.id is not None
    }
    players = (
        (
            await session.scalars(
                select(Player).where(Player.id.in_(player_ids), Player.deleted_at.is_(None))
            )
        ).all()
        if player_ids
        else []
    )
    by_id = {player.id: player for player in players}
    if set(by_id) != player_ids:
        raise HTTPException(
            422, "A selected player is no longer available. Choose another player and retry."
        )
    existing = {member["player_id"] for member in members}
    added_ids = player_ids - existing
    league_players = set()
    if league_id is not None and added_ids:
        league_players = set(
            await session.scalars(
                select(LeagueMember.player_id).where(
                    LeagueMember.league_id == league_id, LeagueMember.player_id.in_(added_ids)
                )
            )
        )
    candidates = [*members]
    for player_id in sorted(added_ids):
        player = by_id[player_id]
        candidate = {
            "player_id": player_id,
            "player_name": player.full_name,
            "player_nickname": player.nickname,
        }
        if league_id is not None:
            candidate["is_league_member"] = player_id in league_players
        candidates.append(candidate)
    matches = []
    for game in reviewed_matches:
        match = {"team1_score": game.scores[0], "team2_score": game.scores[1]}
        for field, player in zip(FIELDS, game.players):
            raw_name = player.rawName or player.name
            match[field] = {"id": player.id, "name": raw_name}
            match[field + "_id"] = player.id
            match[field + "_matched"] = by_id[player.id].full_name if player.id is not None else ""
            match[field + "_confidence"] = 1.0 if player.id is not None else 0.0
        matches.append(match)
    if not await photo_match_service.update_session_data(
        draft_id, {"parsed_matches": matches, "player_context": candidates}
    ):
        raise HTTPException(503, "Could not retain your review. Please retry the correction.")
    return candidates
