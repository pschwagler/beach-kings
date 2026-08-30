"""Reserve the league creator metadata migration revision.

Revision ID: 077
Revises: 076
"""


revision = "077"
down_revision = "076"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Historical creator identity cannot be inferred safely: the original
    # creator may have left or lost admin status. New leagues persist the true
    # creator at creation time; legacy leagues remain unlabeled when unknown.
    pass


def downgrade() -> None:
    pass
