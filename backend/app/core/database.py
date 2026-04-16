from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


engine: AsyncEngine = create_async_engine(settings.database_url, echo=settings.db_echo)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


if "sqlite" in settings.database_url:
    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_conn, _connection_record) -> None:  # type: ignore[no-untyped-def]
        """SQLite requires per-connection PRAGMA to honour ON DELETE / ON UPDATE.

        Without this, ``ondelete="CASCADE"`` / ``"SET NULL"`` declarations on
        foreign keys are silently ignored in dev, producing behaviour that
        diverges from the PostgreSQL production target.
        """
        cursor = dbapi_conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session

