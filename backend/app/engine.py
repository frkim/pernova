"""Deterministic orchestration, policy enforcement and transactional execution."""

import asyncio
import sqlite3
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable
from contextlib import nullcontext
from typing import Literal
from uuid import uuid4

from opentelemetry import trace
from opentelemetry.context import Context

from .fixtures import (
    AGENTS,
    KNOWLEDGE,
    PRESETS,
    SAFETY_FLOOR,
    TERMINAL,
    TOOLS,
    scenarios,
    search,
)
from .inference import RESERVED_TOKENS, Inference
from .models import (
    AgentRun,
    Approval,
    AuditEvent,
    Bootstrap,
    DecisionRequest,
    Integration,
    Policy,
    StartRequest,
    Transfer,
    Weights,
    Workflow,
    WorkflowStatus,
)
from .store import DomainError, Store, now
from .telemetry import Telemetry


class Guardrail(DomainError):
    """A persisted policy denial; the attempted operation has no side effects."""


class Engine:
    def __init__(
        self,
        store: Store,
        mode: str = "demo",
        step_delay: float = 0.8,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        inference: Inference | None = None,
    ) -> None:
        self.store = store
        self.mode = mode
        self.step_delay = step_delay
        self.sleep = sleep
        self.telemetry = Telemetry(store)
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.rates: dict[str, deque[float]] = defaultdict(deque)
        self.model_rates: dict[str, deque[float]] = defaultdict(deque)
        self.errors: dict[str, int] = defaultdict(int)
        self.inference = inference

    def bootstrap(self) -> Bootstrap:
        integrations = [
            Integration(
                id="sap",
                name="SAP / Fabric simulator",
                status="local",
                description="Synthetic isolated per-workflow inventory; no business writes.",
            ),
            Integration(
                id="mcp",
                name="Controlled MCP gateway",
                status="local",
                description="Validated JSON-RPC, scoped tools, read-only operator context.",
            ),
            Integration(
                id="foundry",
                name="Microsoft Foundry / APIM inference",
                status="configured" if self.inference else "not_connected",
                description="Managed-identity APIM Responses configured, connectivity "
                "unverified; synthetic business data. Costs use configured EUR/token estimates."
                if self.inference
                else "Local deterministic synthetic fixtures only; no cloud inference.",
            ),
            Integration(
                id="apim",
                name="Azure API Management",
                status="configured" if self.inference else "not_connected",
                description="Enterprise gateway remains unverified. Caller gateway audience "
                "and downstream Foundry managed identity are distinct.",
            ),
            Integration(
                id="agent365",
                name="Agent 365 governance",
                status="not_connected",
                description="Tenant registration and access reviews required. Application "
                "suspension is not an Agent 365 native kill switch.",
            ),
            Integration(
                id="entra",
                name="Entra authentication",
                status="configured" if self.mode == "connected" else "not_connected",
                description="RS256 issuer/audience/signature/expiry/roles verification "
                "in connected mode; fixed loopback demo operator otherwise.",
            ),
            Integration(
                id="otel",
                name="OpenTelemetry SDK",
                status="local",
                description="Actual SDK spans match persisted trace and parent timeline.",
            ),
            Integration(
                id="monitor",
                name="Azure Monitor / OTLP",
                status="configured" if self.telemetry.export_configured else "not_connected",
                description="Azure Monitor or OTLP configuration is not evidence of ingestion "
                "or connectivity. Enterprise compliance remains unverified.",
            ),
        ]
        agents = self.store.agents()
        for agent in agents:
            if agent.id in {"intake", "demand", "inventory", "logistics"} and self.inference:
                agent.model = self.inference.model
        return Bootstrap(
            mode="connected" if self.mode == "connected" else "demo",
            agents=agents,
            policy=self.store.policy(),
            integrations=integrations,
            knowledge=KNOWLEDGE,
            presets=PRESETS,
            metrics=self.store.metrics(),
        )

    def event(
        self,
        wf: Workflow,
        kind: str,
        message: str,
        agent_id: str | None = None,
        decision: str = "observed",
    ) -> None:
        if len(wf.events) >= 1024:
            raise DomainError("Workflow audit limit reached; export and start a new case")
        wf.events.append(
            AuditEvent(
                id=uuid4().hex,
                timestamp=now(),
                kind=kind,
                agent_id=agent_id,
                message=message,
                decision=decision,
                trace_id=wf.trace_id,
            )
        )

    def recover(self) -> None:
        for wf in self.store.all_unfinished():
            if wf.status != "running":
                continue

            def interrupt(item: Workflow, _: sqlite3.Connection) -> None:
                item.status = "failed"
                for agent in item.agents:
                    if agent.status in {"running", "pending"}:
                        agent.status = "failed"
                        agent.summary = "Interrupted by orchestrator restart"
                for span in item.spans:
                    if span.status == "running":
                        span.status = "error"
                self.event(item, "recovery", "Interrupted running workflow failed closed")

            self.store.mutate(wf.id, interrupt)

    async def close(self) -> None:
        tasks = list(self.tasks.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if self.inference:
            await self.inference.close()
        self.telemetry.close()
        self.store.close()

    async def wait(self, workflow_id: str) -> Workflow:
        task = self.tasks.get(workflow_id)
        if task is not None:
            await task
        return self.store.get(workflow_id)

    def start(self, request: StartRequest, parent_context: Context | None = None) -> Workflow:
        if sum(not task.done() for task in self.tasks.values()) >= 8:
            raise DomainError("Concurrent workflow limit reached", 409)
        parent = trace.get_current_span(
            parent_context if parent_context is not None else Context()
        ).get_span_context()
        sdk = self.telemetry.root(parent_context)
        timestamp = now()
        wf = Workflow(
            id=uuid4().hex,
            trace_id=f"{sdk.get_span_context().trace_id:032x}",
            preset=request.preset,
            created_at=timestamp,
            updated_at=timestamp,
            policy_revision=self.store.policy().revision,
            weights=request.weights,
            agents=[AgentRun(agent_id=agent.id) for agent in AGENTS],
            spans=[
                self.telemetry.record(
                    sdk,
                    "workflow.supervisor",
                    "supervisor",
                    f"{parent.span_id:016x}" if parent.is_valid else None,
                )
            ],
        )
        self.event(
            wf, "workflow_started", "Synthetic isolated inventory case created", "supervisor"
        )
        self.store.insert(wf)
        task = asyncio.create_task(self.run(wf.id, sdk), name=f"workflow:{wf.id}")
        self.tasks[wf.id] = task
        task.add_done_callback(lambda _: self.tasks.pop(wf.id, None))
        return wf

    def deny(self, wf: Workflow, agent_id: str, message: str) -> None:
        wf.metrics.blocked_calls += 1
        agent = next(item for item in wf.agents if item.agent_id == agent_id)
        agent.status = "blocked"
        agent.summary = message
        self.event(wf, "guardrail", message, agent_id, "denied")

    def check(
        self, wf: Workflow, agent_id: str, operation: str, tokens: int, cost: float, is_tool: bool
    ) -> str | None:
        policy = self.store.policy()
        if wf.status not in {"running", "awaiting_approval"}:
            return "Workflow lifecycle does not permit execution"
        if wf.policy_revision != policy.revision:
            return "Policy revision changed; restart analysis"
        if self.store.agent("supervisor").status != "active":
            return "Supervisor suspended"
        agent = self.store.agent(agent_id)
        if agent.status != "active":
            return "Agent suspended"
        if self.errors[agent_id] >= 3:
            return "Circuit breaker open after three consecutive errors"
        if is_tool and (
            operation not in TOOLS[agent_id]
            or operation not in agent.tools
            or operation in policy.blocked_tools
        ):
            return "Tool not authorized for server-resolved agent scope"
        if not is_tool and operation not in policy.allowed_models:
            return "Model absent from approved allowlist"
        if not is_tool and operation not in {
            "synthetic-local-v1",
            self.inference.model if self.inference else "synthetic-local-v1",
        }:
            return "Model has no configured inference adapter"
        if wf.metrics.tokens + tokens > policy.max_tokens:
            return "Workflow token budget exhausted"
        if round(wf.metrics.cost_eur + cost, 6) > policy.max_cost_eur:
            return "Workflow cost budget exhausted"
        if is_tool and wf.metrics.tool_calls + 1 > policy.max_tool_calls:
            return "Workflow tool-call limit exhausted"
        timestamp = time.monotonic()
        queue = (self.rates if is_tool else self.model_rates)[agent_id]
        while queue and queue[0] <= timestamp - 30:
            queue.popleft()
        if len(queue) >= 10:
            return "Agent rate limit: 10 calls per operation kind per 30 seconds"
        return None

    def consume(
        self,
        workflow_id: str,
        agent_id: str,
        operation: str,
        is_tool: bool,
        parent: str | None = None,
        sensitive: bool = False,
        reservation: tuple[int, float] | None = None,
    ) -> None:
        tokens, cost = reservation or ((80, 0.005) if is_tool else (1200, 0.12))
        with self.telemetry.operation(
            workflow_id,
            f"{'tool' if is_tool else 'model'}.{operation}",
            agent_id,
            parent,
            {
                "data.synthetic": is_tool or self.inference is None,
                "usage.reserved_tokens": tokens,
                "usage.reserved_cost_eur": cost,
            },
        ):

            def reserve(wf: Workflow, _: sqlite3.Connection) -> str | None:
                denial = (
                    "Sensitive data egress blocked"
                    if sensitive
                    else self.check(
                        wf,
                        agent_id,
                        operation,
                        tokens,
                        cost,
                        is_tool,
                    )
                )
                if denial:
                    self.deny(wf, agent_id, denial)
                    return denial
                run = next(item for item in wf.agents if item.agent_id == agent_id)
                wf.metrics.tokens += tokens
                wf.metrics.cost_eur = round(wf.metrics.cost_eur + cost, 6)
                run.tokens += tokens
                run.cost_eur = round(run.cost_eur + cost, 6)
                if is_tool:
                    wf.metrics.tool_calls += 1
                    run.tool_calls += 1
                    self.rates[agent_id].append(time.monotonic())
                else:
                    self.model_rates[agent_id].append(time.monotonic())
                self.event(
                    wf,
                    "tool_call" if is_tool else "model_call",
                    f"{operation}: synthetic reservation accepted",
                    agent_id,
                    "allowed",
                )
                return None

            denial = self.store.mutate(workflow_id, reserve)
            if denial:
                self.errors[agent_id] += 1
                raise Guardrail(denial)

    async def model_summary(self, workflow_id: str, agent_id: str, facts: str, parent: str) -> str:
        if self.inference is None:
            self.consume(workflow_id, agent_id, "synthetic-local-v1", False, parent)
            return facts
        if self.store.get(workflow_id).preset != "nominal":
            self.consume(workflow_id, agent_id, "synthetic-local-v1", False, parent)
            return facts
        reserved_cost = round(RESERVED_TOKENS * self.inference.eur_per_token, 6)
        self.consume(
            workflow_id,
            agent_id,
            self.inference.model,
            False,
            parent,
            reservation=(RESERVED_TOKENS, reserved_cost),
        )
        with self.telemetry.operation(
            workflow_id,
            "inference.responses",
            agent_id,
            parent,
            {"model.deployment": self.inference.model, "business_data.synthetic": True},
        ) as sdk:
            try:
                result = await self.inference.summarize(agent_id, facts)
                if (
                    not 0 < result.tokens <= RESERVED_TOKENS
                    or not 0 <= result.cost_eur <= reserved_cost
                ):
                    raise DomainError("Inference usage exceeds reservation")
            except Exception as exc:
                self.errors[agent_id] += 1
                self.store.mutate(
                    workflow_id,
                    lambda wf, _: self.deny(
                        wf,
                        agent_id,
                        "Inference failed closed; reserved usage retained",
                    ),
                )
                raise Guardrail("Connected inference failed closed") from exc
            self.errors[agent_id] = 0
            sdk.set_attribute("gen_ai.usage.total_tokens", result.tokens)
            sdk.set_attribute("usage.estimated_cost_eur", result.cost_eur)

            def reconcile(wf: Workflow, _: sqlite3.Connection) -> None:
                run = next(a for a in wf.agents if a.agent_id == agent_id)
                wf.metrics.tokens -= RESERVED_TOKENS - result.tokens
                wf.metrics.cost_eur = round(
                    wf.metrics.cost_eur - reserved_cost + result.cost_eur, 6
                )
                run.tokens -= RESERVED_TOKENS - result.tokens
                run.cost_eur = round(run.cost_eur - reserved_cost + result.cost_eur, 6)
                self.event(
                    wf,
                    "inference_usage",
                    "Responses API actual token usage reconciled; cost is configured estimate",
                    agent_id,
                    "accounted",
                )

            self.store.mutate(workflow_id, reconcile)
            return result.summary

    def agent_state(
        self,
        workflow_id: str,
        agent_id: str,
        status: Literal["pending", "running", "completed", "suspended", "blocked", "failed"],
        summary: str = "",
        duration: float = 0,
    ) -> None:
        def update(wf: Workflow, _: sqlite3.Connection) -> None:
            run = next(item for item in wf.agents if item.agent_id == agent_id)
            run.status = status
            run.summary = summary
            run.duration_ms = round(duration, 3)

        self.store.mutate(workflow_id, update)

    async def analyze(self, workflow_id: str, agent_id: str) -> None:
        started = time.perf_counter()
        with self.telemetry.operation(workflow_id, f"agent.{agent_id}", agent_id) as sdk:
            parent = f"{sdk.get_span_context().span_id:016x}"
            self.agent_state(workflow_id, agent_id, "running", "Analyzing synthetic fixtures")
            await self.sleep(self.step_delay)
            preset = self.store.get(workflow_id).preset
            if agent_id == "logistics":
                if preset == "prompt-injection":
                    self.consume(workflow_id, agent_id, "create_stock_transfer", True, parent)
                if preset == "unapproved-model":
                    self.consume(workflow_id, agent_id, "unapproved-external-model", False, parent)
                if preset == "pii":
                    self.consume(
                        workflow_id, agent_id, "synthetic-local-v1", False, parent, sensitive=True
                    )
            tool, summary, query = {
                "intake": (
                    "get_shipment",
                    "12000 units delayed 7 days; France market exposed.",
                    "shipment disruption",
                ),
                "demand": (
                    "get_demand",
                    "Promotion 8500; priority 2000; standard 1500 units.",
                    "promotion priority France",
                ),
                "inventory": (
                    "get_inventory",
                    "Belgium 6500, France 3200, Spain 2800; floor 2000.",
                    "safety stock Belgium",
                ),
                "logistics": (
                    "simulate_route",
                    "Belgium road 2 days; expedited 1 day; wait 7 days.",
                    "Belgium road route",
                ),
            }[agent_id]
            repeats = 20 if agent_id == "logistics" and preset == "tool-loop" else 1
            for _ in range(repeats):
                self.consume(workflow_id, agent_id, tool, True, parent)
                await self.sleep(self.step_delay / 2)
                self.ensure_safe(workflow_id, agent_id)
            self.consume(workflow_id, agent_id, "search_knowledge", True, parent)
            documents = search(query, agent_id)

            def cite(wf: Workflow, _: sqlite3.Connection) -> None:
                for doc in documents:
                    if doc.id not in wf.citations:
                        wf.citations.append(doc.id)
                    self.event(
                        wf,
                        "citation",
                        f"Scoped curated citation: {doc.id} v{doc.version}",
                        agent_id,
                        "retrieved",
                    )

            self.store.mutate(workflow_id, cite)
            grounded = summary
            if self.inference and preset == "nominal":
                grounded += "\nScoped curated knowledge:\n" + "\n".join(
                    f"[{doc.id} v{doc.version}] {doc.content}" for doc in documents
                )
            summary = await self.model_summary(workflow_id, agent_id, grounded, parent)
            self.ensure_safe(workflow_id, agent_id)
            self.agent_state(
                workflow_id, agent_id, "completed", summary, (time.perf_counter() - started) * 1000
            )

    def ensure_safe(self, workflow_id: str, agent_id: str) -> None:
        wf = self.store.get(workflow_id)
        if wf.status != "running" or self.store.agent(agent_id).status != "active":
            raise Guardrail("Execution invalidated by lifecycle or suspended agent")
        if wf.policy_revision != self.store.policy().revision:
            raise Guardrail("Policy changed during execution")

    async def run(self, workflow_id: str, root: trace.Span) -> None:
        try:
            self.agent_state(
                workflow_id, "supervisor", "running", "Orchestrating intake and fan-out"
            )
            if self.store.agent("supervisor").status != "active":
                raise Guardrail("Supervisor suspended")
            await self.analyze(workflow_id, "intake")
            results = await asyncio.gather(
                *(
                    self.analyze(workflow_id, agent)
                    for agent in ("demand", "inventory", "logistics")
                ),
                return_exceptions=True,
            )
            for result in results:
                if isinstance(result, BaseException):
                    raise result
            self.ensure_safe(workflow_id, "scenario")
            with self.telemetry.operation(workflow_id, "scenario.score", "scenario"):
                self.consume(workflow_id, "scenario", "score_scenarios", True)
                await self.sleep(self.step_delay)

                def score(wf: Workflow, _: sqlite3.Connection) -> None:
                    wf.scenarios = scenarios(wf.weights)
                    self.recommend(wf)
                    wf.status = "awaiting_approval"
                    self.event(
                        wf,
                        "recommendation",
                        "Deterministic weighted recommendation prepared",
                        "scenario",
                    )

                self.store.mutate(workflow_id, score)
                self.agent_state(workflow_id, "scenario", "completed", "Weighted scoring completed")
            self.agent_state(
                workflow_id, "execution", "pending", "Waiting for a bound human decision"
            )
            self.agent_state(workflow_id, "supervisor", "completed", "Recommendation ready")
            with self.telemetry.operation(workflow_id, "approval.required", "execution"):

                def pending(wf: Workflow, _: sqlite3.Connection) -> None:
                    scenario = next(s for s in wf.scenarios if s.id == wf.recommended_scenario_id)
                    policy = self.store.policy()
                    mandatory = self.requires_approval(scenario.quantity, scenario.cost_eur, policy)
                    self.event(
                        wf,
                        "approval_gate",
                        "Sensitive transfer held before write"
                        if mandatory
                        else "Conservative demo gate: operator decision required",
                        "execution",
                        "approval_required",
                    )
                    if mandatory:
                        wf.metrics.blocked_calls += 1

                self.store.mutate(workflow_id, pending)
        except asyncio.CancelledError:
            self.fail(workflow_id, "Orchestration interrupted", failed=True)
            raise
        except Guardrail as exc:
            wf = self.store.get(workflow_id)
            if wf.preset == "tool-loop":
                self.set_agent_status(
                    "logistics", "suspended", "Automatic tool-loop circuit breaker"
                )
            self.fail(workflow_id, exc.detail)
        except Exception:
            self.fail(workflow_id, "Orchestration failed closed", failed=True)
        finally:
            self.telemetry.finish_root(workflow_id, root)

    def fail(self, workflow_id: str, message: str, failed: bool = False) -> None:
        def update(wf: Workflow, _: sqlite3.Connection) -> None:
            if wf.status in TERMINAL:
                return
            wf.status = "failed" if failed else "blocked"
            for agent in wf.agents:
                if agent.status in {"running", "pending"}:
                    agent.status = "failed" if failed else "blocked"
                    agent.summary = message
            self.event(wf, "workflow_stopped", message, "supervisor", "denied")

        self.store.mutate(workflow_id, update)

    @staticmethod
    def requires_approval(quantity: int, cost: float, policy: Policy) -> bool:
        return quantity > policy.approval_quantity or cost > policy.approval_cost_eur

    def recommend(self, wf: Workflow) -> None:
        eligible = [s for s in wf.scenarios if s.eligible]
        if not eligible:
            raise DomainError("No feasible scenario")
        wf.recommended_scenario_id = eligible[0].id
        wf.approval = Approval(scenario_id=eligible[0].id)

    def rescore(self, workflow_id: str, weights: Weights) -> Workflow:
        with self.telemetry.operation(workflow_id, "scenario.rescore", "scenario"):
            if self.store.get(workflow_id).status != "awaiting_approval":
                raise DomainError("Only pending workflows may be rescored")

            def update(wf: Workflow, _: sqlite3.Connection) -> None:
                if wf.status != "awaiting_approval":
                    raise DomainError("Only pending workflows may be rescored")
                if wf.policy_revision != self.store.policy().revision:
                    raise DomainError("Policy revision changed")
                if any(agent.status != "active" for agent in self.store.agents()):
                    raise DomainError("Suspended agent invalidates analysis")
                wf.weights = weights
                generation = int(wf.scenarios[0].id.rsplit("-", 1)[1]) + 1
                wf.scenarios = scenarios(weights, generation)
                self.recommend(wf)
                self.event(
                    wf,
                    "rescore",
                    "Scenarios revised; previous approval binding invalidated",
                    "scenario",
                )

            self.store.mutate(workflow_id, update)
        return self.store.get(workflow_id)

    def decision(
        self,
        workflow_id: str,
        request: DecisionRequest,
        actor_hash: str = "synthetic-test-operator",
    ) -> Workflow:
        with self.telemetry.operation(
            workflow_id,
            f"decision.{request.decision}",
            "execution",
            attributes={"auth.actor_hash": actor_hash, "auth.decision_role": "Approver"},
        ) as sdk:

            def decide(wf: Workflow, db: sqlite3.Connection) -> str | None:
                if wf.approval and wf.approval.status in {"approved", "rejected"}:
                    if wf.approval.scenario_id == request.scenario_id and wf.approval.status == (
                        "approved" if request.decision == "approve" else "rejected"
                    ):
                        return None
                    raise DomainError("Terminal decision cannot be changed")
                if wf.status != "awaiting_approval" or not wf.approval:
                    raise DomainError("Workflow is not awaiting a decision")
                if request.scenario_id != wf.approval.scenario_id:
                    raise DomainError("Decision does not match the current scenario revision")
                scenario = next((s for s in wf.scenarios if s.id == request.scenario_id), None)
                if scenario is None or not scenario.eligible:
                    raise DomainError("Scenario is not eligible")
                if wf.policy_revision != self.store.policy().revision:
                    raise DomainError("Policy revision changed")
                if any(agent.status != "active" for agent in self.store.agents()):
                    raise DomainError("Agent suspension invalidates execution")
                if request.decision == "approve" and scenario.quantity:
                    denial = self.check(wf, "execution", "create_stock_transfer", 80, 0.005, True)
                    if denial:
                        self.deny(wf, "execution", denial)
                        return denial
                    row = db.execute(
                        "SELECT quantity FROM inventory WHERE workflow_id=? AND country=?",
                        (wf.id, scenario.source_country),
                    ).fetchone()
                    if row is None or row["quantity"] - scenario.quantity < SAFETY_FLOOR:
                        raise DomainError("Stock floor would be breached")
                    transfer = Transfer(
                        id=uuid4().hex,
                        quantity=scenario.quantity,
                        source_country=scenario.source_country,
                        idempotency_key=f"{wf.id}:{scenario.id}:{wf.policy_revision}",
                    )
                    db.execute(
                        "UPDATE inventory SET quantity=quantity-? "
                        "WHERE workflow_id=? AND country=?",
                        (scenario.quantity, wf.id, scenario.source_country),
                    )
                    db.execute(
                        "UPDATE inventory SET quantity=quantity+? "
                        "WHERE workflow_id=? AND country='France'",
                        (scenario.quantity, wf.id),
                    )
                    db.execute(
                        "INSERT INTO transfers VALUES (?, ?, ?)",
                        (wf.id, transfer.idempotency_key, transfer.model_dump_json()),
                    )
                    wf.transfer = transfer
                    wf.metrics.tokens += 80
                    wf.metrics.cost_eur = round(wf.metrics.cost_eur + 0.005, 6)
                    wf.metrics.tool_calls += 1
                    self.rates["execution"].append(time.monotonic())
                    run = next(a for a in wf.agents if a.agent_id == "execution")
                    run.tokens += 80
                    run.cost_eur += 0.005
                    run.tool_calls += 1
                    self.event(
                        wf,
                        "stock_transfer",
                        "Atomic synthetic transfer committed; Belgian residual floor preserved",
                        "execution",
                        "allowed",
                    )
                wf.approval.status = "approved" if request.decision == "approve" else "rejected"
                wf.approval.reason = request.reason
                wf.approval.decided_at = now()
                wf.status = "completed" if request.decision == "approve" else "rejected"
                run = next(a for a in wf.agents if a.agent_id == "execution")
                run.status = "completed"
                run.summary = "Synthetic transfer committed" if wf.transfer else "Decision recorded"
                self.event(
                    wf,
                    "human_decision",
                    "Operator decision bound to scenario and policy",
                    "execution",
                    request.decision,
                )
                return None

            current = self.store.get(workflow_id)
            writes = (
                request.decision == "approve"
                and current.transfer is None
                and current.status == "awaiting_approval"
                and any(s.id == request.scenario_id and s.quantity for s in current.scenarios)
            )
            operation = (
                self.telemetry.operation(
                    workflow_id,
                    "tool.create_stock_transfer",
                    "execution",
                    parent=f"{sdk.get_span_context().span_id:016x}",
                    attributes={"data.synthetic": True, "transaction.atomic": True},
                )
                if writes
                else nullcontext()
            )
            with operation:
                denial = self.store.mutate(workflow_id, decide)
                if denial:
                    raise Guardrail(denial)
        return self.store.get(workflow_id)

    def set_policy(self, policy: Policy) -> Bootstrap:
        with self.store.transaction() as db:
            current = self.store.policy()
            if current.revision != policy.revision:
                raise DomainError("Policy revision conflict")
            updated = policy.model_copy(update={"revision": current.revision + 1})
            db.execute(
                "UPDATE settings SET body=? WHERE key='policy'", (updated.model_dump_json(),)
            )
            db.execute(
                "INSERT INTO policy_history VALUES (?, ?)",
                (updated.revision, updated.model_dump_json()),
            )
            db.execute(
                "INSERT INTO control_audit(timestamp,kind,summary) VALUES (?, 'policy', ?)",
                (now(), f"Policy revision {updated.revision} adopted"),
            )
            self.invalidate(db, "Policy revision changed; start a new analysis", "blocked")
        return self.bootstrap()

    def set_agent_status(self, agent_id: str, status: str, reason: str) -> Bootstrap:
        with self.store.transaction() as db:
            agent = self.store.agent(agent_id)
            if agent.status == status:
                return self.bootstrap()
            agent.status = "active" if status == "active" else "suspended"
            db.execute(
                "UPDATE settings SET body=? WHERE key=?",
                (agent.model_dump_json(), f"agent:{agent_id}"),
            )
            db.execute(
                "INSERT INTO control_audit(timestamp,kind,agent_id,summary) "
                "VALUES (?, 'agent_status', ?, ?)",
                (
                    now(),
                    agent_id,
                    f"Status {agent.status}; operator reason recorded in application",
                ),
            )
            if agent.status == "suspended":
                self.invalidate(db, "Agent suspended; start a new analysis", "degraded", agent_id)
            else:
                self.errors[agent_id] = 0
                self.rates[agent_id].clear()
                self.model_rates[agent_id].clear()
        return self.bootstrap()

    def invalidate(
        self,
        db: sqlite3.Connection,
        message: str,
        status: WorkflowStatus,
        agent_id: str | None = None,
    ) -> None:
        for wf in self.store.all_unfinished():
            wf.status = status
            if agent_id:
                run = next(item for item in wf.agents if item.agent_id == agent_id)
                run.status = "suspended"
                run.summary = message
            for run in wf.agents:
                if run.status in {"pending", "running"}:
                    run.status = "blocked"
                    run.summary = message
            sdk = self.telemetry.tracer.start_span(
                "governance.invalidate",
                context=self.telemetry.context(wf),
                attributes={"policy.revision": self.store.policy().revision},
            )
            local = self.telemetry.record(
                sdk,
                "governance.invalidate",
                agent_id,
                wf.spans[0].span_id,
                {"policy.revision": self.store.policy().revision},
            )
            local.status = "ok"
            sdk.end()
            wf.spans.append(local)
            self.event(wf, "execution_invalidated", message, agent_id, "denied")
            self.store.save(db, wf)
