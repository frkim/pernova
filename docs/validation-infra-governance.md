# Infrastructure/governance validation

Date: **2026-11-06**. Standards-alignment follow-up scope: `infra/` and the five
deployment/research/validation/ADR documents listed below only. Other concurrent
repository changes are not owned by this lane. Application and browser runtime
verification is separate. Upstream baseline:
`frkim/ai-coding-standards@8d3608f356ab44b46d04453261f5967610a1a41d`.

## Passed

| Check | Result / boundary |
| --- | --- |
| `az bicep build --file infra\main.bicep --stdout` | Exit 0 using installed Bicep **0.47.16**; no generated ARM file in repository |
| `az bicep lint --file infra\main.bicep` | Exit 0; one narrowly documented diagnostic-settings API-version exception in ADR 003 |
| `python -m unittest discover -s infra\tests -v` | **21 tests passed**: prior 12 artifact checks, the new shared route/output/type-bound guard and 8 Foundry input-test methods with positive/negative subcases; no Azure/network/dependency installation required |
| `python infra\validate_foundry.py` | Passed with all optional Foundry inputs absent: inference remains disabled; no network or endpoint values printed |
| `uv run --no-sync --project backend ruff check --config backend\pyproject.toml infra` | Passed using the existing project tool; no package restore |
| `uv run --no-sync --project backend ruff format --check --line-length 88 infra` | Passed, 3 Python files; preserves the existing infrastructure test formatting convention |
| Existing workstation `jsonschema` Draft4Validator (prior evidence, not rerun in this follow-up) | Both schemas valid; Responses **4 positive + 17 negative**, including actual backend instructions/512/empty-tools payload, and MCP **3 positive + 4 negative** probes passed |
| XML / JSON parse | All three policy XML files, CORS fragment, JSON schemas and Bicep config parse |
| Relative Markdown links and Bicep `loadTextContent` paths | Resolve within repository |
| `git diff --check -- infra docs\deployment.md docs\microsoft-guidance.md docs\validation-infra-governance.md docs\adr\003-preview-and-connected-capability-gates.md docs\adr\004-telemetry-and-demo-topology-exceptions.md` | Passed for this lane's tracked diff; new Python files exercised by unittest and Ruff |
| Feed-reference review | Owned configs/examples reference protected CFS feeds; no public-registry fallback introduced |

The schema probes used synthetic test payloads only, with the already available
validator. They test **payload shape**, not deployed-model allowlists, C# APIM
expression execution, provider behavior or runtime authorization. Static tests
likewise do not prove Entra or cloud control effectiveness.

Direct `python -m ruff` initially failed because Ruff is not installed into the
workstation Python. The existing project Ruff was then reused through
`uv run --no-sync`; no install, restore, public feed fallback or tool upgrade
was performed. Initial Bicep URL-length warning was fixed by matching APIM's
2,000-character service URL maximum; final lint/build have no template warnings.
The installed CLI advertises an available update; it was not installed.

## Implemented checklist alignment and limits

| Checklist IDs | Concrete change / evidence | Remaining disposition |
| --- | --- | --- |
| SEC-04 | Typed string arrays, sealed backend environment objects and bounded collection lengths in Bicep; supported offline Foundry validator bounds JSON, validates endpoint/model shape and suppresses input values in errors | Partial infrastructure input alignment only; not a claim that every external application input was audited |
| AI-01, AI-02 | Model resources/output now require resource URL + project URL + nonempty allowlist together; offline gate rejects legacy paths and mismatched resource subdomains | Actual AIServices/allowProjectManagement/disableLocalAuth/project-parent/IAM facts cannot be proven offline; blocking connection evidence remains unverified |
| AI-03 | Current official SDK documentation researched; inference-only OpenAI Responses remains valid without adding a project SDK; stable 2.x requirement and create-version/Responses migration boundary documented | Any future project operations must research and pin the current stable CFS SDK; this lane adds no SDK or hosted agents |
| AI-04, AI-05 | Region/model evidence gates and preview ADR updated without choosing a region or adopting a preview | Region/quota/live Foundry verification deferred; no runtime preview adoption |
| AZ-01, AZ-02 | Existing resource-group Bicep/parameter file, naming/tags and linter preserved; offline checks pass | OIDC pipeline parameter gate, ARM validation and what-if still need separately approved target/context; no deployment evidence |
| AZ-03 | Separate backend/gateway UAMIs retained; no broad workload grants introduced | Endpoint-scoped built-in Foundry and telemetry roles require IAM-owner evidence |
| AZ-04, SEC-03 | No application secrets or unused vault introduced; future vault must use RBAC, soft delete and purge protection | Application vault N/A for this secret-free synthetic configuration, not a vault-compliance pass |
| AZ-05, SEC-02 | ADR 004 preserves the public/direct-ingress and platform-logging authentication exceptions with owners/expiry | Private backend/WAF and complete Entra-only telemetry remain unresolved |
| AZ-06 | Existing W3C diagnostics, zero body logging, retention and application exporter retained | Live ingestion/redaction/authorization, alerts/on-call remain unverified; queue-depth alert N/A with no queue |
| AZ-07, AZ-08 | Demo scale-to-zero/max-one and Developer feature rationale preserved | No budget amounts/recipients invented; real 50/80/100% budget notifications required before rehearsal |
| AZ-09, API-08 | ADR 004 now states total synthetic-history-loss exposure and manual restart/reseed without a guaranteed RPO/RTO | Deliberate single-instance demo deviation; managed state, backups, restore tests and zone redundancy require separate production design |

These are bounded implementation/evidence dispositions, **not an ALL-standards
compliance verdict** or production waiver. No subscription selection, login,
resource provisioning, permission changes, repository settings or new
dependencies were needed.

## Owned changed paths

- `infra/main.bicep`
- `infra/main.demo.bicepparam`
- `infra/validate_foundry.py`
- `infra/tests/test_artifacts.py`
- `infra/tests/test_foundry_inputs.py`
- `docs/deployment.md`
- `docs/microsoft-guidance.md`
- `docs/validation-infra-governance.md`
- `docs/adr/003-preview-and-connected-capability-gates.md`
- `docs/adr/004-telemetry-and-demo-topology-exceptions.md`

## Not run / not verified

- **Docker build/runtime:** root image supplied, workstation Docker daemon
  unavailable. Non-root/path/probe behavior is not runtime-proven.
- **Bicep parameter-file evaluation:** requires approved environment inputs;
  no fake tenant/resource IDs or selected region were committed to make it pass.
- **ARM validate / what-if / deployment:** intentionally not run. No subscription
  selection, login, provisioning or tenant grants.
- **APIM runtime:** schema import/expression compilation, rates/quotas, role/claim
  checks, identity forwarding, diagnostic categories, endpoint/SKU/network and
  real Responses token accounting still require approved target probes.
- **ACA shell/API boundary:** static regression checks restrict anonymous paths
  to the shell/assets/health allowlist and reject API/MCP patterns. Actual
  `/assets/*` matching, anonymous shell load and unauthenticated API/MCP 401
  remain deployment acceptance tests; no resource was deployed for this change.
- **Backend environment / roles:** harmonized against `Config.from_env`,
  `security.py`, `main.py`, `inference.py` and bootstrap. Actual configured
  tenant grants/tokens and cloud runtime remain unverified; documentation of
  supported settings does not make deployment a working identity integration.
- **Connected browser:** optional MSAL popup + silent token acquisition with
  memory-only cache is implemented and its exact Vite settings documented.
  Tenant SPA/API registration, redirect URI, delegated scope, app roles/consent,
  actual connectivity and browser runtime tests remain unverified. Easy Auth
  does not automatically supply backend JWT Authorization to `fetch`.
  Same-origin `/api/...` fetches do not automatically route through APIM.
- **E2E traces:** application Azure Monitor export is implemented using its
  connection string and required UAMI credential; OTLP remains optional.
  Resource-scoped Monitoring Metrics Publisher authorization, actual ingestion,
  approval actor-hash attribution/redaction and incoming W3C parent linkage
  remain unverified. APIM instrumentation-key diagnostics still require
  `DisableLocalAuth=false` unless a compatible alternative is proven.
- **Agent 365:** tenant enabled status, registration, licensing, consent, real
  inventory/telemetry/access and Work IQ are all unverified/not connected.
- **Repository settings:** branch protection, CodeQL, push protection, private
  disclosure and Dependabot settings require owner evidence; templates do not
  enable them.
- **Application/backend/UI E2E:** separate runtime test evidence is required;
  no results are inferred from static infrastructure checks.

See [deployment gates](deployment.md), [negative acceptance probes](gateway-controls.md)
and [enterprise evidence owners](enterprise-governance.md).
