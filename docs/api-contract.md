# Application contract

The API is the source of truth. JSON keys use snake_case. Demo data and costs
are synthetic. Local mode is loopback-only; no production identity is simulated
as verified. All collection sizes are bounded, with paginated workflow history.

## Endpoints

- `GET /health/live`, `GET /health/ready`
- `GET /api/bootstrap` -> Bootstrap
- `POST /api/workflows` `{ "preset": "nominal" | "tool-loop" | "prompt-injection" | "unapproved-model" | "pii", "weights": Weights }` -> Workflow (202)
- `GET /api/workflows?limit=20&offset=0` -> `{items: Workflow[], total: number}`
- `GET /api/workflows/{id}` -> Workflow
- `GET /api/workflows/{id}/events` -> SSE `event: snapshot`, `data: Workflow`
  (polling is supported through GET as a fallback with explicit reconnect status)
- `POST /api/workflows/{id}/rescore` `{weights: Weights}` -> Workflow
- `POST /api/workflows/{id}/decision` `{decision: "approve" | "reject", scenario_id: string, reason: string}` -> Workflow
  (approval is bound to scenario and policy version; execution is idempotent)
- `POST /api/agents/{id}/status` `{status: "active" | "suspended", reason: string}` -> Bootstrap
- `PUT /api/policy` Policy -> Bootstrap (optimistic revision required)
- `POST /api/knowledge/search` `{query: string}` -> `{items: KnowledgeDocument[]}`
- `GET /api/workflows/{id}/export` -> JSON audit evidence attachment
- `POST /mcp` -> JSON-RPC initialize, tools/list, tools/call. Authenticated
  agent context is resolved server-side, never trusted from tool arguments.

Errors: `{detail: string, correlation_id: string}`; invalid inputs 422;
authorization 403; unavailable state/conflicts 409; missing resource 404.

## Identity and authorization

Demo mode authorizes only a loopback connection with an explicit local operator;
this is not an authenticated enterprise identity. Connected mode verifies signed
Entra JWTs for issuer, audience, expiry and granted application roles.

| Action | Required verified role in connected mode |
| --- | --- |
| Read workspace, traces, knowledge or audit | Reader, Operator, Approver, SecurityAdmin or Admin |
| Start analysis or rescore | Operator or Admin |
| Approve or reject | Approver or Admin |
| Update policy or suspend/resume agents | SecurityAdmin or Admin |
| Agent-scoped MCP tools | Agent plus server-side client-to-agent registration |

This is a single shared synthetic workspace, not a multitenant data service.
Approvals record a hash derived from the verified actor in the trace rather than
trusting a caller-supplied identity. Model inference uses a separate gateway
audience and managed identity; it cannot grant business-tool permissions.

## Shapes

```typescript
type Weights = {service: number; cost: number; delay: number; co2: number; risk: number};
// Integer percentages 0..100; sum must be 100.
type Policy = {
  revision: number; max_tool_calls: number; max_tokens: number;
  max_cost_eur: number; approval_quantity: number; approval_cost_eur: number;
  allowed_models: string[]; blocked_tools: string[];
};
type Agent = {
  id: string; name: string; role: string; owner: string; version: string;
  model: string; status: "active" | "suspended"; tools: string[];
  description: string;
};
type Integration = {
  id: string; name: string; status: "local" | "configured" | "not_connected";
  description: string; // configured does NOT imply live connectivity verified
};
type KnowledgeDocument = {
  id: string; title: string; content: string; classification: string;
  source: string; version: string; owner: string; updated_at: string;
};
type Bootstrap = {
  mode: "demo" | "connected"; agents: Agent[]; policy: Policy;
  integrations: Integration[]; knowledge: KnowledgeDocument[];
  presets: {id: string; name: string; description: string}[];
  metrics: {workflows: number; total_cost_eur: number; total_tokens: number; blocked_calls: number};
};
type Scenario = {
  id: string; name: string; description: string; service_pct: number;
  cost_eur: number; delay_days: number; co2_kg: number; risk: number;
  score: number; quantity: number; source_country: string;
  eligible: boolean; constraint: string;
};
type Span = {
  span_id: string; parent_span_id: string | null; name: string; agent_id: string | null;
  started_at: string; duration_ms: number; status: string; attributes: Record<string,string|number|boolean>;
};
type AuditEvent = {
  id: string; timestamp: string; kind: string; agent_id: string | null;
  message: string; decision: string; trace_id: string;
};
type Workflow = {
  id: string; trace_id: string; preset: string;
  status: "running" | "awaiting_approval" | "completed" | "rejected" | "blocked" | "degraded" | "failed";
  created_at: string; updated_at: string; policy_revision: number;
  incident: {shipment_id: string; product: string; quantity: number;
    market: string; delay_days: number; reason: string};
  agents: {agent_id: string; status: "pending" | "running" | "completed" | "suspended" | "blocked" | "failed";
    summary: string; tokens: number; cost_eur: number; tool_calls: number; duration_ms: number}[];
  scenarios: Scenario[]; recommended_scenario_id: string | null;
  weights: Weights; citations: string[]; spans: Span[]; events: AuditEvent[];
  approval: {status: "pending" | "approved" | "rejected"; scenario_id: string;
    reason: string; decided_at: string | null} | null;
  transfer: {id: string; quantity: number; source_country: string; destination_country: string;
    idempotency_key: string} | null;
  metrics: {tokens: number; cost_eur: number; tool_calls: number; blocked_calls: number; duration_ms: number};
};
```

## Domain invariants

The brief's proposed Belgian 4,000-unit transfer contradicts its 4,500-unit stock
and 2,000-unit safety floor. Use 6,500 synthetic Belgian units so the nominal
4,000-unit transfer is feasible, with a 2,500-unit residual. Stock floors, costs,
weights and authorization are deterministic, never entrusted to an LLM.
Approval is required for cross-country quantity >2,500 or cost >15,000 EUR.
Denied calls, model choices, citations, approval and execution share one trace.
Changes to policy or agent state invalidate unsafe pending executions.
Local knowledge retrieval is bounded lexical search over curated synthetic documents.
Agent 365 is an enterprise connection requirement, not a native kill-switch claim.
