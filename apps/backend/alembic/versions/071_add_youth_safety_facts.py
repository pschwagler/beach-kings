"""Add minimized youth-safety facts to registration and user accounts."""

import sqlalchemy as sa
from alembic import op

revision = "071"
down_revision = "070"
branch_labels = None
depends_on = None


def _fact_columns(table: str) -> None:
    op.add_column(table, sa.Column("age_group", sa.String(length=20)))
    op.add_column(table, sa.Column("eligibility_country", sa.String(length=2)))
    op.add_column(table, sa.Column("eligibility_region", sa.String(length=2)))
    op.add_column(table, sa.Column("age_assurance_source", sa.String(length=40)))
    op.add_column(table, sa.Column("age_declaration_source", sa.String(length=40)))
    op.add_column(table, sa.Column("guardian_consent", sa.Boolean()))
    op.add_column(table, sa.Column("age_assured_at", sa.DateTime(timezone=True)))


def upgrade() -> None:
    _fact_columns("users")
    _fact_columns("verification_codes")
    op.create_check_constraint(
        "ck_users_age_group", "users", "age_group IS NULL OR age_group IN ('junior', 'adult')"
    )
    op.create_index("idx_users_age_group", "users", ["age_group"])


def downgrade() -> None:
    op.drop_index("idx_users_age_group", table_name="users")
    op.drop_constraint("ck_users_age_group", "users", type_="check")
    for table in ("verification_codes", "users"):
        for column in (
            "age_assured_at", "guardian_consent", "age_declaration_source",
            "age_assurance_source", "eligibility_region", "eligibility_country", "age_group",
        ):
            op.drop_column(table, column)
