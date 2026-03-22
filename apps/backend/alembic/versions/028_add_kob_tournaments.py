"""add_kob_tournaments

Revision ID: 028
Revises: 027
Create Date: 2026-03-01 00:00:00.000000

Add kob_tournaments, kob_players, and kob_matches tables for
King/Queen of the Beach tournament support.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = "028"
down_revision: Union[str, None] = "027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table_name: str) -> bool:
    """Check if a table exists."""
    result = conn.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT FROM information_schema.tables "
            "  WHERE table_name = :table_name"
            ")"
        ),
        {"table_name": table_name},
    )
    return result.scalar()


def upgrade() -> None:
    """Add KOB tournament tables."""
    conn = op.get_bind()

    # --- kob_tournaments ---
    if not _table_exists(conn, "kob_tournaments"):
        tournament_status = sa.Enum(
            "SETUP",
            "ACTIVE",
            "COMPLETED",
            "CANCELLED",
            name="tournamentstatus",
        )
        tournament_format = sa.Enum(
            "FULL_ROUND_ROBIN",
            "POOLS_PLAYOFFS",
            "PARTIAL_ROUND_ROBIN",
            name="tournamentformat",
        )

        op.create_table(
            "kob_tournaments",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("name", sa.String, nullable=False),
            sa.Column("code", sa.String(10), nullable=False, unique=True),
            sa.Column(
                "director_player_id",
                sa.Integer,
                sa.ForeignKey("players.id", ondelete="SET NULL"),
                nullable=True,
            ),
            # Config
            sa.Column("gender", sa.String(10), nullable=False),
            sa.Column("format", tournament_format, nullable=False),
            sa.Column("game_to", sa.Integer, nullable=False, server_default="21"),
            sa.Column("win_by", sa.Integer, nullable=False, server_default="2"),
            sa.Column("num_courts", sa.Integer, nullable=False, server_default="2"),
            sa.Column("max_rounds", sa.Integer, nullable=True),
            sa.Column("has_playoffs", sa.Boolean, server_default="false"),
            sa.Column("playoff_size", sa.Integer, nullable=True),
            sa.Column("num_pools", sa.Integer, nullable=True),
            sa.Column("is_ranked", sa.Boolean, server_default="false"),
            # Optional associations
            sa.Column(
                "league_id",
                sa.Integer,
                sa.ForeignKey("leagues.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "location_id",
                sa.String,
                sa.ForeignKey("locations.id", ondelete="SET NULL"),
                nullable=True,
            ),
            # State
            sa.Column("status", tournament_status, nullable=False, server_default="SETUP"),
            sa.Column("current_phase", sa.String(20), nullable=True),
            sa.Column("current_round", sa.Integer, nullable=True),
            sa.Column("auto_advance", sa.Boolean, server_default="true"),
            sa.Column("schedule_data", JSONB, nullable=True),
            sa.Column("scheduled_date", sa.Date, nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
        )

        op.create_index("idx_kob_tournaments_code", "kob_tournaments", ["code"])
        op.create_index("idx_kob_tournaments_director", "kob_tournaments", ["director_player_id"])
        op.create_index("idx_kob_tournaments_status", "kob_tournaments", ["status"])

    # --- kob_players ---
    if not _table_exists(conn, "kob_players"):
        op.create_table(
            "kob_players",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "tournament_id",
                sa.Integer,
                sa.ForeignKey("kob_tournaments.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "player_id",
                sa.Integer,
                sa.ForeignKey("players.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("seed", sa.Integer, nullable=True),
            sa.Column("pool_id", sa.Integer, nullable=True),
            sa.Column("is_dropped", sa.Boolean, server_default="false"),
            sa.Column("dropped_at_round", sa.Integer, nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
        )

        op.create_unique_constraint(
            "uq_kob_players_tournament_player",
            "kob_players",
            ["tournament_id", "player_id"],
        )
        op.create_index("idx_kob_players_tournament", "kob_players", ["tournament_id"])

    # --- kob_matches ---
    if not _table_exists(conn, "kob_matches"):
        op.create_table(
            "kob_matches",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "tournament_id",
                sa.Integer,
                sa.ForeignKey("kob_tournaments.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("matchup_id", sa.String(20), nullable=False),
            sa.Column("round_num", sa.Integer, nullable=False),
            sa.Column("phase", sa.String(20), nullable=False),
            sa.Column("pool_id", sa.Integer, nullable=True),
            sa.Column("court_num", sa.Integer, nullable=True),
            sa.Column(
                "team1_player1_id",
                sa.Integer,
                sa.ForeignKey("players.id"),
                nullable=False,
            ),
            sa.Column(
                "team1_player2_id",
                sa.Integer,
                sa.ForeignKey("players.id"),
                nullable=False,
            ),
            sa.Column(
                "team2_player1_id",
                sa.Integer,
                sa.ForeignKey("players.id"),
                nullable=False,
            ),
            sa.Column(
                "team2_player2_id",
                sa.Integer,
                sa.ForeignKey("players.id"),
                nullable=False,
            ),
            sa.Column("team1_score", sa.Integer, nullable=True),
            sa.Column("team2_score", sa.Integer, nullable=True),
            sa.Column("winner", sa.Integer, nullable=True),
            sa.Column("is_bye", sa.Boolean, server_default="false"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
        )

        op.create_unique_constraint(
            "uq_kob_matches_tournament_matchup",
            "kob_matches",
            ["tournament_id", "matchup_id"],
        )
        op.create_index("idx_kob_matches_tournament", "kob_matches", ["tournament_id"])
        op.create_index(
            "idx_kob_matches_round",
            "kob_matches",
            ["tournament_id", "round_num"],
        )


def downgrade() -> None:
    """Remove KOB tournament tables."""
    conn = op.get_bind()

    if _table_exists(conn, "kob_matches"):
        op.drop_table("kob_matches")

    if _table_exists(conn, "kob_players"):
        op.drop_table("kob_players")

    if _table_exists(conn, "kob_tournaments"):
        op.drop_table("kob_tournaments")

    # Drop enums
    op.execute(text("DROP TYPE IF EXISTS tournamentstatus"))
    op.execute(text("DROP TYPE IF EXISTS tournamentformat"))
