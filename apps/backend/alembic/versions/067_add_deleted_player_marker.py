"""Add the persistent deleted-player tombstone and migrate legacy deletions."""

import sqlalchemy as sa
from alembic import op

revision = "067"
down_revision = "066"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("players", sa.Column("deleted_at", sa.DateTime(timezone=True)))
    op.create_index("idx_players_deleted_at", "players", ["deleted_at"])

    # Keep the player row so historical match foreign keys remain valid.
    op.execute(
        sa.text("""
        UPDATE players AS p SET deleted_at = u.deleted_at
        FROM users AS u
        WHERE p.user_id = u.id AND u.deleted_at IS NOT NULL
    """)
    )
    op.execute(
        sa.text("""
        UPDATE players SET
            full_name = 'Deleted Player', first_name = '', last_name = '',
            user_id = NULL, nickname = NULL, profile_picture_url = NULL,
            avatar = NULL, location_id = NULL, city = NULL, state = NULL,
            date_of_birth = NULL, gender = NULL, level = NULL, height = NULL,
            preferred_side = NULL, city_latitude = NULL, city_longitude = NULL,
            distance_to_location = NULL, "avp_playerProfileId" = NULL,
            status = NULL, created_by_player_id = NULL
        WHERE deleted_at IS NOT NULL
    """)
    )

    for table, columns in {
        "locations": ("created_by", "updated_by"),
        "courts": ("created_by", "updated_by"),
        "leagues": ("created_by", "updated_by"),
        "league_configs": ("created_by", "updated_by"),
        "league_members": ("created_by",),
        "seasons": ("created_by", "updated_by"),
        "sessions": ("created_by", "updated_by"),
        "matches": ("created_by", "updated_by"),
        "settings": ("updated_by",),
        "weekly_schedules": ("created_by", "updated_by"),
        "signups": ("created_by", "updated_by"),
        "signup_events": ("created_by",),
        "session_participants": ("invited_by",),
        "player_invites": ("created_by_player_id",),
        "league_invites": ("invited_by_player_id",),
        "court_photos": ("uploaded_by",),
        "court_edit_suggestions": ("reviewed_by",),
        "friends": ("created_by",),
        "kob_tournaments": ("director_player_id",),
    }.items():
        for column in columns:
            op.execute(
                sa.text(
                    f"UPDATE {table} SET {column} = NULL WHERE {column} IN "
                    "(SELECT id FROM players WHERE deleted_at IS NOT NULL)"
                )
            )

    for table in (
        "court_check_ins",
        "kob_players",
        "league_invites",
        "player_invites",
        "player_home_courts",
        "season_awards",
    ):
        op.execute(
            sa.text(
                f"DELETE FROM {table} WHERE player_id IN "
                "(SELECT id FROM players WHERE deleted_at IS NOT NULL)"
            )
        )
    op.execute(
        sa.text("""
        DELETE FROM user_blocks
        WHERE blocker_player_id IN (SELECT id FROM players WHERE deleted_at IS NOT NULL)
           OR blocked_player_id IN (SELECT id FROM players WHERE deleted_at IS NOT NULL)
    """)
    )
    op.execute(
        sa.text("""
        DELETE FROM notifications
        WHERE actor_player_id IN (SELECT id FROM players WHERE deleted_at IS NOT NULL)
    """)
    )


def downgrade() -> None:
    op.drop_index("idx_players_deleted_at", table_name="players")
    op.drop_column("players", "deleted_at")
