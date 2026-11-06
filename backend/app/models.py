"""Binding API shapes with bounded, fail-closed input validation."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Percent = Annotated[int, Field(strict=True, ge=0, le=100)]
Identifier = Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")]
Reason = Annotated[str, Field(min_length=1, max_length=500)]
Preset = Literal["nominal", "tool-loop", "prompt-injection", "unapproved-model", "pii"]
WorkflowStatus = Literal[
    "running", "awaiting_approval", "completed", "rejected", "blocked", "degraded", "failed"
]
Scalar = str | int | float | bool


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Weights(Model):
    service: Percent = 45
    cost: Percent = 20
    delay: Percent = 15
    co2: Percent = 10
    risk: Percent = 10

    @model_validator(mode="after")
    def sum_to_100(self) -> Self:
        if sum(self.model_dump().values()) != 100:
            raise ValueError("Weights must sum to 100")
        return self


class Policy(Model):
    revision: Annotated[int, Field(strict=True, ge=1)] = 1
    max_tool_calls: Annotated[int, Field(strict=True, ge=1, le=100)] = 10
    max_tokens: Annotated[int, Field(strict=True, ge=1, le=100_000)] = 25_000
    max_cost_eur: Annotated[float, Field(gt=0, le=100)] = 15.0
    approval_quantity: Annotated[int, Field(strict=True, ge=0, le=2500)] = 2500
    approval_cost_eur: Annotated[float, Field(ge=0, le=15_000)] = 15_000.0
    allowed_models: Annotated[list[Identifier], Field(max_length=20)] = ["synthetic-local-v1"]
    blocked_tools: Annotated[list[Identifier], Field(max_length=20)] = []

    @model_validator(mode="after")
    def unique_lists(self) -> Self:
        if len(set(self.allowed_models)) != len(self.allowed_models):
            raise ValueError("Duplicate model")
        if len(set(self.blocked_tools)) != len(self.blocked_tools):
            raise ValueError("Duplicate tool")
        return self


class Agent(Model):
    id: str
    name: str
    role: str
    owner: str
    version: str = "1.0.0"
    model: str = "synthetic-local-v1"
    status: Literal["active", "suspended"] = "active"
    tools: list[str]
    description: str


class Integration(Model):
    id: str
    name: str
    status: Literal["local", "configured", "not_connected"]
    description: str


class KnowledgeDocument(Model):
    id: str
    title: str
    content: str
    classification: str
    source: str
    version: str
    owner: str
    updated_at: str


class Scenario(Model):
    id: str
    name: str
    description: str
    service_pct: float
    cost_eur: float
    delay_days: int
    co2_kg: float
    risk: float
    score: float = 0
    quantity: int
    source_country: str
    eligible: bool = True
    constraint: str = ""


class Span(Model):
    span_id: str
    parent_span_id: str | None
    name: str
    agent_id: str | None
    started_at: str
    duration_ms: float = 0
    status: str = "running"
    attributes: dict[str, Scalar] = Field(default_factory=dict)


class AuditEvent(Model):
    id: str
    timestamp: str
    kind: str
    agent_id: str | None
    message: str
    decision: str
    trace_id: str


class Incident(Model):
    shipment_id: str = "SHP-PR-2048"
    product: str = "Premium Spirit 70cl"
    quantity: int = 12_000
    market: str = "France"
    delay_days: int = 7
    reason: str = "Synthetic port congestion"


class AgentRun(Model):
    agent_id: str
    status: Literal["pending", "running", "completed", "suspended", "blocked", "failed"] = "pending"
    summary: str = ""
    tokens: int = 0
    cost_eur: float = 0
    tool_calls: int = 0
    duration_ms: float = 0


class Approval(Model):
    status: Literal["pending", "approved", "rejected"] = "pending"
    scenario_id: str
    reason: str = ""
    decided_at: str | None = None


class Transfer(Model):
    id: str
    quantity: int
    source_country: str
    destination_country: str = "France"
    idempotency_key: str


class Metrics(Model):
    tokens: int = 0
    cost_eur: float = 0
    tool_calls: int = 0
    blocked_calls: int = 0
    duration_ms: float = 0


class Workflow(Model):
    id: str
    trace_id: str
    preset: Preset
    status: WorkflowStatus = "running"
    created_at: str
    updated_at: str
    policy_revision: int
    incident: Incident = Field(default_factory=Incident)
    agents: list[AgentRun]
    scenarios: list[Scenario] = Field(default_factory=list)
    recommended_scenario_id: str | None = None
    weights: Weights = Field(default_factory=Weights)
    citations: list[str] = Field(default_factory=list)
    spans: list[Span] = Field(default_factory=list)
    events: list[AuditEvent] = Field(default_factory=list)
    approval: Approval | None = None
    transfer: Transfer | None = None
    metrics: Metrics = Field(default_factory=Metrics)


class PresetInfo(Model):
    id: str
    name: str
    description: str


class PortfolioMetrics(Model):
    workflows: int
    total_cost_eur: float
    total_tokens: int
    blocked_calls: int


class Bootstrap(Model):
    mode: Literal["demo", "connected"]
    agents: list[Agent]
    policy: Policy
    integrations: list[Integration]
    knowledge: list[KnowledgeDocument]
    presets: list[PresetInfo]
    metrics: PortfolioMetrics


class StartRequest(Model):
    preset: Preset = "nominal"
    weights: Weights = Field(default_factory=Weights)


class RescoreRequest(Model):
    weights: Weights


class DecisionRequest(Model):
    decision: Literal["approve", "reject"]
    scenario_id: Identifier
    reason: Reason


class AgentStatusRequest(Model):
    status: Literal["active", "suspended"]
    reason: Reason


class SearchRequest(Model):
    query: Annotated[str, Field(min_length=1, max_length=300)]


class KnowledgeResults(Model):
    items: list[KnowledgeDocument]


class WorkflowPage(Model):
    items: list[Workflow]
    total: int
