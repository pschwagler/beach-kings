#!/usr/bin/env python3
"""Create the non-expiring, synthetic App Review fixture.

This script is intentionally additive and production-safe: it never deletes data,
never changes an existing password, and refuses to adopt an unrelated account.
The password is accepted only through the environment and is never printed.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import date, timedelta

from sqlalchemy import select

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.path.isdir(os.path.join(project_root, "apps", "backend")):
    python_root = os.path.join(project_root, "apps")
elif os.path.isdir(os.path.join(os.getcwd(), "backend")):
    python_root = os.getcwd()
else:
    python_root = project_root
sys.path.insert(0, python_root)

from backend.database.db import AsyncSessionLocal  # noqa: E402
from backend.database.models import (  # noqa: E402
    Court,
    CourtReview,
    DirectMessage,
    EloHistory,
    Friend,
    League,
    LeagueHomeCourt,
    LeagueMember,
    LeagueMessage,
    Match,
    Notification,
    OpponentStats,
    OpponentStatsSeason,
    PartnershipStats,
    PartnershipStatsSeason,
    Player,
    PlayerGlobalStats,
    PlayerHomeCourt,
    PlayerLeagueStats,
    PlayerSeasonStats,
    Season,
    SeasonAward,
    Session,
    SessionParticipant,
    User,
)
from backend.database.models.enums import SessionStatus  # noqa: E402
from backend.services.auth.auth_service import hash_password  # noqa: E402


REVIEW_EMAIL = "app-review@beachleaguevb.com"
REVIEW_NAME = "Beach League Reviewer"
LEAGUE_NAME = "App Review League"
ACTIVE_SESSION_NAME = "App Review Session"
SUPPORT_PLAYERS = (
    ("app-review-teammate@beachleaguevb.com", "Taylor Sand"),
    ("app-review-opponent-one@beachleaguevb.com", "Jordan Set"),
    ("app-review-opponent-two@beachleaguevb.com", "Casey Block"),
)


async def _one(session, model, **filters):
    result = await session.execute(select(model).filter_by(**filters))
    return result.scalars().first()


async def _fixture_user(
    session, *, email: str, name: str, password: str | None
) -> tuple[User, Player]:
    user = await _one(session, User, email=email)
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(password) if password else None,
            auth_provider="phone",
            is_verified=True,
            moderation_status="active",
            age_group="adult",
            eligibility_country="US",
            eligibility_region="CA",
            age_assurance_source="self_declared",
            age_declaration_source="self_declared",
            guardian_consent=False,
        )
        session.add(user)
        await session.flush()

    player = await _one(session, Player, user_id=user.id)
    if player is None:
        player = Player(
            user_id=user.id,
            full_name=name,
            first_name=name.split(" ", 1)[0],
            last_name=name.split(" ", 1)[1],
            gender="coed",
            level="A",
            city="San Diego",
            state="CA",
            is_placeholder=False,
        )
        session.add(player)
        await session.flush()
    elif player.full_name != name:
        raise RuntimeError(f"Refusing to adopt non-fixture account for {email}")
    return user, player


async def _add_if_missing(session, model, lookup: dict, values: dict | None = None):
    row = await _one(session, model, **lookup)
    if row is None:
        row = model(**lookup, **(values or {}))
        session.add(row)
        await session.flush()
    return row


async def seed() -> dict[str, int | str]:
    password = os.environ.get("APP_REVIEW_PASSWORD", "")
    if len(password.encode("utf-8")) < 20:
        raise RuntimeError("APP_REVIEW_PASSWORD must contain at least 20 bytes")

    async with AsyncSessionLocal() as session:
        async with session.begin():
            review_user, reviewer = await _fixture_user(
                session, email=REVIEW_EMAIL, name=REVIEW_NAME, password=password
            )
            support = []
            for email, name in SUPPORT_PLAYERS:
                _, player = await _fixture_user(session, email=email, name=name, password=None)
                support.append(player)

            court_result = await session.execute(
                select(Court)
                .where(Court.status == "approved", Court.is_active.is_(True))
                .order_by(Court.id)
                .limit(1)
            )
            court = court_result.scalars().first()

            league = await _one(session, League, name=LEAGUE_NAME)
            if league is None:
                league = League(
                    name=LEAGUE_NAME,
                    description="Synthetic league prepared exclusively for App Review.",
                    location_id=court.location_id if court else None,
                    is_open=False,
                    is_public=False,
                    gender="coed",
                    level="advanced",
                    created_by=reviewer.id,
                    updated_by=reviewer.id,
                )
                session.add(league)
                await session.flush()

            for index, player in enumerate((reviewer, *support)):
                await _add_if_missing(
                    session,
                    LeagueMember,
                    {"league_id": league.id, "player_id": player.id},
                    {"role": "admin" if index == 0 else "member", "created_by": reviewer.id},
                )

            today = date.today()
            season = await _one(session, Season, league_id=league.id, name="Review Season")
            if season is None:
                season = Season(
                    league_id=league.id,
                    name="Review Season",
                    start_date=today - timedelta(days=90),
                    end_date=None,
                    scoring_system="points_system",
                    created_by=reviewer.id,
                    updated_by=reviewer.id,
                )
                session.add(season)
                await session.flush()

            active_session = await _one(
                session, Session, league_id=league.id, name=ACTIVE_SESSION_NAME
            )
            if active_session is None:
                active_session = Session(
                    date=(today + timedelta(days=7)).isoformat(),
                    name=ACTIVE_SESSION_NAME,
                    status=SessionStatus.ACTIVE,
                    season_id=season.id,
                    league_id=league.id,
                    court_id=court.id if court else None,
                    location_id=court.location_id if court else None,
                    created_by=reviewer.id,
                    updated_by=reviewer.id,
                    start_time="6:00 PM",
                    session_type="league",
                    max_players=8,
                    notes="Safe synthetic session for App Review score entry.",
                    is_ranked=True,
                )
                session.add(active_session)
                await session.flush()

            for player in (reviewer, *support):
                await _add_if_missing(
                    session,
                    SessionParticipant,
                    {"session_id": active_session.id, "player_id": player.id},
                    {"invited_by": reviewer.id},
                )

            match_ids = []
            scores = ((21, 16), (18, 21), (21, 19), (21, 14), (17, 21))
            for index, (score1, score2) in enumerate(scores, start=1):
                completed_name = f"Review Night {index}"
                completed = await _one(session, Session, league_id=league.id, name=completed_name)
                if completed is None:
                    completed = Session(
                        date=(today - timedelta(days=(6 - index) * 7)).isoformat(),
                        name=completed_name,
                        status=SessionStatus.SUBMITTED,
                        season_id=season.id,
                        league_id=league.id,
                        court_id=court.id if court else None,
                        location_id=court.location_id if court else None,
                        created_by=reviewer.id,
                        updated_by=reviewer.id,
                        session_type="league",
                        is_ranked=True,
                    )
                    session.add(completed)
                    await session.flush()
                match = await _one(session, Match, session_id=completed.id)
                if match is None:
                    match = Match(
                        session_id=completed.id,
                        team1_player1_id=reviewer.id,
                        team1_player2_id=support[0].id,
                        team2_player1_id=support[1].id,
                        team2_player2_id=support[2].id,
                        team1_score=score1,
                        team2_score=score2,
                        winner=1 if score1 > score2 else 2,
                        is_public=False,
                        is_ranked=True,
                        ranked_intent=True,
                        created_by=reviewer.id,
                        updated_by=reviewer.id,
                    )
                    session.add(match)
                    await session.flush()
                match_ids.append((match.id, completed.date, score1 > score2))

            player_stats = {
                reviewer: (5, 3, 9.0, 1218.0),
                support[0]: (5, 3, 9.0, 1218.0),
                support[1]: (5, 2, 6.0, 1182.0),
                support[2]: (5, 2, 6.0, 1182.0),
            }
            for player, (games, wins, points, rating) in player_stats.items():
                await _add_if_missing(
                    session,
                    PlayerSeasonStats,
                    {"player_id": player.id, "season_id": season.id},
                    {
                        "games": games,
                        "wins": wins,
                        "points": points,
                        "win_rate": wins / games,
                        "avg_point_diff": 1.4,
                    },
                )
                await _add_if_missing(
                    session,
                    PlayerGlobalStats,
                    {"player_id": player.id},
                    {
                        "current_rating": rating,
                        "total_games": games,
                        "total_wins": wins,
                        "avg_point_diff": 1.4,
                    },
                )
                await _add_if_missing(
                    session,
                    PlayerLeagueStats,
                    {"player_id": player.id, "league_id": league.id},
                    {
                        "games": games,
                        "wins": wins,
                        "points": points,
                        "win_rate": wins / games,
                        "avg_point_diff": 1.4,
                    },
                )

            for index, (match_id, played_on, won) in enumerate(match_ids, start=1):
                await _add_if_missing(
                    session,
                    EloHistory,
                    {"player_id": reviewer.id, "match_id": match_id},
                    {
                        "date": played_on,
                        "elo_after": 1200 + index * (6 if won else -4),
                        "elo_change": 6 if won else -4,
                    },
                )

            for partner in (support[0],):
                common = {
                    "games": 5,
                    "wins": 3,
                    "points": 9,
                    "win_rate": 0.6,
                    "avg_point_diff": 1.4,
                }
                await _add_if_missing(
                    session,
                    PartnershipStats,
                    {"player_id": reviewer.id, "partner_id": partner.id},
                    common,
                )
                await _add_if_missing(
                    session,
                    PartnershipStatsSeason,
                    {"player_id": reviewer.id, "partner_id": partner.id, "season_id": season.id},
                    common,
                )
            for opponent in support[1:]:
                common = {
                    "games": 5,
                    "wins": 3,
                    "points": 9,
                    "win_rate": 0.6,
                    "avg_point_diff": 1.4,
                }
                await _add_if_missing(
                    session,
                    OpponentStats,
                    {"player_id": reviewer.id, "opponent_id": opponent.id},
                    common,
                )
                await _add_if_missing(
                    session,
                    OpponentStatsSeason,
                    {"player_id": reviewer.id, "opponent_id": opponent.id, "season_id": season.id},
                    common,
                )

            pair = tuple(sorted((reviewer.id, support[0].id)))
            await _add_if_missing(
                session,
                Friend,
                {"player1_id": pair[0], "player2_id": pair[1]},
                {"created_by": reviewer.id},
            )
            await _add_if_missing(
                session,
                DirectMessage,
                {
                    "sender_player_id": support[0].id,
                    "receiver_player_id": reviewer.id,
                    "message_text": "See you at the next review session!",
                },
                {"is_read": False},
            )
            await _add_if_missing(
                session,
                LeagueMessage,
                {
                    "league_id": league.id,
                    "user_id": review_user.id,
                    "message_text": "Welcome to the synthetic App Review league.",
                },
            )
            await _add_if_missing(
                session,
                Notification,
                {"user_id": review_user.id, "dedup_key": "app-review-session-reminder"},
                {
                    "actor_player_id": support[0].id,
                    "type": "direct_message",
                    "title": "Review session reminder",
                    "message": "Your synthetic league session is ready to score.",
                    "is_read": False,
                    "link_url": "/messages",
                },
            )
            await _add_if_missing(
                session,
                SeasonAward,
                {"season_id": season.id, "award_key": "app_review_rising_star"},
                {
                    "player_id": reviewer.id,
                    "award_type": "stat_award",
                    "value": 18.0,
                    "season_name": season.name,
                    "league_id": league.id,
                },
            )

            if court:
                await _add_if_missing(
                    session,
                    LeagueHomeCourt,
                    {"league_id": league.id, "court_id": court.id},
                    {"position": 0},
                )
                await _add_if_missing(
                    session,
                    PlayerHomeCourt,
                    {"player_id": reviewer.id, "court_id": court.id},
                    {"position": 0},
                )
                await _add_if_missing(
                    session,
                    CourtReview,
                    {"court_id": court.id, "player_id": reviewer.id},
                    {
                        "rating": 5,
                        "review_text": "Great sand and an easy place to organize league play.",
                    },
                )

        return {
            "user_id": review_user.id,
            "player_id": reviewer.id,
            "league_id": league.id,
            "season_id": season.id,
            "session_id": active_session.id,
            "email": REVIEW_EMAIL,
        }


async def main() -> None:
    result = await seed()
    print(
        "App Review fixture ready: "
        f"user={result['user_id']} player={result['player_id']} "
        f"league={result['league_id']} session={result['session_id']}"
    )
    print(f"Login: {result['email']} (password intentionally not printed)")


if __name__ == "__main__":
    asyncio.run(main())
