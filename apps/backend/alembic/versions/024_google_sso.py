"""google_sso

Revision ID: 024
Revises: 023
Create Date: 2026-02-18 00:00:00.000000

Add Google SSO support: make phone_number/password_hash nullable,
add auth_provider, google_id columns, add unique index on email.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = "024"
down_revision: Union[str, None] = "023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = conn.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT FROM information_schema.columns "
            "  WHERE table_name = :table_name AND column_name = :column_name"
            ")"
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


def _constraint_exists(conn, constraint_name: str) -> bool:
    """Check if a constraint exists."""
    result = conn.execute(
        text(
            "SELECT EXISTS ("
            "  SELECT FROM information_schema.table_constraints "
            "  WHERE constraint_name = :constraint_name"
            ")"
        ),
        {"constraint_name": constraint_name},
    )
    return result.scalar()


def upgrade() -> None:
    """Add Google SSO columns and relax phone/password constraints."""
    conn = op.get_bind()

    # 1. Make phone_number nullable (was NOT NULL)
    op.alter_column("users", "phone_number", existing_type=sa.String(), nullable=True)

    # 2. Make password_hash nullable (was NOT NULL)
    op.alter_column("users", "password_hash", existing_type=sa.String(), nullable=True)

    # 3. Add auth_provider column
    if not _column_exists(conn, "users", "auth_provider"):
        op.add_column(
            "users",
            sa.Column("auth_provider", sa.String(), nullable=False, server_default="phone"),
        )

    # 4. Add google_id column
    if not _column_exists(conn, "users", "google_id"):
        op.add_column(
            "users",
            sa.Column("google_id", sa.String(), nullable=True),
        )

    # 5. Add unique index on google_id
    if not _index_exists(conn, "idx_users_google_id"):
        op.create_index(
            "idx_users_google_id", "users", ["google_id"], unique=True
        )

    # 6. Add unique index on email
    if not _index_exists(conn, "idx_users_email"):
        op.create_index(
            "idx_users_email", "users", ["email"], unique=True
        )


def downgrade() -> None:
    """Remove Google SSO columns and restore phone/password constraints."""
    conn = op.get_bind()

    if _index_exists(conn, "idx_users_email"):
        op.drop_index("idx_users_email", table_name="users")

    if _index_exists(conn, "idx_users_google_id"):
        op.drop_index("idx_users_google_id", table_name="users")

    if _column_exists(conn, "users", "google_id"):
        op.drop_column("users", "google_id")

    if _column_exists(conn, "users", "auth_provider"):
        op.drop_column("users", "auth_provider")

    op.alter_column("users", "password_hash", existing_type=sa.String(), nullable=False)
    op.alter_column("users", "phone_number", existing_type=sa.String(), nullable=False)
