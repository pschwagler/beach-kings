"""Add avg_point_diff to player_global_stats and backfill from matches.

Adds the lifetime average point differential to ``PlayerGlobalStats`` so the
"All / All time" My Stats filter can return true lifetime numbers from a single
row instead of falling back to the latest season-stats row.

Backfill computes the per-player signed point differential across every
stat-eligible match (``ranked_intent = TRUE`` and session status SUBMITTED /
EDITED, or no session) and divides by the count of those matches — matching
the convention used by ``calculation_service._record_point_differentials``.

Revision ID: 048
Revises: 047
"""

import sqlalchemy as sa
from alembic import op


revision = "048"
down_revision = "047"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    """Return True when `column` already exists in `table`."""
    bind = op.get_bind()
    result = bind.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return result.fetchone() is not None


_BACKFILL_SQL = """
WITH player_match_diffs AS (
    SELECT
        p.player_id,
        CASE
            WHEN p.player_id IN (m.team1_player1_id, m.team1_player2_id)
                THEN m.team1_score - m.team2_score
            ELSE m.team2_score - m.team1_score
        END AS signed_diff
    FROM matches m
    LEFT JOIN sessions s ON s.id = m.session_id
    CROSS JOIN LATERAL (
        VALUES
            (m.team1_player1_id),
            (m.team1_player2_id),
            (m.team2_player1_id),
            (m.team2_player2_id)
    ) AS p(player_id)
    WHERE p.player_id IS NOT NULL
      AND m.ranked_intent = TRUE
      AND (s.status IN ('SUBMITTED', 'EDITED') OR s.id IS NULL)
),
agg AS (
    SELECT
        player_id,
        SUM(signed_diff)::float / NULLIF(COUNT(*), 0) AS avg_point_diff
    FROM player_match_diffs
    GROUP BY player_id
)
UPDATE player_global_stats pgs
SET avg_point_diff = COALESCE(agg.avg_point_diff, 0)
FROM agg
WHERE pgs.player_id = agg.player_id;
"""


def upgrade() -> None:
    if not _column_exists("player_global_stats", "avg_point_diff"):
        op.add_column(
            "player_global_stats",
            sa.Column(
                "avg_point_diff",
                sa.Float(),
                nullable=False,
                server_default="0",
            ),
        )

    # Backfill from raw matches.
    op.execute(_BACKFILL_SQL)

    # Drop the server default — application writes always set the value.
    op.alter_column("player_global_stats", "avg_point_diff", server_default=None)


def downgrade() -> None:
    if _column_exists("player_global_stats", "avg_point_diff"):
        op.drop_column("player_global_stats", "avg_point_diff")
