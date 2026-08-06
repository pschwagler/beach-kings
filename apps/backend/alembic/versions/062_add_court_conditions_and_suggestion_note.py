"""Add court playing conditions and edit-suggestion context.

Revision ID: 062
Revises: 061

All new content columns are nullable so existing court data remains valid.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "062"
down_revision = "061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("courts", sa.Column("wind_exposure", sa.String(length=20), nullable=True))
    op.add_column("courts", sa.Column("wind_notes", sa.String(length=140), nullable=True))
    op.add_column("courts", sa.Column("sand_depth", sa.String(length=20), nullable=True))
    op.add_column("courts", sa.Column("sand_notes", sa.String(length=140), nullable=True))
    op.create_check_constraint(
        "ck_courts_wind_exposure",
        "courts",
        "wind_exposure IS NULL OR wind_exposure IN ('sheltered', 'mixed', 'exposed')",
    )
    op.create_check_constraint(
        "ck_courts_sand_depth",
        "courts",
        "sand_depth IS NULL OR sand_depth IN ('shallow', 'typical', 'deep')",
    )
    op.add_column(
        "court_edit_suggestions", sa.Column("note", sa.String(length=280), nullable=True)
    )
    op.add_column(
        "court_edit_suggestions",
        sa.Column("applied_changes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.drop_constraint(
        "ck_court_edit_suggestions_status", "court_edit_suggestions", type_="check"
    )
    op.create_check_constraint(
        "ck_court_edit_suggestions_status",
        "court_edit_suggestions",
        "status IN ('pending', 'approved', 'partially_applied', 'rejected')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_court_edit_suggestions_status", "court_edit_suggestions", type_="check"
    )
    op.execute(
        "UPDATE court_edit_suggestions SET status = 'approved' "
        "WHERE status = 'partially_applied'"
    )
    op.create_check_constraint(
        "ck_court_edit_suggestions_status",
        "court_edit_suggestions",
        "status IN ('pending', 'approved', 'rejected')",
    )
    op.drop_column("court_edit_suggestions", "applied_changes")
    op.drop_column("court_edit_suggestions", "note")
    op.drop_constraint("ck_courts_sand_depth", "courts", type_="check")
    op.drop_constraint("ck_courts_wind_exposure", "courts", type_="check")
    op.drop_column("courts", "sand_notes")
    op.drop_column("courts", "sand_depth")
    op.drop_column("courts", "wind_notes")
    op.drop_column("courts", "wind_exposure")
