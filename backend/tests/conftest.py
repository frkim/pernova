"""Tests own only backend/.test-data and await workflows without wall-clock delays."""

import shutil
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from backend.app.engine import Engine
from backend.app.store import Store


@pytest.fixture
def data_dir() -> Iterator[Path]:
    directory = Path(__file__).resolve().parents[1] / ".test-data" / uuid4().hex
    directory.mkdir(parents=True)
    try:
        yield directory
    finally:
        shutil.rmtree(directory)


@pytest.fixture
async def engine(data_dir: Path) -> AsyncIterator[Engine]:
    service = Engine(Store(data_dir / "test.sqlite3"), step_delay=0)
    yield service
    await service.close()
