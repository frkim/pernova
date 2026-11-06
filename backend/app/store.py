"""SQLite workflow snapshots, settings and isolated stock ledgers.

Every mutation reloads under BEGIN IMMEDIATE; approvals, stock changes and
idempotency records commit together. Use one orchestrator process per database.
"""

import sqlite3
import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import TypeVar

from .fixtures import AGENTS, STOCK
from .models import Agent, Policy, PortfolioMetrics, Workflow

T = TypeVar("T")


def now() -> str:
    return datetime.now(UTC).isoformat()


class DomainError(Exception):
    def __init__(self, detail: str, status_code: int = 409) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


class Store:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("PRAGMA busy_timeout=5000")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY, created_at TEXT NOT NULL, body TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS inventory (
                workflow_id TEXT NOT NULL REFERENCES workflows(id), country TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK(quantity >= 2000),
                PRIMARY KEY(workflow_id, country)
            );
            CREATE TABLE IF NOT EXISTS transfers (
                workflow_id TEXT PRIMARY KEY REFERENCES workflows(id),
                idempotency_key TEXT UNIQUE NOT NULL, body TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS policy_history (
                revision INTEGER PRIMARY KEY, body TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS control_audit (
                id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL,
                kind TEXT NOT NULL, agent_id TEXT, summary TEXT NOT NULL
            );
        """)
        with self.transaction() as db:
            db.execute(
                "INSERT OR IGNORE INTO settings VALUES ('policy', ?)", (Policy().model_dump_json(),)
            )
            policy = self.policy()
            db.execute(
                "INSERT OR IGNORE INTO policy_history VALUES (?, ?)",
                (policy.revision, policy.model_dump_json()),
            )
            for agent in AGENTS:
                db.execute(
                    "INSERT OR IGNORE INTO settings VALUES (?, ?)",
                    (f"agent:{agent.id}", agent.model_dump_json()),
                )

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                yield self.db
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def close(self) -> None:
        self.db.close()

    def policy(self) -> Policy:
        with self.lock:
            row = self.db.execute("SELECT body FROM settings WHERE key='policy'").fetchone()
            return Policy.model_validate_json(row["body"])

    def agents(self) -> list[Agent]:
        with self.lock:
            rows = self.db.execute(
                "SELECT body FROM settings WHERE key LIKE 'agent:%' ORDER BY key"
            ).fetchall()
            return [Agent.model_validate_json(row["body"]) for row in rows]

    def agent(self, agent_id: str) -> Agent:
        agent = next((item for item in self.agents() if item.id == agent_id), None)
        if agent is None:
            raise DomainError("Agent not found", 404)
        return agent

    def insert(self, workflow: Workflow) -> None:
        with self.transaction() as db:
            db.execute(
                "INSERT INTO workflows VALUES (?, ?, ?)",
                (
                    workflow.id,
                    workflow.created_at,
                    workflow.model_dump_json(),
                ),
            )
            db.executemany(
                "INSERT INTO inventory VALUES (?, ?, ?)",
                [(workflow.id, country, quantity) for country, quantity in STOCK.items()],
            )

    def get(self, workflow_id: str) -> Workflow:
        with self.lock:
            row = self.db.execute(
                "SELECT body FROM workflows WHERE id=?", (workflow_id,)
            ).fetchone()
            if row is None:
                raise DomainError("Workflow not found", 404)
            return Workflow.model_validate_json(row["body"])

    def save(self, db: sqlite3.Connection, workflow: Workflow) -> None:
        workflow.updated_at = now()
        db.execute(
            "UPDATE workflows SET body=? WHERE id=?",
            (
                workflow.model_dump_json(),
                workflow.id,
            ),
        )

    def mutate(self, workflow_id: str, action: Callable[[Workflow, sqlite3.Connection], T]) -> T:
        with self.transaction() as db:
            workflow = self.get(workflow_id)
            result = action(workflow, db)
            self.save(db, workflow)
            return result

    def page(self, limit: int, offset: int) -> tuple[list[Workflow], int]:
        with self.lock:
            rows = self.db.execute(
                "SELECT body FROM workflows ORDER BY created_at DESC, id LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
            total = int(self.db.execute("SELECT COUNT(*) FROM workflows").fetchone()[0])
            return [Workflow.model_validate_json(row["body"]) for row in rows], total

    def metrics(self) -> PortfolioMetrics:
        with self.lock:
            row = self.db.execute("""
                SELECT COUNT(*) AS workflows,
                  COALESCE(SUM(json_extract(body, '$.metrics.cost_eur')), 0) AS cost,
                  COALESCE(SUM(json_extract(body, '$.metrics.tokens')), 0) AS tokens,
                  COALESCE(SUM(json_extract(body, '$.metrics.blocked_calls')), 0) AS blocked
                FROM workflows
            """).fetchone()
            return PortfolioMetrics(
                workflows=row["workflows"],
                total_cost_eur=round(row["cost"], 6),
                total_tokens=row["tokens"],
                blocked_calls=row["blocked"],
            )

    def all_unfinished(self) -> list[Workflow]:
        with self.lock:
            rows = self.db.execute(
                "SELECT body FROM workflows WHERE json_extract(body, '$.status') "
                "IN ('running', 'awaiting_approval')"
            ).fetchall()
            return [Workflow.model_validate_json(row["body"]) for row in rows]
