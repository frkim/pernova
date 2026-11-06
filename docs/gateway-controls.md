# Gateway, MCP, model and knowledge controls

Authoritative sources and research date are in [Microsoft guidance](microsoft-guidance.md).
Policies under `infra/policies/` are **templates**, not proof of live enforcement.
Local `/mcp` is the backend's bounded JSON-RPC facade, **not a connected SAP,
Fabric, Agent 365 Work IQ or APIM-native MCP server**.

## Three different enforcement boundaries

1. **Application**: resolve agent from a validated caller in connected mode or a
   server-owned fixture context in loopback demo mode. Enforce per-agent tools,
   active/suspended state, blocked-tools policy, argument schemas, stock/country
   constraints, approval, policy revision, token/call/cost budgets and idempotency
   before each call/side effect. Recheck after approval and before execution.
   An LLM recommendation cannot authorize a write.
2. **APIM template**: Entra v2 caller, exact audience, role and client checks;
   client-scoped MCP method/tool allowlist; bounded JSON and call-rate controls;
   approved model deployment names; bounded Responses options and token quota.
   No dynamic read of SQLite policy/agent suspension is implemented in APIM.
3. **Tenant/platform**: app roles, Agent ID/365 inventory, consent, access reviews,
   DLP, private networking, monitoring and real IAM. None is verified locally.

`configured` means configuration exists, **not live connectivity verified**.
Keep SAP, Teams, Fabric, Foundry IQ, external KB/MCP and Agent 365 `not_connected`
unless an owner supplies positive and negative tenant-backed test evidence.

## Gateway policies

| File | Enforced template behavior | Limits / required application behavior |
| --- | --- | --- |
| `control.xml` | `Reader`/`Operator`/`Approver`/`SecurityAdmin`/`Admin`; approved client; 60 calls/min per caller oid; only `/api/...` and health; strips spoofable headers; forwards caller token; optional explicit-origin bearer CORS | Backend enforces read/operator/approver/security-admin endpoints. Workflows are a shared demo workspace; per-caller ownership is not implemented |
| `mcp.xml` | `Agent`; client/tool map; initialize/list/call only; filters successful `tools/list`; 10 calls/30 sec per client; JSON <=32 KiB | No deployed batches/notifications/SSE/session transport; backend filters read/simulation tools again and validates arguments/state/budgets |
| `responses.xml` | Backend UAMI `azp` + gateway-only `Inference`; approved string model; integer output 1..2048 (backend sends 512); bounded instructions and `tools:[]` permitted; explicit `store=false`; no nonempty tools/background/stream/conversation/previous-response/agent; JSON <=32 KiB | Input content, PII and prompt-injection detection remain application/evaluation concerns; no provider-hosted agent use claimed |
| Same Responses route | 20 requests/min per caller; `llm-token-limit` 25,000 tokens/min and 100,000/day; APIM UAMI token to `https://ai.azure.com` | Per-gateway counters; response accounting/concurrency overshoot possible; not an atomic euro-budget reservation |

The gateway parses JSON as a preserved **JObject**, rejects malformed/array
requests, checks actual property types and compares deployment names to a JSON
array; it does **not** match a `model` substring in raw text. Empty deployment or
tool allowlists deny. Inference operation is create-only; no retrieval/delete,
Assistants or other OpenAI operations exposed.

Explicit draft-04 JSON schemas under `infra/schemas/` are deployed as APIM
service schemas and referenced by `schema-id`; no imported OpenAPI schema is
assumed. This bounded inference route accepts **text-string input only** (up to
16,000 characters), rejects additional properties and does not support arbitrary
Responses payloads, images/files, hosted agents or provider-side tools. MCP
request IDs must be string/integer; no notification or batch envelope is accepted.
Optional `instructions` is a string up to 2,048 characters and `tools`, if
present, must be an array of length zero. This accepts the actual
`ResponsesInference.summarize` payload without permitting model-selected tools.

The backend accepts `Reader`, `Operator`, `Approver`, `SecurityAdmin`, `Admin`, `Agent`;
workflow decisions need `Approver`/`Admin`, start/rescore needs `Operator`/`Admin`,
and policy and agent-state updates need
`SecurityAdmin`/`Admin`. `Inference` is checked at the APIM model route only.
APIM `Agent` clients must also resolve through `PERNOVA_AGENT_CLIENTS_JSON`;
both caller→agent and agent→tool mappings are server-owned. Local operator MCP
is read-only; external `create_stock_transfer` is absent from the exposed schemas.

The stock contract corrects Belgian stock to **6,500 synthetic units**, leaving
2,500 after the 4,000 transfer (floor 2,000). Approval triggers when cross-country
quantity **>2,500 OR incremental cost >€15,000**. The APIM policy does not implement
these domain conditions or store approvals; the application does.

## MCP native capabilities versus local facade

Current Learn documents APIM exposing managed REST APIs as MCP tools and governing
existing MCP servers, with Entra OAuth/JWT controls and header forwarding.
This template deliberately declares a **regular REST API proxy** for the local
JSON-RPC POST contract. It does not import a native APIM MCP API, provide OAuth
protected-resource discovery, or implement full Streamable HTTP.

A real MCP integration needs reviewed server URL, transport/protocol version,
OAuth resource/audience/discovery, tool catalog/schemas, caller-to-agent identity,
source ACLs, allowlists, timeouts/cancellation and tested revocation. No external
MCP URL or credential is invented. An arbitrary URL/tool emitted by a model is
never a connection instruction.

## Content and knowledge safety

- Tool output, KB text and citations are **untrusted data**, never instructions,
  identities or authorization. Prompt injection cannot change deterministic
  policies, tool budgets, roles or approval requirements.
- Local knowledge is bounded **lexical** search over curated synthetic documents.
  `classification`, `owner`, `source`, `version` and `updated_at` are provenance,
  **not inherited enterprise source ACL enforcement**. Agents have curated
  fixture-document scopes; operator search can see the synthetic corpus.
  Do not upload real Pernova confidential/personal data or claim per-user
  enterprise source security trimming.
- A production KB needs permission-aware retrieval using the authenticated caller,
  ingestion-time source ACL/version preservation, deny-on-missing-ACL behavior,
  revocation/cache invalidation tests, residency/retention, and citations checked
  against retrieved source IDs. Foundry IQ is **not connected**.
- Local PII preset demonstrates a bounded detection/denial case, not general DLP
  coverage. Do not log or export prompt bodies, bearer tokens, email addresses,
  supplier-person details or full tool payloads.
- APIM `llm-content-safety` is documented for compatible LLM request schemas and
  a separately configured Content Safety backend. It is **not attached** here.
  Do not assert prompt shielding/PII redaction is supplied by a token policy.
  Any addition requires current compatibility review, managed identity/RBAC,
  thresholds, evaluation and fail-closed tests; no service is provisioned now.

## Model control and costs

Only backend-authorized deployment names may reach the provider. Model aliases
are not prices or approvals. Costs shown in UI/audit are **synthetic euro estimates,
not current Microsoft pricing or billing evidence**. Show configured rate
assumptions with the evidence, separately from actual usage/cost exports.

Application budgets should reserve estimated maximum cost/tokens before calls
and reconcile returned usage; bound retries, total tool calls, wall time and
output length. Denied attempts still count in the audit. Prevent retry loops on
401/403 or exhausted budgets; on 429 honor Retry-After with bounded retry and
cancellation. Never retry an uncertain write without the same idempotency key.
Cloud budgets and APIM quotas are supplemental, not replacements for application
reservations or invoicing.

## Acceptance tests before a connected claim

Run on the approved target with sanitized test identities; retain trace/request
IDs and outcomes, **not tokens**:

| Probe | Required result |
| --- | --- |
| Anonymous Container Apps `/`, existing `/assets/...`, `/theme.js`, `/favicon.svg` | Public shell/static files load without an Easy Auth sign-in/token; no business data embedded; missing files stay 404 |
| Anonymous Container Apps `/api/bootstrap`, `/api/workflows`, `/mcp` | Easy Auth 401; no API/MCP exclusion, no business response or side effect |
| Missing, expired, wrong issuer/tenant/audience token | Gateway 401; current backend 403; no domain work |
| Valid token, wrong client/role | 403; no domain write |
| `Reader`/`Operator` attempts approval, `Approver` attempts start/rescore, or `Operator` attempts policy/agent-state update | Backend 403 unless an additional required role is genuinely granted; no privilege inferred from UI controls |
| Spoof `x-agent`, MCP arguments `agent_id`, identity proxy headers | No privilege change |
| Agent calls another agent's tool, suspended agent or blocked tool | 403/denial; no side effect; list reveals no forbidden tools |
| MCP malformed JSON, array batch, oversized body, unsupported method | Prevented before tool dispatch; JSON size/status verified against APIM |
| Unapproved model; integer/object `model`; invalid JSON; unsafe Responses options | Prevented before provider call |
| Valid approved Responses request | Measured provider usage and same W3C trace; gateway MI, no API key |
| Rate/token exhaustion; concurrent requests | Rate 429 / quota 403 documented; quantify overshoot; app budget prevents excess execution |
| Old scenario/revision approval; replay approved write | Conflict or deterministic denial; replay never duplicates transfer |
| Direct backend request by authorized caller | Determine APIM bypass exposure; production sign-off blocked until gateway-only topology |
| Revoke source ACL; cached KB result; malicious source instructions | No unauthorized retrieval/action; evidence contains redacted source IDs |

APIM native validation errors need not use the application
`{detail, correlation_id}` error shape; the application contract applies to
backend endpoints. UI/clients must handle gateway 401/403/413/429 and native
error bodies safely. Record any required normalization in a reviewed adapter.
