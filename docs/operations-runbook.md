# Operate and rehearse: 10–15 minutes

Audience: supply-chain decision makers, AI/platform engineers, security/IAM,
privacy/compliance and FinOps. **Use synthetic data only.** Start locally using
README/scripts: SPA loopback `:5173`, API loopback `:8000`, one backend
process. Confirm `/health/live`, `/health/ready` and bootstrap report `demo`.
No Azure login or deployment is needed.
Local interactive API docs are at `http://127.0.0.1:8000/api/docs`, not `/docs`;
they are disabled in connected mode.

## Preflight

- Backend lint/tests, frontend lint/type/build and browser E2E must pass;
  record commit and results. Bicep checks do not replace application tests.
- Fresh disposable SQLite state; agents active; approved models/tools and limits
  visible. Never hide `not_connected` labels or substitute a configured URL for
  connectivity proof.
- Synthetic euro rates, policy revision, source versions and trace ID visible.
  Keep no real email, SAP, logistics, PII or tenant data in the demo.
- Default scoring weights: service 45, cost 20, delay 15, CO₂ 10, risk 10,
  totaling 100; floor/quantity/cost calculations are deterministic.
- Keep a sanitized prior evidence bundle for fallback, clearly labeled recorded,
  not live. Optional MSAL popup/silent-token code is implemented; connected UI
  still needs reviewed tenant registration, redirect/delegated scope, app roles
  and real connectivity tests. Easy Auth alone is not enough.
- The fixed loopback demo caller has `Operator`, `Approver`, `SecurityAdmin` and
  `Reader` so the full storyline can run locally. This is **not enterprise
  separation-of-duties evidence**. Connected start/rescore requires Operator/Admin,
  decisions Approver/Admin, policy/agent status SecurityAdmin/Admin; use
  separately approved identities and test denied actions. No grants occur here.

## Timed storyline

| Time | Presenter action | Observable evidence and audience message |
| --- | --- | --- |
| 0–2 min | Explain port delay, promotion in ten days, 12,000-unit shipment; show mode/integrations | “Operate and govern, not merely generate text.” Four simulated analytical agents; deterministic scenario/execution stages |
| 2–4 min | Start `nominal`; inspect parallel agents, spans and KB citations | Provenance is synthetic lexical retrieval, not Foundry IQ; same workflow trace joins decisions/tools |
| 4–6 min | Compare service/cost/delay/CO₂/risk; rescore with weights summing 100 | Belgian stock 6,500, proposed 4,000, residual 2,500 above 2,000 floor. Explain corrected brief contradiction |
| 6–8 min | Show `awaiting_approval`; approve eligible scenario with reason | Quantity >2,500 OR cost >€15,000 triggers human approval. Execution is synthetic; show transfer/idempotency key |
| 8–9 min | Start second nominal; **reject** pending scenario | Rejected workflow has no transfer. Old scenario/revision approval must not authorize new action |
| 9–11 min | Run `prompt-injection`, `pii`, `unapproved-model` presets | Deterministic denials and audit; malicious fixture never changes policy/tool/model authority; not a general DLP certification |
| 11–12 min | Run `tool-loop`; show calls/tokens/cost and suspension; attempt next disallowed call | Budget blocks runaway behavior; backend kill switch, not a native Agent 365 feature or real Azure-billing cap |
| 12–14 min | Export audit; inspect denied/approval/execution trace; explain APIM/365 deployment boundaries | Local spans are real local OTel/timeline; APIM/Monitor/365 are template/unverified unless tenant tests exist |
| 14–15 min | Show controlled reactivation/reset and enterprise next steps | Owner + reason + review; production gates: actual Entra/MSAL tenant tests, private APIM-only backend, shared state, source ACLs, monitoring/DR, consent |

Actual statuses/events should be observed from the app, not narrated as successful
when a preset fails. If execution fails, show `failed/degraded` and the correlation
ID, then use the fallback evidence honestly.

## Contract-only local API probes

No deployment, restore or tenant credentials in these examples:

```powershell
$base = 'http://127.0.0.1:8000'
$bootstrap = Invoke-RestMethod "$base/api/bootstrap"
$weights = @{service=45; cost=20; delay=15; co2=10; risk=10}
$body = @{preset='nominal'; weights=$weights} | ConvertTo-Json
$workflow = Invoke-RestMethod "$base/api/workflows" -Method Post -ContentType 'application/json' -Body $body
# POST returns 202; inspect via bounded polling or UI SSE, not immediate success assumptions.
$current = Invoke-RestMethod "$base/api/workflows/$($workflow.id)"
$current.status
```

Only decide when the returned workflow is `awaiting_approval`, using the **current
eligible scenario ID** and a reason. `POST /api/workflows/{id}/decision` receives
`{decision:"approve"|"reject", scenario_id, reason}`. Rescore uses the contract
weights; policy updates require the optimistic current revision. Local operator
is not a verified Entra agent and must not acquire MCP business-write privileges.
Do not send `x-agent` to manufacture trust.

## Observability triage

1. Locate workflow ID/trace ID in local spans and events; identify first denied
   tool/model/approval, policy revision and agent state. Export sanitized evidence
   before reset.
2. When genuinely connected, query Azure Monitor/App Insights by W3C trace ID
   (`operation_Id` or workspace `OperationId`). APIM diagnostics use W3C, zero
   bodies and no Authorization logging; app/exporter linkage still needs proof.
3. Check availability, p95 latency/error rate, tool-call/denial count, token/cost
   estimates and exporter backlog/dropped spans. Real spend is separately
   reconciled with Azure Cost Management/provider usage.
4. No alert action group or automatic Azure Monitor→suspension handler is deployed
   here. The application enforces budgets directly. An enterprise alert/automation
   requires a least-privilege authenticated handler, duplicate-event protection,
   reviewed thresholds and an on-call owner.

**Example query for the App Insights `dependencies` schema**, only after verifying
actual tables/attribute mapping (workspace tables use `AppDependencies` etc.):

```kusto
let selected_trace = "REPLACE_WITH_SANITIZED_WORKFLOW_TRACE_ID";
dependencies
| where timestamp > ago(24h) and operation_Id == selected_trace
| project timestamp, name, duration, success, operation_Id,
          agent=tostring(customDimensions["agent.id"]),
          decision=tostring(customDimensions["policy.decision"])
| order by timestamp asc
```

```kusto
dependencies
| where timestamp > ago(1h)
| summarize p95_ms=percentile(duration / 1ms, 95),
            errors=countif(success == false), calls=count() by bin(timestamp, 5m)
```

No results is not proof of no activity: verify exporter enabled, endpoint/auth,
sampling, flush, network access and ingestion delay. The implemented Azure Monitor
exporter requires `APPLICATIONINSIGHTS_CONNECTION_STRING`, `AZURE_CLIENT_ID` and
the application UAMI's resource-scoped **Monitoring Metrics Publisher** role.
Run a synthetic workflow, allow batching/graceful flush, and find its trace ID in
the intended Application Insights resource before claiming live ingestion.
Approval spans include `auth.actor_hash` (SHA-256 of the verified caller subject)
and `auth.decision_role=Approver`, not the raw subject. The hash is correlatable
pseudonymous evidence, **not anonymization**. Verify attribution/redaction in the
live trace. OTLP remains a separate optional export path; neither exporter proves
Agent 365 onboarding. Agent 365 additionally needs qualifying assigned licensing
and its `invoke_agent` schema/root span.

## Incident containment and recovery

| Symptom | Contain / diagnose | Recover safely |
| --- | --- | --- |
| Loop/budget denied | Suspend affected agent through authorized app control; retain trace and counters | Check bounded retries/model/tool policy; review reason; explicitly reactivate, start new workflow |
| Injection/PII/model denial | Keep denied; capture redacted metadata only | Improve source/policy/evaluations; do not bypass controls to finish demo |
| Unexpected transfer/replay | Suspend execution path; stop real adapters if ever added; preserve idempotency/state | Reconcile ledger first; never blindly retry a write; apply approved compensation |
| SSE disconnected | Show reconnect status, use bounded workflow GET fallback | Confirm trace/workflow continuity; avoid creating duplicate workflows on retry |
| Missing telemetry | Keep local evidence; report exporter `configured`, not connected | Verify transport and schema separately; never label a screenshot as live tracing |
| 401/403 connected | No privilege escalation; check audience/issuer/client/role/consent with IAM | Admin-reviewed correction; no token/header spoof or weakened validation |
| App/SQLite restart | Demo state may be lost; do not promise persistence | Fresh synthetic workflow after readiness; production restore requires shared durable store |
| Credential leak | Stop affected route, notify security owner; revoke/rotate via authorized IAM process | Audit use, remove leaked material/history under incident process; post-mortem within five working days |

## Reset

There is **no reset API** in the binding contract. For a clean local rehearsal:
stop the backend using documented scripts (or its specific known PID), export needed
sanitized evidence, identify the actual configured **demo** SQLite path, and
remove only that database and its matching `-wal`/`-shm` files while stopped.
Start one process; confirm fresh fixture policy, active agents and readiness.
Never delete an unverified path, reset live tenant/enterprise data, kill by process
name, or use `git clean` in this shared worktree. Container `/app/data` is writable
but ephemeral in this template. Agent reactivation alone does not reset policy
revisions, approvals or counters.

For cloud recovery, platform owner first confirms approved target and impact;
roll back to a reviewed image/policy revision through IaC, retain audit evidence,
restore real state only through a tested restore process, revalidate grants and
negative probes, then get business/security sign-off. This template supplies no
backup/failover/DR mechanism.
