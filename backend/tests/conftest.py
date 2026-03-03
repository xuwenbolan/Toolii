from __future__ import annotations

from pathlib import Path
from typing import AsyncIterator, Callable

import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core import database as database_module
from app.core.config import settings
from app.core.rate_limiter import limiter
from app.core.security import create_access_token, hash_password
from app.services import tool_service
from app.main import create_app
from app.models.base import Base
from app.models.user import User
from app.models.user_credit import UserCredit


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
def reset_rate_limiter_state() -> None:
    limiter.reset()
    tool_service.invalidate_cache()


@pytest_asyncio.fixture()
async def test_engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture()
def session_factory(test_engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch):
    factory = async_sessionmaker(test_engine, expire_on_commit=False)
    monkeypatch.setattr(database_module, "engine", test_engine)
    monkeypatch.setattr(database_module, "SessionLocal", factory)
    return factory


@pytest_asyncio.fixture()
async def db_session(session_factory) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture()
async def app_instance(
    session_factory,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator:
    import app.main as app_main
    import app.core.task_limiter as task_limiter

    monkeypatch.setattr(settings, "file_storage_dir", str(tmp_path / "files"))
    monkeypatch.setattr(app_main, "SessionLocal", session_factory)
    monkeypatch.setattr(app_main, "prewarm_background_models", lambda *_a, **_k: {})
    monkeypatch.setattr(app_main, "prewarm_face_landmarker", lambda *_a, **_k: None)
    monkeypatch.setattr(app_main, "setup_scheduler", lambda *_a, **_k: None)
    monkeypatch.setattr(app_main.scheduler, "start", lambda *_a, **_k: None)
    monkeypatch.setattr(app_main.scheduler, "shutdown", lambda *_a, **_k: None)
    task_limiter._semaphores.clear()

    app = create_app()
    await app.router.startup()
    try:
        yield app
    finally:
        await app.router.shutdown()


@pytest_asyncio.fixture()
async def async_client(app_instance) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app_instance)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


def _fixture_bytes(name: str) -> bytes:
    return (Path(__file__).resolve().parent / "fixtures" / name).read_bytes()


@pytest.fixture()
def sample_image_bytes() -> bytes:
    return _fixture_bytes("sample.jpg")


@pytest.fixture()
def sample_face_image_bytes() -> bytes:
    return _fixture_bytes("sample_face.jpg")


@pytest.fixture()
def sample_heic_bytes() -> bytes:
    return _fixture_bytes("sample.heic")


@pytest.fixture()
def sample_pdf_bytes() -> bytes:
    return _fixture_bytes("sample.pdf")


@pytest_asyncio.fixture()
async def create_user(session_factory) -> AsyncIterator[Callable[..., object]]:
    async def _create_user(*, email: str, balance: int = 0, password: str = "password123", email_verified: bool = True) -> User:
        async with session_factory() as db:
            user = User(email=email, hashed_password=hash_password(password), is_active=True, email_verified=email_verified)
            db.add(user)
            await db.flush()
            db.add(UserCredit(user_id=user.id, balance=balance))
            await db.commit()
            await db.refresh(user)
            return user

    yield _create_user


@pytest_asyncio.fixture()
async def auth_headers(create_user) -> AsyncIterator[Callable[..., object]]:
    async def _headers(*, email: str, balance: int = 0) -> dict[str, str]:
        user = await create_user(email=email, balance=balance)
        token, _ = create_access_token(user_id=user.id)
        return {"Authorization": f"Bearer {token}"}

    yield _headers
