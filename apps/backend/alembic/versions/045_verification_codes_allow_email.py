"""Allow email-based verification codes.

Makes ``verification_codes.phone_number`` nullable so email-only signup
and password-reset flows can persist codes keyed on the ``email`` column.
Also adds an index on ``email`` to speed up lookups.

Revision ID: 045
Revises: 044
"""

import sqlalchemy as sa
from alembic import op


revision = "045"
down_revision = "044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "verification_codes",
        "phone_number",
        existing_type=sa.String(),
        nullable=True,
    )
    op.create_index(
        "idx_verification_codes_email",
        "verification_codes",
        ["email"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_verification_codes_email", table_name="verification_codes")
    op.alter_column(
        "verification_codes",
        "phone_number",
        existing_type=sa.String(),
        nullable=False,
    )
