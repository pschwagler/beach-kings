"""Batch, read-only season history using the standings calculation's eligibility."""

from collections import defaultdict
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
from backend.database.models import Season, League, SeasonRatingHistory
from backend.services.leagues.league_data import get_league_standings
from backend.services.stats.stats_calc_data import load_stat_eligible_matches_async
from backend.services.stats.calculation_service import get_scoring_config, calculate_points


def iso_date(value):
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(str(value), fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError("Invalid session date")


async def get_season_points(db, league_id: int, season_id: int):
    season = (
        await db.execute(
            select(Season).where(Season.id == season_id, Season.league_id == league_id)
        )
    ).scalar_one_or_none()
    if season is None:
        raise HTTPException(status_code=404, detail="Season not found")
    league = (await db.execute(select(League).where(League.id == league_id))).scalar_one()
    standings = (await get_league_standings(db, league_id, season_id))["standings"]
    matches = await load_stat_eligible_matches_async(db, season_id=season_id, league_id=league_id)
    ratings = (
        (
            await db.execute(
                select(SeasonRatingHistory).where(SeasonRatingHistory.season_id == season_id)
            )
        )
        .scalars()
        .all()
    )
    ratings = {(r.player_id, r.match_id): r for r in ratings}
    config = get_scoring_config(season.point_system)
    is_rating = season.scoring_system == "season_rating"
    baseline = 100.0 if is_rating else 0.0
    histories = defaultdict(list)
    records = defaultdict(lambda: [0, 0])
    sessions = {}
    previous = defaultdict(lambda: baseline)
    for match in matches:
        s = match.session
        day = iso_date(s.date)
        sid = str(s.id)
        if sid not in sessions:
            sessions[sid] = dict(
                id=sid, date=day, status=getattr(s.status, "value", s.status), games=0
            )
        sessions[sid]["games"] += 1
        teams = (
            (match.team1_player1_id, match.team1_player2_id),
            (match.team2_player1_id, match.team2_player2_id),
        )
        for team, ids in enumerate(teams, 1):
            for pid in ids:
                won = match.winner == team
                records[pid][0] += 1
                records[pid][1] += int(won)
                if is_rating:
                    rating = ratings.get((pid, match.id))
                    if rating is None:
                        continue
                    points = rating.rating_after
                else:
                    games, wins = records[pid]
                    points = calculate_points(wins, games - wins, config)
                histories[pid].append(
                    dict(
                        match=match.id,
                        session=sid,
                        date=day,
                        points=points,
                        change=round(points - previous[pid], 6),
                        result="W" if won else "D" if match.winner == -1 else "L",
                    )
                )
                previous[pid] = points
    players = []
    for row in standings:
        pid = row["player_id"]
        history = histories[pid]
        complete = (
            len(history) == row["games_played"]
            and abs((history[-1]["points"] if history else baseline) - row["rating"]) < 0.011
        )
        players.append(
            dict(
                id=str(pid),
                name=row["display_name"],
                rank=row["rank"],
                games=row["games_played"],
                wins=row["wins"],
                points=row["rating"],
                complete=complete,
                history=history if complete else [],
            )
        )
    return dict(
        league=league.name,
        season=season.name or f"Season {season.id}",
        startDate=season.start_date.isoformat(),
        endDate=season.end_date.isoformat() if season.end_date else None,
        scoringSystem=season.scoring_system,
        baseline=baseline,
        fetchedAt=datetime.now(timezone.utc).isoformat(),
        players=players,
        sessions=list(sessions.values()),
    )
