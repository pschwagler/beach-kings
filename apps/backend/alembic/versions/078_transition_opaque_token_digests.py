"""Reserve the opaque-token digest transition revision.

Revision ID: 078
Revises: 077
"""

revision = "078"
down_revision = "077"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New tokens are stored as versioned, purpose-separated HMAC digests in
    # the existing token columns. Application reads temporarily accept both a
    # digest and an exact non-prefixed legacy value, allowing pre-deploy
    # sessions and reset links to expire naturally without rewriting bearer
    # data. A stored digest is never accepted as a bearer token.
    pass


def downgrade() -> None:
    # No schema or stored data changed in this revision. Tokens issued by the
    # digest-aware application require digest-aware code and will not validate
    # after rolling back to a version that only performs plaintext lookup.
    pass
