from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


ROOT_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT_DIR / "data"
STATIC_DIR = ROOT_DIR / "apps" / "web" / "static"

DATA_DIR.mkdir(parents=True, exist_ok=True)


@dataclass(slots=True)
class Settings:
    app_name: str = "Lights Hub"
    api_prefix: str = "/api"
    default_timezone: str = "Asia/Qyzylorda"
    database_url: str = f"sqlite+aiosqlite:///{(DATA_DIR / 'lights_hub.db').as_posix()}"
    scheduler_poll_seconds: float = 1.0

    @property
    def tzinfo(self) -> ZoneInfo:
        return ZoneInfo(self.default_timezone)


settings = Settings()


engine = create_async_engine(settings.database_url, future=True)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

DAY_BITS = {
    "mon": 1 << 0,
    "tue": 1 << 1,
    "wed": 1 << 2,
    "thu": 1 << 3,
    "fri": 1 << 4,
    "sat": 1 << 5,
    "sun": 1 << 6,
}

DAY_PRESETS = {
    "everyday": sum(DAY_BITS.values()),
    "weekdays": DAY_BITS["mon"] | DAY_BITS["tue"] | DAY_BITS["wed"] | DAY_BITS["thu"] | DAY_BITS["fri"],
    "weekends": DAY_BITS["sat"] | DAY_BITS["sun"],
}


async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        yield session


async def init_db() -> None:
    from apps.api.app.models import Base

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

