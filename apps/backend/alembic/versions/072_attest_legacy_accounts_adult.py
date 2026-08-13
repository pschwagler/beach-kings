"""Record the product owner's adult attestation for pre-gate accounts.

The product owner confirmed on 2026-08-12 that every account created before the
youth-safety gate belongs to an adult. This migration stores that broad fact
without deriving it from, reading, or retaining an exact birthdate.
"""

import sqlalchemy as sa
from alembic import op

revision = "072"
down_revision = "071"
branch_labels = None
depends_on = None

ATTESTATION_SOURCE = "product_owner_attested_legacy"


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE users
            SET age_group = 'adult',
                age_assurance_source = :source,
                age_declaration_source = :source,
                guardian_consent = false,
                age_assured_at = CURRENT_TIMESTAMP
            WHERE age_group IS NULL
              AND deleted_at IS NULL
            """
        ).bindparams(source=ATTESTATION_SOURCE)
    )


def downgrade() -> None:
    # The attestation is an audit fact. A downgrade must not silently erase it.
    pass
