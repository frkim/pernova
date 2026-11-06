import asyncio
import sqlite3
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from backend.app.engine import Engine, Guardrail
from backend.app.fixtures import SAFETY_FLOOR, scenarios, search
from backend.app.inference import InferenceResult
from backend.app.models import DecisionRequest, Policy, StartRequest, Weights, Workflow
from backend.app.store import DomainError, Store
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic import ValidationError


def decision(wf: Workflow, action: str = "approve") -> DecisionRequest:
    return DecisionRequest(
        decision=action,
        scenario_id=wf.recommended_scenario_id,
        reason="Synthetic operator review",
    )


async def nominal(engine: Engine) -> Workflow:
    started = engine.start(StartRequest())
    return await engine.wait(started.id)


@pytest.mark.parametrize("failure_source", ["inference", "telemetry"])
async def test_shutdown_always_closes_database(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch, failure_source: str
) -> None:
    service = Engine(Store(data_dir / "cleanup.sqlite3"), step_delay=0)
    if failure_source == "inference":
        inference = AsyncMock()
        inference.close.side_effect = RuntimeError("cleanup failed")
        service.inference = inference
    else:
        original_close = service.telemetry.close

        def failing_close() -> None:
            original_close()
            raise RuntimeError("cleanup failed")

        monkeypatch.setattr(service.telemetry, "close", failing_close)
    with pytest.raises(RuntimeError, match="cleanup failed"):
        await service.close()
    with pytest.raises(sqlite3.ProgrammingError, match="closed"):
        service.store.db.execute("SELECT 1")


async def test_nominal_atomic_approval_and_actual_otel(engine: Engine) -> None:
    exporter = InMemorySpanExporter()
    engine.telemetry.provider.add_span_processor(SimpleSpanProcessor(exporter))
    workflow = await nominal(engine)
    assert workflow.status == "awaiting_approval"
    assert workflow.recommended_scenario_id.startswith("belgium-")
    assert len(workflow.citations) == 4
    assert all(span.status != "running" for span in workflow.spans)
    assert workflow.metrics.tool_calls == 9
    assert workflow.metrics.cost_eur > 0
    assert workflow.approval.status == "pending"
    assert workflow.transfer is None
    approved = engine.decision(workflow.id, decision(workflow))
    assert approved.status == "completed"
    assert approved.transfer.quantity == 4000
    assert approved.transfer.source_country == "Belgium"
    row = engine.store.db.execute(
        "SELECT quantity FROM inventory WHERE workflow_id=? AND country='Belgium'",
        (workflow.id,),
    ).fetchone()
    assert row["quantity"] == 2500 >= SAFETY_FLOOR
    repeated = engine.decision(workflow.id, decision(workflow))
    assert repeated.transfer == approved.transfer
    assert repeated.metrics.tokens == approved.metrics.tokens
    assert repeated.metrics.tool_calls == 10
    assert engine.store.db.execute("SELECT COUNT(*) FROM transfers").fetchone()[0] == 1
    real = exporter.get_finished_spans()
    assert len(real) == len(repeated.spans)
    assert all(f"{span.context.trace_id:032x}" == workflow.trace_id for span in real)
    stored = {span.span_id: span for span in repeated.spans}
    for span in real:
        entry = stored[f"{span.context.span_id:016x}"]
        assert entry.parent_span_id == (f"{span.parent.span_id:016x}" if span.parent else None)
    assert all(event.trace_id == workflow.trace_id for event in repeated.events)
    with pytest.raises(DomainError):
        engine.rescore(workflow.id, Weights())
    with pytest.raises(DomainError):
        engine.decision(workflow.id, decision(workflow, "reject"))


async def test_parallel_agents_observable_without_real_sleeps(engine: Engine) -> None:
    entered: set[str] = set()
    rendezvous = asyncio.Event()
    original = engine.model_summary

    async def summarize(workflow_id: str, agent_id: str, facts: str, parent: str) -> str:
        if agent_id != "intake":
            entered.add(agent_id)
            snapshot = engine.store.get(workflow_id)
            assert next(a for a in snapshot.agents if a.agent_id == agent_id).status == "running"
            if len(entered) == 3:
                rendezvous.set()
            await asyncio.wait_for(rendezvous.wait(), 2)
        return await original(workflow_id, agent_id, facts, parent)

    engine.model_summary = summarize
    workflow = await nominal(engine)
    assert entered == {"demand", "inventory", "logistics"}
    assert workflow.status == "awaiting_approval"


async def test_rejection_is_terminal_and_idempotent(engine: Engine) -> None:
    workflow = await nominal(engine)
    rejected = engine.decision(workflow.id, decision(workflow, "reject"))
    assert rejected.status == "rejected" and rejected.transfer is None
    assert engine.decision(workflow.id, decision(workflow, "reject")).status == "rejected"
    with pytest.raises(DomainError):
        engine.decision(workflow.id, decision(workflow))
    with pytest.raises(DomainError):
        engine.rescore(workflow.id, Weights())


async def test_rescore_changes_binding_and_weights(engine: Engine) -> None:
    workflow = await nominal(engine)
    weights = Weights(service=100, cost=0, delay=0, co2=0, risk=0)
    rescored = engine.rescore(workflow.id, weights)
    assert rescored.recommended_scenario_id.startswith("expedite-")
    assert rescored.recommended_scenario_id != workflow.recommended_scenario_id
    assert rescored.weights == weights
    with pytest.raises(DomainError, match="revision"):
        engine.decision(workflow.id, decision(workflow))
    approved = engine.decision(workflow.id, decision(rescored))
    assert approved.status == "completed" and approved.transfer.quantity == 4500


@pytest.mark.parametrize("preset", ["tool-loop", "prompt-injection", "unapproved-model", "pii"])
async def test_malicious_presets_fail_closed(engine: Engine, preset: str) -> None:
    started = engine.start(StartRequest(preset=preset))
    workflow = await engine.wait(started.id)
    assert workflow.status in {"blocked", "degraded"}
    assert workflow.metrics.blocked_calls >= 1
    assert workflow.metrics.tool_calls <= engine.store.policy().max_tool_calls
    assert workflow.transfer is None and workflow.approval is None
    assert all(s.status != "running" for s in workflow.spans)
    if preset == "tool-loop":
        assert engine.store.agent("logistics").status == "suspended"
    with pytest.raises(DomainError):
        engine.decision(
            workflow.id,
            DecisionRequest(
                decision="approve",
                scenario_id="belgium-1",
                reason="Denied case",
            ),
        )


@pytest.mark.parametrize(
    "field,value",
    [
        ("max_cost_eur", 0.1),
        ("max_tokens", 1200),
        ("max_tool_calls", 1),
        ("allowed_models", []),
        ("blocked_tools", ["get_inventory"]),
    ],
)
async def test_limits_enforced_before_calls(engine: Engine, field: str, value: object) -> None:
    values = engine.store.policy().model_dump()
    values[field] = value
    policy = Policy.model_validate(values)
    engine.set_policy(policy)
    workflow = await nominal(engine)
    assert workflow.status == "blocked"
    assert workflow.metrics.cost_eur <= policy.max_cost_eur
    assert workflow.metrics.tokens <= policy.max_tokens
    assert workflow.metrics.tool_calls <= policy.max_tool_calls
    assert workflow.transfer is None


async def test_policy_optimistic_revision_and_invalidation(engine: Engine) -> None:
    workflow = await nominal(engine)
    old = engine.store.policy()
    bootstrap = engine.set_policy(old)
    assert bootstrap.policy.revision == old.revision + 1
    with pytest.raises(DomainError, match="conflict"):
        engine.set_policy(old)
    assert engine.store.get(workflow.id).status == "blocked"
    with pytest.raises(DomainError):
        engine.decision(workflow.id, decision(workflow))


async def test_suspend_resume_does_not_revalidate_pending_execution(engine: Engine) -> None:
    workflow = await nominal(engine)
    engine.set_agent_status("inventory", "suspended", "Synthetic emergency stop")
    assert engine.store.get(workflow.id).status == "degraded"
    engine.set_agent_status("inventory", "active", "Reviewed")
    with pytest.raises(DomainError):
        engine.decision(workflow.id, decision(workflow))
    new = await nominal(engine)
    assert new.status == "awaiting_approval"


async def test_suspended_agent_blocks_new_workflows(engine: Engine) -> None:
    engine.set_agent_status("inventory", "suspended", "Safety check")
    workflow = await nominal(engine)
    assert workflow.status == "blocked" and workflow.transfer is None


async def test_atomic_floor_and_concurrent_idempotency(engine: Engine) -> None:
    workflow = await nominal(engine)

    def corrupt(wf: Workflow, _: object) -> None:
        next(s for s in wf.scenarios if s.id == wf.recommended_scenario_id).quantity = 5000

    engine.store.mutate(workflow.id, corrupt)
    with pytest.raises(DomainError, match="floor"):
        engine.decision(workflow.id, decision(workflow))
    assert engine.store.get(workflow.id).transfer is None
    assert engine.store.db.execute("SELECT COUNT(*) FROM transfers").fetchone()[0] == 0

    def restore(wf: Workflow, _: object) -> None:
        next(s for s in wf.scenarios if s.id == wf.recommended_scenario_id).quantity = 4000

    engine.store.mutate(workflow.id, restore)
    results = await asyncio.gather(
        *(asyncio.to_thread(engine.decision, workflow.id, decision(workflow)) for _ in range(3))
    )
    assert len({result.transfer.id for result in results}) == 1


async def test_persistence_reload_and_interrupted_recovery(data_dir: Path) -> None:
    path = data_dir / "persist.sqlite3"
    first = Engine(Store(path), step_delay=0)
    pending = await nominal(first)
    first.set_agent_status("inventory", "suspended", "Persistent status")
    policy = first.store.policy()
    first.set_policy(policy)
    first.store.mutate(pending.id, lambda wf, _: setattr(wf, "status", "running"))
    first.telemetry.close()
    first.store.close()
    second = Engine(Store(path), step_delay=0)
    try:
        second.recover()
        assert second.store.get(pending.id).status == "failed"
        assert second.store.policy().revision == 2
        assert second.store.agent("inventory").status == "suspended"
        assert any(event.kind == "recovery" for event in second.store.get(pending.id).events)
    finally:
        await second.close()


async def test_approved_transfer_survives_restart_without_double_write(data_dir: Path) -> None:
    path = data_dir / "approved.sqlite3"
    first = Engine(Store(path), step_delay=0)
    pending = await nominal(first)
    approved = first.decision(pending.id, decision(pending))
    await first.close()
    second = Engine(Store(path), step_delay=0)
    try:
        second.recover()
        repeated = second.decision(pending.id, decision(pending))
        assert repeated.status == "completed"
        assert repeated.transfer == approved.transfer
        assert repeated.metrics == approved.metrics
        assert second.store.db.execute("SELECT COUNT(*) FROM transfers").fetchone()[0] == 1
        assert (
            second.store.db.execute(
                "SELECT quantity FROM inventory WHERE workflow_id=? AND country='Belgium'",
                (pending.id,),
            ).fetchone()[0]
            == 2500
        )
    finally:
        await second.close()


@pytest.mark.parametrize(
    "quantity,cost,expected",
    [
        (2500, 15000, False),
        (2501, 15000, True),
        (2500, 15000.01, True),
        (0, 0, False),
    ],
)
def test_approval_strict_boundaries(quantity: int, cost: float, expected: bool) -> None:
    assert Engine.requires_approval(quantity, cost, Policy()) is expected


@pytest.mark.parametrize(
    "weights",
    [
        {"service": 44},
        {"service": -1},
        {"service": 101},
        {"service": 45.5},
        {"service": True},
    ],
)
def test_weights_fail_closed(weights: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        Weights.model_validate(weights)


def test_scoring_and_scoped_knowledge() -> None:
    assert scenarios(Weights())[0].id.startswith("belgium")
    assert search("Belgium safety stock", "inventory")[0].id == "stock-policy"
    assert not search("Belgium stock", "intake")
    assert not search("stock", "forged-agent")
    assert len(search("synthetic", "operator")) <= 5


async def test_server_agent_tool_authorization_and_circuit(engine: Engine) -> None:
    workflow = engine.start(StartRequest())
    for _ in range(3):
        with pytest.raises(Guardrail, match="authorized"):
            engine.consume(workflow.id, "logistics", "create_stock_transfer", True)
    with pytest.raises(Guardrail, match="Circuit"):
        engine.consume(workflow.id, "logistics", "simulate_route", True)
    await engine.wait(workflow.id)
    assert engine.store.get(workflow.id).transfer is None


class FakeInference:
    model = "approved-deployment"
    eur_per_token = 0.0001

    def __init__(self, fail: bool = False) -> None:
        self.calls: list[str] = []
        self.fail = fail

    async def summarize(self, agent_id: str, facts: str) -> InferenceResult:
        self.calls.append(agent_id)
        if self.fail:
            raise DomainError("Synthetic provider failure")
        return InferenceResult(summary=f"Connected synthetic {facts}", tokens=100, cost_eur=0.01)

    async def close(self) -> None:
        pass


async def test_connected_adapter_actual_usage_allowlist_and_failure(engine: Engine) -> None:
    inference = FakeInference()
    engine.inference = inference
    denied = await nominal(engine)
    assert denied.status == "blocked" and not inference.calls
    engine.set_policy(Policy(allowed_models=["synthetic-local-v1", inference.model]))
    workflow = await nominal(engine)
    assert workflow.status == "awaiting_approval"
    assert set(inference.calls) == {"intake", "demand", "inventory", "logistics"}
    assert workflow.metrics.tokens == 400 + 9 * 80
    assert workflow.metrics.cost_eur == pytest.approx(0.04 + 9 * 0.005)
    foundry = next(i for i in engine.bootstrap().integrations if i.id == "foundry")
    assert foundry.status == "configured"
    assert "unverified" in foundry.description
    engine.inference = FakeInference(fail=True)
    failed = await nominal(engine)
    assert failed.status == "blocked" and failed.transfer is None
    assert any("reserved usage retained" in e.message for e in failed.events)
