"""Read-only season exploration contract."""

from typing import Literal
from pydantic import BaseModel


class PointEvent(BaseModel):
    match: int
    session: str
    date: str
    points: float
    change: float
    result: Literal["W", "L", "D"]


class PointsPlayer(BaseModel):
    id: str
    name: str
    rank: int
    games: int
    wins: int
    points: float
    complete: bool
    history: list[PointEvent]


class PointsSession(BaseModel):
    id: str
    date: str
    status: str
    games: int


class SeasonPointsResponse(BaseModel):
    league: str
    season: str
    startDate: str
    endDate: str | None
    scoringSystem: str
    baseline: float
    fetchedAt: str
    players: list[PointsPlayer]
    sessions: list[PointsSession]
