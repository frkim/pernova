import sqlite3
from contextlib import closing
from pathlib import Path

import pytest
from backend.app.store import Store


@pytest.mark.parametrize("existing_database", [False, True])
def test_history_page_uses_sort_index_without_temporary_sort(
    data_dir: Path, existing_database: bool
) -> None:
    path = data_dir / "history.sqlite3"
    if existing_database:
        with closing(sqlite3.connect(path)) as previous:
            previous.execute(
                "CREATE TABLE workflows (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, "
                "body TEXT NOT NULL)"
            )
    for _ in range(2):
        store = Store(path)
        try:
            queries: list[str] = []
            store.db.set_trace_callback(queries.append)
            assert store.page(20, 0) == ([], 0)
            store.db.set_trace_callback(None)
            page_query = next(query for query in queries if query.startswith("SELECT body"))
            plan = store.db.execute(f"EXPLAIN QUERY PLAN {page_query}").fetchall()
            details = [row["detail"] for row in plan]
            assert any("USING INDEX workflows_created_at_id" in detail for detail in details)
            assert not any("TEMP B-TREE" in detail for detail in details)
        finally:
            store.close()
