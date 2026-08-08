"""Add graduated account enforcement and moderation appeals.

Revision ID: 063
Revises: 062
"""

import sqlalchemy as sa
from alembic import op


revision = "063"
down_revision = "062"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "moderation_status", sa.String(length=20), nullable=False, server_default="active"
        ),
    )
    op.add_column("users", sa.Column("moderation_expires_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("moderation_case_id", sa.Integer()))
    op.add_column("users", sa.Column("moderation_updated_at", sa.DateTime(timezone=True)))
    op.create_foreign_key(
        "fk_users_moderation_case_id",
        "users",
        "moderation_cases",
        ["moderation_case_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_users_moderation_status",
        "users",
        "moderation_status IN ('active', 'suspended', 'banned')",
    )
    op.create_index(
        "idx_users_moderation_status",
        "users",
        ["moderation_status", "moderation_expires_at"],
    )

    op.add_column("interaction_restrictions", sa.Column("case_id", sa.Integer()))
    op.add_column("interaction_restrictions", sa.Column("revoked_at", sa.DateTime(timezone=True)))
    op.create_foreign_key(
        "fk_interaction_restrictions_case_id",
        "interaction_restrictions",
        "moderation_cases",
        ["case_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Local development starts may run SQLAlchemy create_all before Alembic. In
    # that case this new table already exists even though the revision is still
    # 062; the additive columns above must still be migrated normally.
    inspector = sa.inspect(op.get_bind())
    appeals_table_exists = inspector.has_table("moderation_appeals")
    if not appeals_table_exists:
        op.create_table(
            "moderation_appeals",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "case_id",
                sa.Integer(),
                sa.ForeignKey("moderation_cases.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("player_id", sa.Integer(), sa.ForeignKey("players.id", ondelete="SET NULL")),
            sa.Column("statement", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
            sa.Column("resolution_reason", sa.Text()),
            sa.Column(
                "resolved_by_user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("resolved_at", sa.DateTime(timezone=True)),
            sa.CheckConstraint(
                "status IN ('open', 'granted', 'upheld')",
                name="ck_moderation_appeals_status",
            ),
        )

    existing_indexes = {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes("moderation_appeals")
    }
    if "idx_moderation_appeals_case" not in existing_indexes:
        op.create_index(
            "idx_moderation_appeals_case",
            "moderation_appeals",
            ["case_id", "created_at"],
        )
    if "uq_moderation_appeals_open_case_player" not in existing_indexes:
        op.create_index(
            "uq_moderation_appeals_open_case_player",
            "moderation_appeals",
            ["case_id", "player_id"],
            unique=True,
            postgresql_where=sa.text("status = 'open'"),
        )


def downgrade() -> None:
    op.drop_table("moderation_appeals")
    op.drop_constraint(
        "fk_interaction_restrictions_case_id", "interaction_restrictions", type_="foreignkey"
    )
    op.drop_column("interaction_restrictions", "revoked_at")
    op.drop_column("interaction_restrictions", "case_id")
    op.drop_index("idx_users_moderation_status", table_name="users")
    op.drop_constraint("ck_users_moderation_status", "users", type_="check")
    op.drop_constraint("fk_users_moderation_case_id", "users", type_="foreignkey")
    op.drop_column("users", "moderation_updated_at")
    op.drop_column("users", "moderation_case_id")
    op.drop_column("users", "moderation_expires_at")
    op.drop_column("users", "moderation_status")
