"""Add blocking and durable moderation workflow tables.

Revision ID: 060
Revises: 059

The migration is additive. Existing UGC is explicitly backfilled as visible.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "060"
down_revision = "059"
branch_labels = None
depends_on = None


VISIBILITY_CHECK = "moderation_visibility IN ('pending', 'visible', 'quarantined', 'removed')"


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_table(table: str) -> bool:
    return _inspector().has_table(table)


def _has_column(table: str, column: str) -> bool:
    return column in {item["name"] for item in _inspector().get_columns(table)}


def _has_index(table: str, index: str) -> bool:
    return index in {item["name"] for item in _inspector().get_indexes(table)}


def _create_index_if_missing(name: str, table: str, columns: list[str], **kwargs) -> None:
    if not _has_index(table, name):
        op.create_index(name, table, columns, **kwargs)


def _add_visibility(table: str) -> None:
    if not _has_column(table, "moderation_visibility"):
        op.add_column(
            table,
            sa.Column("moderation_visibility", sa.String(length=20), nullable=False, server_default="visible"),
        )
    check_name = f"ck_{table}_moderation_visibility"
    if check_name not in {item["name"] for item in _inspector().get_check_constraints(table)}:
        op.create_check_constraint(check_name, table, VISIBILITY_CHECK)
    _create_index_if_missing(f"idx_{table}_moderation_visibility", table, ["moderation_visibility"])


def upgrade() -> None:
    if not _has_table("user_blocks"):
        op.create_table(
        "user_blocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("blocker_player_id", sa.Integer(), sa.ForeignKey("players.id", ondelete="CASCADE"), nullable=False),
        sa.Column("blocked_player_id", sa.Integer(), sa.ForeignKey("players.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("blocker_player_id", "blocked_player_id", name="uq_user_blocks_pair"),
        sa.CheckConstraint("blocker_player_id <> blocked_player_id", name="ck_user_blocks_not_self"),
    )
    _create_index_if_missing("idx_user_blocks_blocked", "user_blocks", ["blocked_player_id", "blocker_player_id"])

    if not _has_table("interaction_restrictions"):
        op.create_table(
        "interaction_restrictions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("player_id", sa.Integer(), sa.ForeignKey("players.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("expires_at > starts_at", name="ck_interaction_restrictions_window"),
    )
    _create_index_if_missing("idx_interaction_restrictions_active", "interaction_restrictions", ["player_id", "expires_at"])

    if not _has_table("moderation_cases"):
        op.create_table(
        "moderation_cases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("target_type", sa.String(40), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("subject_player_id", sa.Integer(), sa.ForeignKey("players.id", ondelete="SET NULL")),
        sa.Column("state", sa.String(30), nullable=False, server_default="open"),
        sa.Column("severity", sa.String(20), nullable=False, server_default="ordinary"),
        sa.Column("junior_involved", sa.Boolean(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("legal_hold", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("current_action", sa.String(30)),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True)),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    _create_index_if_missing("idx_moderation_cases_queue", "moderation_cases", ["state", "severity", "due_at"])
    _create_index_if_missing("idx_moderation_cases_target", "moderation_cases", ["target_type", "target_id"])

    if not _has_table("moderation_reports"):
        op.create_table(
        "moderation_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("moderation_cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reporter_player_id", sa.Integer(), sa.ForeignKey("players.id", ondelete="SET NULL")),
        sa.Column("target_type", sa.String(40), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("details", sa.Text()),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    _create_index_if_missing("idx_moderation_reports_reporter", "moderation_reports", ["reporter_player_id", "created_at"])
    _create_index_if_missing("uq_moderation_reports_open_target", "moderation_reports", ["reporter_player_id", "target_type", "target_id"], unique=True, postgresql_where=sa.text("status = 'open'"))

    if not _has_table("moderation_events"):
        op.create_table(
        "moderation_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("moderation_cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("reason", sa.Text()),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    _create_index_if_missing("idx_moderation_events_case", "moderation_events", ["case_id", "created_at"])
    op.execute(
        """
        CREATE OR REPLACE FUNCTION protect_moderation_events() RETURNS trigger AS $$
        BEGIN
          IF TG_OP = 'UPDATE' THEN
            RAISE EXCEPTION 'moderation_events are append-only';
          END IF;
          IF OLD.created_at > now() - interval '1 year' THEN
            RAISE EXCEPTION 'moderation_events must be retained for one year';
          END IF;
          RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'moderation_events_append_only'
          ) THEN
            CREATE TRIGGER moderation_events_append_only
              BEFORE UPDATE OR DELETE ON moderation_events
              FOR EACH ROW EXECUTE FUNCTION protect_moderation_events();
          END IF;
        END;
        $$;
        """
    )

    if not _has_table("moderation_jobs"):
        op.create_table(
        "moderation_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("idempotency_key", sa.String(255), nullable=False, unique=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("moderation_cases.id", ondelete="CASCADE")),
        sa.Column("target_type", sa.String(40), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("claimed_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    _create_index_if_missing("idx_moderation_jobs_claim", "moderation_jobs", ["status", "available_at"])

    if not _has_table("moderation_evidence"):
        op.create_table(
        "moderation_evidence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("moderation_cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("object_key", sa.String(500), nullable=False, unique=True),
        sa.Column("content_type", sa.String(100)),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("purge_after", sa.DateTime(timezone=True)),
        sa.Column("purged_at", sa.DateTime(timezone=True)),
    )
    _create_index_if_missing("idx_moderation_evidence_purge", "moderation_evidence", ["purge_after", "purged_at"])

    if not _has_column("notifications", "actor_player_id"):
        op.add_column("notifications", sa.Column("actor_player_id", sa.Integer(), sa.ForeignKey("players.id", ondelete="SET NULL"), nullable=True))
    _create_index_if_missing("idx_notifications_actor", "notifications", ["actor_player_id"])
    for table in ("direct_messages", "league_messages", "court_reviews", "court_review_photos", "court_photos"):
        _add_visibility(table)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS moderation_events_append_only ON moderation_events")
    op.execute("DROP FUNCTION IF EXISTS protect_moderation_events()")
    for table in ("court_photos", "court_review_photos", "court_reviews", "league_messages", "direct_messages"):
        op.drop_index(f"idx_{table}_moderation_visibility", table_name=table)
        op.drop_constraint(f"ck_{table}_moderation_visibility", table, type_="check")
        op.drop_column(table, "moderation_visibility")
    op.drop_index("idx_notifications_actor", table_name="notifications")
    op.drop_column("notifications", "actor_player_id")
    for table in ("moderation_evidence", "moderation_jobs", "moderation_events", "moderation_reports", "moderation_cases", "interaction_restrictions", "user_blocks"):
        op.drop_table(table)
