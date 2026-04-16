"""Add ON DELETE CASCADE / SET NULL to all user-owned foreign keys.

Revision ID: t4u5v6w7x8y9
Revises: s3t4u5v6w7x8
Create Date: 2026-04-16

Tables with ``user_id``-style foreign keys previously lacked ondelete
policies, which meant deleting a user would either leave orphaned rows
(on SQLite, which does not enforce FKs by default) or fail with a
``ForeignKeyViolation`` on PostgreSQL. Both behaviours forced
``scheduler._delete_unverified_accounts`` to manually replicate the
semantics below. Codifying them at the database level removes that
source of drift.

Policy:
* CASCADE   - child row is meaningless without the owner (credits,
              sessions, tokens, outgoing shares).
* SET NULL  - record has audit or public-facing value even after the
              user is gone (audit logs, redemption history, public
              result shares, anonymised hub files, received shares).

SQLite cannot ALTER a foreign-key constraint in place, so the SQLite
path rebuilds each affected table (rename + recreate-from-metadata +
copy-data + drop-old). Data is preserved across the rebuild. The
PostgreSQL path issues direct ALTER CONSTRAINT statements.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "t4u5v6w7x8y9"
down_revision = "s3t4u5v6w7x8"
branch_labels = None
depends_on = None


_CASCADE_FKS: list[tuple[str, str]] = [
    ("credit_transactions", "user_id"),
    ("email_verification_tokens", "user_id"),
    ("password_reset_tokens", "user_id"),
    ("login_history", "user_id"),
    ("token_blacklist", "user_id"),
    ("user_credits", "user_id"),
    ("feedbacks", "user_id"),
    ("share_groups", "user_id"),
    ("share_links", "from_user_id"),
]

_SET_NULL_FKS: list[tuple[str, str]] = [
    ("user_files", "user_id"),
    ("processing_history", "user_id"),
    ("audit_logs", "user_id"),
    ("card_codes", "redeemed_by_user_id"),
    ("share_links", "to_user_id"),
    # result_share.user_id already has ondelete="SET NULL" from an earlier
    # migration, so it is omitted here.
]


def _pg_constraint_name(table: str, column: str) -> str:
    """PostgreSQL's default FK constraint name convention."""
    return f"{table}_{column}_fkey"


def _affected_tables_in_order() -> list[str]:
    """Deduplicated table list preserving declaration order.

    ``share_links`` has two user-FK columns, so it appears twice in the
    source lists; we only want to rebuild it once per pass.
    """
    seen: set[str] = set()
    ordered: list[str] = []
    for table_name, _col in _CASCADE_FKS + _SET_NULL_FKS:
        if table_name not in seen:
            seen.add(table_name)
            ordered.append(table_name)
    return ordered


def _rebuild_table_sqlite(bind: sa.engine.Connection, table_name: str) -> None:
    """Rebuild a single SQLite table so its FKs match ``Base.metadata``.

    Strategy: drop named indexes first (so they don't collide when the
    new table recreates them under the same names), rename the current
    table aside, let SQLAlchemy create a fresh table from the live model
    (which now declares ``ondelete=...``), copy data over, drop the
    staging copy.

    Importing ``Base`` at call time pulls every model definition so that
    ``Base.metadata.tables[table_name]`` reflects the most recent
    schema, including the new FK policies.
    """
    from app.models.base import Base  # late import: avoid loading models at module import time

    target = Base.metadata.tables.get(table_name)
    if target is None:
        raise RuntimeError(
            f"Cannot rebuild {table_name!r}: not present in Base.metadata"
        )

    inspector = sa.inspect(bind)
    existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
    shared = [c.name for c in target.columns if c.name in existing_cols]
    if not shared:
        raise RuntimeError(
            f"Cannot rebuild {table_name!r}: no overlapping columns with live model"
        )

    col_list = ", ".join(f'"{c}"' for c in shared)
    staging = f"_{table_name}_pre_cascade"

    # Drop any named indexes on the old table so that recreating them
    # on the new table (with the same names) doesn't hit a duplicate.
    # SQLite renames indexes along with the table, so without this step
    # the new CREATE INDEX would collide with the staging table's
    # still-live indexes.
    for idx in inspector.get_indexes(table_name):
        name = idx.get("name")
        if not name:
            continue
        op.execute(f'DROP INDEX IF EXISTS "{name}"')

    op.execute(f'ALTER TABLE "{table_name}" RENAME TO "{staging}"')
    target.create(bind)
    op.execute(
        f'INSERT INTO "{table_name}" ({col_list}) '
        f'SELECT {col_list} FROM "{staging}"'
    )
    op.execute(f'DROP TABLE "{staging}"')


def _upgrade_sqlite() -> None:
    bind = op.get_bind()
    # Disable FK enforcement for the duration of the rebuild. With PRAGMA
    # foreign_keys=ON (which our engine sets for every connection), the
    # temporary renamed tables would violate referential integrity for
    # any grandchild relationships.
    op.execute("PRAGMA foreign_keys=OFF")
    try:
        for table_name in _affected_tables_in_order():
            _rebuild_table_sqlite(bind, table_name)
    finally:
        op.execute("PRAGMA foreign_keys=ON")


def _upgrade_postgres() -> None:
    for table, column in _CASCADE_FKS:
        name = _pg_constraint_name(table, column)
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(
            name, table, "users", [column], ["id"], ondelete="CASCADE",
        )

    for table, column in _SET_NULL_FKS:
        name = _pg_constraint_name(table, column)
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(
            name, table, "users", [column], ["id"], ondelete="SET NULL",
        )


def upgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        _upgrade_postgres()
    elif dialect == "sqlite":
        _upgrade_sqlite()
    # Other dialects: leave as no-op. Add cases here if/when supported.


def downgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect != "postgresql":
        # SQLite downgrade would require another table rebuild with an
        # older model snapshot; we don't maintain that snapshot, so
        # downgrade is only supported on PostgreSQL.
        return

    for table, column in _CASCADE_FKS + _SET_NULL_FKS:
        name = _pg_constraint_name(table, column)
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(
            name, table, "users", [column], ["id"],
        )
