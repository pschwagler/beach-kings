"""add_placeholder_courts

Revision ID: 035
Revises: 034
Create Date: 2026-03-04 00:00:00.000000

Add is_placeholder column to courts table and seed one
"Other / Private Court" row per location.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "035"
down_revision: Union[str, None] = "034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_placeholder column and seed placeholder courts."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("courts")]

    if "is_placeholder" not in columns:
        op.add_column(
            "courts",
            sa.Column(
                "is_placeholder",
                sa.Boolean(),
                nullable=False,
                server_default="false",
            ),
        )

    # Seed one placeholder court per location that doesn't already have one
    locations = sa.table("locations", sa.column("id", sa.String))
    courts = sa.table(
        "courts",
        sa.column("name", sa.String),
        sa.column("address", sa.String),
        sa.column("location_id", sa.String),
        sa.column("slug", sa.String),
        sa.column("status", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("is_placeholder", sa.Boolean),
    )

    result = conn.execute(sa.select(locations.c.id))
    location_ids = [row[0] for row in result]

    for loc_id in location_ids:
        # Check if placeholder already exists for this location
        existing = conn.execute(
            sa.select(sa.literal(1)).select_from(courts).where(
                sa.and_(
                    courts.c.location_id == loc_id,
                    courts.c.is_placeholder == True,  # noqa: E712
                )
            )
        ).first()

        if not existing:
            conn.execute(
                courts.insert().values(
                    name="Other / Private Court",
                    address=None,
                    location_id=loc_id,
                    slug=f"other-private-{loc_id}",
                    status="approved",
                    is_active=False,
                    is_placeholder=True,
                )
            )


def downgrade() -> None:
    """Remove placeholder courts and column."""
    conn = op.get_bind()
    courts = sa.table(
        "courts",
        sa.column("is_placeholder", sa.Boolean),
    )
    conn.execute(courts.delete().where(courts.c.is_placeholder == True))  # noqa: E712
    op.drop_column("courts", "is_placeholder")
