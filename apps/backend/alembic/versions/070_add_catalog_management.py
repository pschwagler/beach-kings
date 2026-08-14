"""Add catalog ownership and lifecycle metadata."""

import sqlalchemy as sa
from alembic import op

revision = "070"
down_revision = "069"
branch_labels = None
depends_on = None


def _add_catalog_columns(table: str, *, active: bool = True) -> None:
    op.add_column(
        table,
        sa.Column("catalog_managed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(table, sa.Column("catalog_source", sa.String(length=100)))
    op.add_column(table, sa.Column("catalog_revision", sa.String(length=64)))
    if active:
        op.add_column(
            table, sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true())
        )
    op.create_index(f"idx_{table}_catalog_managed", table, ["catalog_managed"])


def upgrade() -> None:
    _add_catalog_columns("regions")
    _add_catalog_columns("locations")
    _add_catalog_columns("court_tags")
    _add_catalog_columns("courts", active=False)


def downgrade() -> None:
    for table, active in (
        ("courts", False),
        ("court_tags", True),
        ("locations", True),
        ("regions", True),
    ):
        op.drop_index(f"idx_{table}_catalog_managed", table_name=table)
        if active:
            op.drop_column(table, "is_active")
        op.drop_column(table, "catalog_revision")
        op.drop_column(table, "catalog_source")
        op.drop_column(table, "catalog_managed")
