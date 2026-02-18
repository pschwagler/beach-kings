"""add_court_photos

Revision ID: 023
Revises: 022
Create Date: 2026-02-17 00:00:00.000000

Add court_photos table for standalone court photos (separate from review photos).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "023"
down_revision: Union[str, None] = "022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table_name: str) -> bool:
    """Check if a table exists."""
    result = conn.execute(
        text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :table_name)"
        ),
        {"table_name": table_name},
    )
    return result.scalar()


def _index_exists(conn, index_name: str) -> bool:
    """Check if an index exists."""
    result = conn.execute(
        text("SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = :index_name)"),
        {"index_name": index_name},
    )
    return result.scalar()


def upgrade() -> None:
    """Create court_photos table with index on court_id."""
    conn = op.get_bind()

    if not _table_exists(conn, "court_photos"):
        op.create_table(
            "court_photos",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("court_id", sa.Integer(), nullable=False),
            sa.Column("s3_key", sa.String(500), nullable=False),
            sa.Column("url", sa.String(500), nullable=False),
            sa.Column("uploaded_by", sa.Integer(), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["court_id"], ["courts.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["uploaded_by"], ["players.id"], ondelete="SET NULL"
            ),
            sa.PrimaryKeyConstraint("id"),
        )

        if not _index_exists(conn, "idx_court_photos_court"):
            op.create_index(
                "idx_court_photos_court",
                "court_photos",
                ["court_id"],
                unique=False,
            )


def downgrade() -> None:
    """Remove court_photos table and indexes."""
    conn = op.get_bind()

    if _index_exists(conn, "idx_court_photos_court"):
        op.drop_index("idx_court_photos_court", table_name="court_photos")

    if _table_exists(conn, "court_photos"):
        op.drop_table("court_photos")
