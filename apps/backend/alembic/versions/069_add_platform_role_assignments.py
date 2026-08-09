"""Replace contact allowlists with auditable platform role assignments."""

from __future__ import annotations

import logging
import sqlalchemy as sa
from alembic import op
from backend.database.platform_role_migration import entries, resolve_legacy_admins

revision = "069"
down_revision = "068"
branch_labels = None
depends_on = None

logger = logging.getLogger(__name__)


def upgrade() -> None:
    op.create_table(
        "platform_role_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=40), nullable=False),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "granted_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("grant_source", sa.String(length=40), nullable=False),
        sa.Column("grant_reason", sa.String(length=500), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column(
            "revoked_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("revoke_source", sa.String(length=40)),
        sa.Column("revoke_reason", sa.String(length=500)),
        sa.CheckConstraint("role IN ('system_admin')", name="ck_platform_role_role"),
        sa.CheckConstraint(
            "(revoked_at IS NULL AND revoked_by_user_id IS NULL AND revoke_source IS NULL "
            "AND revoke_reason IS NULL) OR "
            "(revoked_at IS NOT NULL AND revoke_source IS NOT NULL AND revoke_reason IS NOT NULL)",
            name="ck_platform_role_revocation_metadata",
        ),
    )
    op.create_index(
        "idx_platform_role_user_history",
        "platform_role_assignments",
        ["user_id", "role", "granted_at"],
    )
    op.create_index(
        "idx_platform_role_active",
        "platform_role_assignments",
        ["role", "user_id", "revoked_at"],
    )
    op.create_index(
        "uq_platform_role_active_user_role",
        "platform_role_assignments",
        ["user_id", "role"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )

    connection = op.get_bind()
    settings = dict(
        connection.execute(
            sa.text(
                "SELECT key, value FROM settings "
                "WHERE key IN ('system_admin_phone_numbers', 'system_admin_emails')"
            )
        ).all()
    )
    configured_phones = entries(settings.get("system_admin_phone_numbers"))
    configured_emails = entries(settings.get("system_admin_emails"))
    if not configured_phones and not configured_emails:
        return

    users = connection.execute(sa.text("SELECT id, phone_number, email FROM users")).mappings()
    matched_ids, unmatched = resolve_legacy_admins(users, configured_phones, configured_emails)

    if not matched_ids:
        raise RuntimeError(
            "Legacy system-admin allowlists are configured but match no users; "
            f"unmatched identities: {', '.join(unmatched)}"
        )
    for user_id in sorted(matched_ids):
        connection.execute(
            sa.text(
                "INSERT INTO platform_role_assignments "
                "(user_id, role, grant_source, grant_reason) "
                "VALUES (:user_id, 'system_admin', 'legacy_allowlist_migration', "
                "'Migrated from legacy system-admin contact allowlist')"
            ),
            {"user_id": user_id},
        )
    if unmatched:
        logger.warning("Unmatched legacy system-admin identities: %s", ", ".join(unmatched))


def downgrade() -> None:
    op.drop_index("uq_platform_role_active_user_role", table_name="platform_role_assignments")
    op.drop_index("idx_platform_role_active", table_name="platform_role_assignments")
    op.drop_index("idx_platform_role_user_history", table_name="platform_role_assignments")
    op.drop_table("platform_role_assignments")
