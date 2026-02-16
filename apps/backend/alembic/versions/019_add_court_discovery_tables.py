"""add_court_discovery_tables

Revision ID: 019
Revises: 018
Create Date: 2026-02-15

Add court discovery & reviews feature:
- Extend courts table with ~18 new columns (description, court_count,
  surface_type, amenity bools, lat/lng, status, slug, rating, etc.)
- Create court_tags table (curated review tags)
- Create court_reviews table (1 review per user per court)
- Create court_review_tags join table
- Create court_review_photos table
- Create court_edit_suggestions table
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "019"
down_revision: Union[str, None] = "018"
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


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = conn.execute(
        text(
            "SELECT EXISTS (SELECT FROM information_schema.columns "
            "WHERE table_name = :table_name AND column_name = :column_name)"
        ),
        {"table_name": table_name, "column_name": column_name},
    )
    return result.scalar()


def _index_exists(conn, index_name: str) -> bool:
    """Check if an index exists."""
    result = conn.execute(
        text("SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = :index_name)"),
        {"index_name": index_name},
    )
    return result.scalar()


# New columns to add to courts table (name, type, kwargs)
_COURTS_NEW_COLUMNS = [
    ("description", sa.Text(), {"nullable": True}),
    ("court_count", sa.Integer(), {"nullable": True}),
    ("surface_type", sa.String(50), {"nullable": True}),
    ("is_free", sa.Boolean(), {"nullable": True}),
    ("cost_info", sa.Text(), {"nullable": True}),
    ("has_lights", sa.Boolean(), {"nullable": True}),
    ("has_restrooms", sa.Boolean(), {"nullable": True}),
    ("has_parking", sa.Boolean(), {"nullable": True}),
    ("parking_info", sa.Text(), {"nullable": True}),
    ("nets_provided", sa.Boolean(), {"nullable": True}),
    ("hours", sa.Text(), {"nullable": True}),
    ("phone", sa.String(30), {"nullable": True}),
    ("website", sa.String(500), {"nullable": True}),
    ("latitude", sa.Float(), {"nullable": True}),
    ("longitude", sa.Float(), {"nullable": True}),
    ("average_rating", sa.Float(), {"nullable": True}),
    ("review_count", sa.Integer(), {"nullable": True, "server_default": "0"}),
    ("status", sa.String(20), {"nullable": True, "server_default": "'approved'"}),
    ("is_active", sa.Boolean(), {"nullable": True, "server_default": "true"}),
    ("slug", sa.String(200), {"nullable": True}),
]


def upgrade() -> None:
    """Add court discovery columns, review tables, and tag tables."""
    conn = op.get_bind()

    # --- 1. Add new columns to courts table ---

    for col_name, col_type, kwargs in _COURTS_NEW_COLUMNS:
        if not _column_exists(conn, "courts", col_name):
            op.add_column("courts", sa.Column(col_name, col_type, **kwargs))

    # Indexes on courts
    if not _index_exists(conn, "idx_courts_slug"):
        op.create_index("idx_courts_slug", "courts", ["slug"], unique=True)
    if not _index_exists(conn, "idx_courts_status"):
        op.create_index("idx_courts_status", "courts", ["status"])
    if not _index_exists(conn, "idx_courts_lat_lng"):
        op.create_index("idx_courts_lat_lng", "courts", ["latitude", "longitude"])
    if not _index_exists(conn, "idx_courts_is_active"):
        op.create_index("idx_courts_is_active", "courts", ["is_active"])

    # --- 2. Create court_tags table ---

    if not _table_exists(conn, "court_tags"):
        op.create_table(
            "court_tags",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(50), nullable=False),
            sa.Column("slug", sa.String(50), nullable=False),
            sa.Column("category", sa.String(30), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("slug", name="uq_court_tags_slug"),
        )
        if not _index_exists(conn, "idx_court_tags_category"):
            op.create_index("idx_court_tags_category", "court_tags", ["category"])

    # --- 3. Create court_reviews table ---

    if not _table_exists(conn, "court_reviews"):
        op.create_table(
            "court_reviews",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("court_id", sa.Integer(), nullable=False),
            sa.Column("player_id", sa.Integer(), nullable=False),
            sa.Column("rating", sa.Integer(), nullable=False),
            sa.Column("review_text", sa.Text(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["court_id"], ["courts.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "court_id", "player_id", name="uq_court_reviews_court_player"
            ),
            sa.CheckConstraint(
                "rating >= 1 AND rating <= 5", name="ck_court_reviews_rating_range"
            ),
        )
        if not _index_exists(conn, "idx_court_reviews_court"):
            op.create_index("idx_court_reviews_court", "court_reviews", ["court_id"])
        if not _index_exists(conn, "idx_court_reviews_player"):
            op.create_index("idx_court_reviews_player", "court_reviews", ["player_id"])
        if not _index_exists(conn, "idx_court_reviews_created"):
            op.create_index(
                "idx_court_reviews_created", "court_reviews", ["created_at"]
            )

    # --- 4. Create court_review_tags join table ---

    if not _table_exists(conn, "court_review_tags"):
        op.create_table(
            "court_review_tags",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("review_id", sa.Integer(), nullable=False),
            sa.Column("tag_id", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["review_id"], ["court_reviews.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["tag_id"], ["court_tags.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "review_id", "tag_id", name="uq_court_review_tags_review_tag"
            ),
        )
        if not _index_exists(conn, "idx_court_review_tags_review"):
            op.create_index(
                "idx_court_review_tags_review", "court_review_tags", ["review_id"]
            )
        if not _index_exists(conn, "idx_court_review_tags_tag"):
            op.create_index(
                "idx_court_review_tags_tag", "court_review_tags", ["tag_id"]
            )

    # --- 5. Create court_review_photos table ---

    if not _table_exists(conn, "court_review_photos"):
        op.create_table(
            "court_review_photos",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("review_id", sa.Integer(), nullable=False),
            sa.Column("s3_key", sa.String(500), nullable=False),
            sa.Column("url", sa.String(500), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["review_id"], ["court_reviews.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        if not _index_exists(conn, "idx_court_review_photos_review"):
            op.create_index(
                "idx_court_review_photos_review",
                "court_review_photos",
                ["review_id"],
            )

    # --- 6. Create court_edit_suggestions table ---

    if not _table_exists(conn, "court_edit_suggestions"):
        op.create_table(
            "court_edit_suggestions",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("court_id", sa.Integer(), nullable=False),
            sa.Column("suggested_by", sa.Integer(), nullable=False),
            sa.Column("changes", sa.Text(), nullable=False),  # JSON string
            sa.Column(
                "status",
                sa.String(20),
                nullable=False,
                server_default="pending",
            ),
            sa.Column("reviewed_by", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["court_id"], ["courts.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(
                ["suggested_by"], ["players.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["reviewed_by"], ["players.id"], ondelete="SET NULL"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.CheckConstraint(
                "status IN ('pending', 'approved', 'rejected')",
                name="ck_court_edit_suggestions_status",
            ),
        )
        if not _index_exists(conn, "idx_court_edit_suggestions_court"):
            op.create_index(
                "idx_court_edit_suggestions_court",
                "court_edit_suggestions",
                ["court_id"],
            )
        if not _index_exists(conn, "idx_court_edit_suggestions_status"):
            op.create_index(
                "idx_court_edit_suggestions_status",
                "court_edit_suggestions",
                ["status"],
            )


def downgrade() -> None:
    """Remove court discovery tables and columns."""
    conn = op.get_bind()

    # Drop new tables (reverse order of creation)
    for table_name in [
        "court_edit_suggestions",
        "court_review_photos",
        "court_review_tags",
        "court_reviews",
        "court_tags",
    ]:
        if _table_exists(conn, table_name):
            op.drop_table(table_name)

    # Drop indexes on courts
    for idx_name in [
        "idx_courts_is_active",
        "idx_courts_lat_lng",
        "idx_courts_status",
        "idx_courts_slug",
    ]:
        if _index_exists(conn, idx_name):
            op.drop_index(idx_name, table_name="courts")

    # Drop new columns from courts (reverse order)
    for col_name, _, _ in reversed(_COURTS_NEW_COLUMNS):
        if _column_exists(conn, "courts", col_name):
            op.drop_column("courts", col_name)
