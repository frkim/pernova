# Pernova demonstration implementation

Status: Ready for Validation

## Standards-alignment follow-up

The 2026-11-06 [standards assessment](../docs/standards-compliance.md) records
the current upstream commit, source changes, 187 passing unit/integration checks,
10 passing browser/HTTP journeys, lint/build and offline Bicep evidence.
It also records blocking repository/API gaps and the `oauthlib` advisory whose
patched version is unavailable from CFS. This is **not full standards compliance
or cloud validation**. Keep this plan `Ready for Validation`; the proof section
below records the earlier implementation run.

## Scope

Implement a runnable local demonstration of supply-chain multi-agent operations,
with an executive control tower and explicit simulated versus connected integration states.
No Azure resources will be provisioned and no real business transactions will be executed.

## Architecture

React + TypeScript + Material UI SPA, FastAPI orchestrator, SQLite local persistence,
OpenTelemetry spans and a controlled JSON-RPC MCP gateway. Four simulated analytical
agents plus deterministic scenario and execution stages. Optional APIM Responses API
inference uses managed identity; no classic Foundry SDK or Assistants API.

Vite is used instead of Next.js because this is a local control-tower SPA backed by
a separate FastAPI service, not an SSR application. Record the deviation in an ADR.

Azure deployment artifacts target Container Apps, APIM, Log Analytics and Application
Insights. No subscription is selected and no resources or agent identities are created.
Agent 365 tenant registration, Entra access reviews, private networking and compliance
evidence remain explicitly unverified until connected and reviewed by the enterprise.

## Work graph

Standards and shared contracts -> backend, UI, deployment configuration -> integration and validation.

## Validation

Automated backend policy/workflow tests, lint/type checks, UI production build,
and end-to-end browser checks including approval, denial, kill switch, costs,
knowledge citations and evidence export.

Standalone Bicep recipe:

- [ ] All validation checks pass
  - [ ] Core validation: Azure CLI authentication, build, ARM validation and
    what-if against an explicitly approved subscription and region. Local Bicep
    compilation passed; cloud checks are deferred, not passed.
  - [x] Bicep linting
  - [ ] Azure Policy validation against the target subscription (deferred)
  - [ ] Container image build and runtime verification (Docker unavailable)

The azure-validate workflow stops at `RunValidation`: there is no approved Azure
context. Keep the plan `Ready for Validation`, not `Validated`, and do not deploy.

## Standards

Read development, security, compliance, Azure and GitHub standards from
frkim/ai-coding-standards (main). Protected CFS feeds are configured before restore.
The Azure MCP best-practice lookup failed during initialization (locked executable);
use official Microsoft Learn sources and checked-in standards for research instead.

## 7. Validation Proof

- `npm run lint`: passed (CFS sources, Ruff, mypy, ESLint and formatting).
- `npm run build`: passed (strict TypeScript and production UI bundle).
- `npm test`: passed (54 backend, 12 infrastructure artifact and 27 frontend tests).
- `npm run test:e2e`: passed (10 HTTP/browser journeys, including approval,
  rejection, idempotency, MCP denial, W3C propagation, suspension, responsive
  layout, persistent theme, KB search and production CSP).
- API readiness and UI HTTP probes: passed.
- `az bicep lint --file infra\main.bicep`: passed.
- `az bicep build --file infra\main.bicep --stdout`: passed.
- Root dependency audit: passed with zero reported vulnerabilities.
- Frontend production dependency audit: passed with zero reported vulnerabilities.
- Frontend development dependency advisory GHSA-g3hv-75wg-m249: pinned
  `minimatch` to patched 11.0.3. ESLint, TypeScript, build, formatting and all
  27 frontend tests passed afterward. Full frontend audit reruns were blocked
  twice by CFS HTTP 429; a clean full audit is not claimed and must be rerun
  after the feed rate limit clears.
- Clean-start end-to-end rerun with `CI=true`: passed (10 tests; managed servers
  exited after teardown).

## Cloud validation boundary

No Azure subscription, region or tenant registration has been selected.
Do not provision resources, grant access, or deploy as part of this task.
ARM validation, what-if, APIM runtime policy compilation, real MSAL sign-in,
Foundry inference, Azure Monitor ingestion and Agent 365 tenant capabilities
remain unverified. An isolated environment, enterprise approval and explicit
Azure context are required before these checks.

Docker base-image digests were resolved, but no image build was possible because
the workstation Docker daemon is unavailable. The local application and built
same-origin frontend have been exercised independently of Docker.
