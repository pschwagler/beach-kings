"""Add location metadata columns to sessions table.

Adds location_id (FK → locations.id), latitude, longitude to sessions.
Backfills existing sessions with QBK Sports coords and ny_nyc location.
Adds indexes for location-based queries.

Revision ID: 037
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def _column_exists(table: str, column: str) -> bool:
    """Return True if the column already exists on the table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    cols = [c["name"] for c in inspector.get_columns(table)]
    return column in cols


def _fk_exists(table: str, constraint_name: str) -> bool:
    """Return True if the named FK constraint already exists on the table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    fks = [fk["name"] for fk in inspector.get_foreign_keys(table)]
    return constraint_name in fks


def _index_exists(index_name: str) -> bool:
    """Return True if the named index already exists."""
    bind = op.get_bind()
    result = bind.execute(
        sa.text("SELECT 1 FROM pg_indexes WHERE indexname = :name"),
        {"name": index_name},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    if not _column_exists("sessions", "location_id"):
        op.add_column("sessions", sa.Column("location_id", sa.String(), nullable=True))
    if not _column_exists("sessions", "latitude"):
        op.add_column("sessions", sa.Column("latitude", sa.Float(), nullable=True))
    if not _column_exists("sessions", "longitude"):
        op.add_column("sessions", sa.Column("longitude", sa.Float(), nullable=True))

    if not _fk_exists("sessions", "fk_sessions_location_id"):
        op.create_foreign_key(
            "fk_sessions_location_id",
            "sessions",
            "locations",
            ["location_id"],
            ["id"],
        )

    if not _index_exists("idx_sessions_location"):
        op.create_index("idx_sessions_location", "sessions", ["location_id"])
    if not _index_exists("idx_sessions_lat_lng"):
        op.create_index("idx_sessions_lat_lng", "sessions", ["latitude", "longitude"])

    # Intentional: all existing sessions were played at QBK Sports, Queens NYC.
    # This sets court_id, location_id, and coordinates for every pre-migration session.
    op.execute(
        """
        UPDATE sessions
        SET court_id = (SELECT id FROM courts WHERE slug = 'qbk-sports-queens' LIMIT 1),
            location_id = 'ny_nyc',
            latitude = 40.7471,
            longitude = -73.9256
        WHERE location_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("idx_sessions_lat_lng", table_name="sessions")
    op.drop_index("idx_sessions_location", table_name="sessions")
    op.drop_constraint("fk_sessions_location_id", "sessions", type_="foreignkey")
    op.drop_column("sessions", "longitude")
    op.drop_column("sessions", "latitude")
    op.drop_column("sessions", "location_id")
