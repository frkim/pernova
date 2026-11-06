# Standards assessment: Pernova

- Date: 2026-11-06.
- Upstream: `frkim/ai-coding-standards` at
  [`8d3608f356ab44b46d04453261f5967610a1a41d`](https://github.com/frkim/ai-coding-standards/tree/8d3608f356ab44b46d04453261f5967610a1a41d).
- Baseline: `5baf1a0d4b4b1b8dd7c52b62c5a899542b26ef9a`, plus the alignment changes
  accompanying this assessment.
- Stack: Vite React/TypeScript/MUI, Python FastAPI, SQLite, optional undeployed
  Container Apps/APIM templates and inference-only Foundry Responses integration.
- Method: read the upstream standards, instructions and complete compliance
  checklist; inspect application and infrastructure sources; query GitHub
  settings read-only; run the local checks recorded below.

## Verdict

**Non-compliant: blocking gaps remain.** Local changes improve alignment but do
not enable GitHub protections, bypass CFS, replace the binding demo API contract,
or prove Azure operating effectiveness. Do not describe this repository as fully
compliant or production-ready.

The upstream checklist defines `Pass`, `Fail`, `Exception`, `N/A` and
`Unverified`. Its blocking items cannot be waived by an ADR. In particular,
ADR 002 explains the API collection exception but does not turn **API-04** into
a compliance pass.

## Blocking and actionable gaps

| Checklist | Status and observed evidence | Owner / target |
| --- | --- | --- |
| GH-01, GH-02, GH-03 | **Fail.** `gh api repos/frkim/pernova/branches/main/protection` returned 404 “Branch not protected”; `gh api repos/frkim/pernova/rules/branches/main` returned `[]`. No enforced approval, stale-review dismissal, required checks, up-to-date rule, or force-push/deletion protection was observed. | Repository owner: before merge, target 2026-11-13. |
| API-04 | **Fail.** The binding `docs/api-contract.md` requires bounded `limit/offset` history and fixed bounded bootstrap/knowledge collections, not universal `page/pageSize/sort/order/q`. ADR 002 preserves compatibility. A separately coordinated versioned API/UI migration is required for strict compliance. | Application owner: before enterprise release, review by 2026-12-06. |
| DEP-06 | **Fail.** Open high advisory GHSA-3jp2-3mrg-2vxc affects `oauthlib 4.0.0` in `backend/uv.lock`. `azure-monitor-opentelemetry` reaches it through the exporter, `msrest` and `requests-oauthlib`. `uv lock --project backend --upgrade-package oauthlib==4.0.1` could not resolve the patched version from CFS. No unsafe override or public fallback was applied. | Repository owner + CFS: request approved feed remediation/exception; target 2026-11-13, no later than the high-severity 30-day SLA. |
| GH-09 | **Fail.** `gh api repos/frkim/pernova/private-vulnerability-reporting` returned `{"enabled":false}` for this public repository. `SECURITY.md` retains an owner-arranged private channel rather than advertising an available reporting form. | Repository owner: target 2026-11-13. |
| REPO-06 | **Fail.** Repository description exists; `gh api repos/frkim/pernova --jq .topics` returned `[]`. | Repository owner: choose accurate topics by 2026-11-13. |
| FLOW-01 | **Fail.** Baseline history includes non-conventional titles and a merge commit; squash is permitted but merge/rebase methods are also enabled. Existing history is not rewritten. | Repository owner: enforce conventional squash titles for subsequent merges. |
| FLOW-02 | **Fail.** Copilot worktree branches carry the application-managed user prefix rather than the standard `chore/` shape. No claim that this branch matches the upstream pattern. | Repository owner: review before merge, target 2026-11-13. |
| CODE-03, CODE-05, CODE-09 | **Partial / Fail.** Pydantic request/response models and strict typing exist, but configuration remains a validated dataclass; some existing filenames/layout and public-symbol contract documentation do not meet the literal conventions. No mass rename or public API rewrite is hidden in this change. | Application owner: review by 2026-12-06. |

The advisory was first reported on 2026-11-06, so **GH-08** was within its
remediation SLA at assessment time, not evidence that the dependency was safe.
Rerun the alert query after the patch reaches the approved feed.

## Checklist coverage and boundaries

The following matrix covers the remaining checklist IDs. `Pass` is limited to
the evidence stated; a template is not a deployed control.

| Checklist IDs | Status | Evidence / boundary |
| --- | --- | --- |
| REPO-01, REPO-02, REPO-03, REPO-04, REPO-05, REPO-07, REPO-08, REPO-09 | Pass | Root README, contributor/security/license/editor configuration, `AGENTS.md` linked upstream instructions, `.github/` templates/CODEOWNERS, ADRs, example environments, ignored state and scratch paths. |
| GH-04 | Unverified | Signed-commit policy applicability requires owner confirmation; no default-branch rules were observed. |
| GH-05 | Pass | CodeQL workflow exists; successful main analyses on 2026-11-06, no open code-scanning alerts returned. This is not a new exploit audit. |
| GH-06, GH-07, GH-08 | Pass at assessment time | Secret scanning/push protection and Dependabot updates/alerts enabled; no open secret alerts; Dependabot includes npm, uv and actions. One high advisory is still inside its 30-day SLA. |
| FLOW-03 | Unverified | Future PR review, linked issue and approval must be checked on the actual PR; a template alone is insufficient. |
| FLOW-04 | N/A currently | No releases returned by the releases API. A future release must attach an SBOM, semantic version and generated notes before it can pass. |
| CI-01, CI-02, CI-03, CI-04, CI-05, CI-06, CI-07, CI-08 | Pass for checked-in configuration | `.github/workflows/ci.yml` and `codeql.yml` run on PR/main, use minimum workflow permissions, full SHA pins, Node 24 action runtimes, concurrency and locked installs. Runtime files drive application setup. New remote CI results remain unverified until pushed. |
| CI-09, CI-10 | N/A currently | No Azure authentication or deployment workflow exists; no production environment is deployed. Any future deployment needs scoped OIDC and reviewer approval. |
| CI-11 | Pass locally; cloud unverified | CI now runs both Bicep lint and build. ARM validation/what-if require a separately approved Azure environment. |
| DEP-01 | Exception | ADR 001 retains Node 24 LTS and supported Python 3.13 consistently. Latest-Python migration needs dependency/image validation rather than an untested runtime bump; review before 2026-12-06. |
| DEP-02, DEP-04, DEP-05, DEP-07 | Pass | Committed npm/uv locks, explicit CFS configuration and feed validator, README link, one frontend component kit and existing inference client. |
| DEP-03, CODE-04 | N/A | No .NET code or restores. |
| CODE-01 | See validation below | Root lint/build/test are documented and exercised. |
| CODE-02 | Pass for configured gates | Strict TypeScript, ESLint/Prettier and typed DataGrid integration. |
| CODE-06, CODE-07, CODE-08 | Local implementation / tests | `backend/README.md` documents sanitized named environment validation, correlated JSON logs, explicit request/stream failure handling and cleanup that releases later resources even if an earlier release fails. |
| SEC-01 | Unverified for full history | No open GitHub secret alerts; no credentials introduced. Entire Git history and all secret detector coverage were not independently certified. |
| SEC-02, SEC-03, SEC-06, SEC-07 | Local/template evidence only | Managed identities and Entra validation are implemented/configured; local loopback operator is explicitly unverified identity. Real role grants, tenant tests, source ACLs and enterprise object isolation remain deployment gates. |
| SEC-04, SEC-05, SEC-08, SEC-09, SEC-10, SEC-11 | Local evidence; cloud unverified | Pydantic bounds, parameterized SQLite, body deadline/limits, pre-authentication socket-peer and authenticated-principal rate limits, restrictive headers/CORS, connected-mode HSTS and generic correlation-ID errors; see backend and E2E tests. Forwarded headers cannot supply the limiter identity. HTTP is loopback-only in demo; distributed limiting and actual cloud TLS require separate runtime evidence. |
| SEC-12, SEC-13, SEC-14 | Exception / unverified | Non-root Dockerfile and threat model exist; root filesystem is not read-only, state is disposable, and enterprise retention/deletion needs approval. Docker runtime was unavailable. ADR 002/004 expire before enterprise release or 2026-12-06. |
| API-01, API-05, API-06, API-09 | Pass for local scope | FastAPI-generated OpenAPI and dependency-aware readiness; parameterized bounded workflow queries. This is not an enterprise scaling benchmark. |
| API-02, API-03, API-08 | Exception | ADR 001/002 document compact module layering, unversioned binding paths/errors and single-process SQLite. Do not use the exception to authorize production or silently break existing clients. |
| API-07 | Partial / unverified for enterprise scope | Inference now has a total deadline covering token acquisition and the request, cancellation and explicit cleanup. `backend/README.md` explains why automatic retries remain disabled to avoid unaccounted duplicate consumption; full connected circuit-breaker/real-adapter semantics still need evidence. No message queue is used. |
| UI-01 | Exception | ADR 001 selects Vite rather than Next.js/Vue until connected-release review or 2026-12-06. |
| UI-02, UI-03, UI-05, UI-06, UI-08 | Local implementation / tests | Shared MUI DataGrid table supplies sorting, per-column filters, pagination, 300 ms debounced global search and explicit data states. Theme follows OS preference until explicit choice, persists it and synchronizes storage changes. |
| UI-04 | Partial / unverified | Keyboard/focus behaviors have regression tests, but a full WCAG AA contrast and assistive-technology audit is not claimed. |
| UI-07 | N/A for current fixed fixtures | Small bounded collections use client-side grid operations; enterprise collections require coordinated server query/paging support under API-04. |
| AZ-01, AZ-02, AZ-03, AZ-06, AZ-07 | Template / unverified | Bicep under `infra/`, tags, UAMIs and disposable single-replica topology. No deployed role/diagnostic/availability evidence; no CI deployment has occurred. |
| AZ-04 | N/A currently | No runtime application secret requiring Key Vault is introduced. |
| AZ-05, AZ-08, AZ-09 | Gap before deployment | Private networking/WAF, actual budgets, production zones, backup/restore and approved RTO/RPO are not supplied by a disposable public-ingress demo. Platform/FinOps owner: resolve before enterprise deployment. |
| AI-01, AI-02, AI-04 | Unverified | Existing Foundry new resource/project is an input, not a created or inspected resource. Require `AIServices`, project management enabled, local auth disabled, Foundry-scoped roles and supported region evidence before connecting. |
| AI-03 | Pass for implemented source | `backend/app/inference.py` uses `AsyncOpenAI.responses.create` with OpenAI v1/APIM and managed identity. No project operations exist, so no unused project SDK is installed. The standards guard rejects classic clients/Assistants and requires a pinned stable 2.x project SDK if introduced. |
| AI-05 | Pass for documentation | ADR 003/004 distinguish planned previews, classic migration prohibition, telemetry exceptions and unverified integration status. |
| TEST-01, TEST-02, TEST-05, TEST-06, TEST-07 | Local pass; remote unverified | Unit/integration/browser results below cover regressions and critical journeys. CI for this change still requires an actual run after push. |
| TEST-04 | Partial / unverified | New standards guard has 95.71% line coverage. Backend/frontend changed-line coverage was not measured; no coverage package was added just to claim a number. |
| TEST-03 | Unverified universally | External inference is faked and databases are isolated in unit tests; not every wall-clock dependency has been proven eliminated. |
| DOC-01, DOC-05, DOC-06 | Pass for updated guidance | English README documents commands, help, deployment boundaries and the new guard; local document links and behavior documentation are updated with code. |
| DOC-02 | Pass | All four ADRs now expose Context, Decision, Consequences and Alternatives considered with status/date and bounded review dates. |
| DOC-03, DOC-04 | Exception / partial | API path/error deviations are in ADR 002; the historical brief is preserved as an input rather than rewritten into a claim of implemented Mermaid architecture. Every-endpoint example completeness remains unverified. |

## Reproduce the repository settings assessment

These are read-only queries; enabling controls is a separate owner action.
Alert queries intentionally select metadata, never secret values.

```powershell
gh api repos/frkim/pernova/branches/main/protection
gh api repos/frkim/pernova/rules/branches/main
gh api repos/frkim/pernova --jq '{description,topics,security_and_analysis}'
gh api repos/frkim/pernova/private-vulnerability-reporting
gh api repos/frkim/pernova/vulnerability-alerts --include
gh api 'repos/frkim/pernova/dependabot/alerts?state=open&per_page=100' --jq '[.[] | {number,state,severity:.security_advisory.severity}]'
gh api 'repos/frkim/pernova/code-scanning/alerts?state=open&per_page=100' --jq '[.[] | {number,state}]'
gh api 'repos/frkim/pernova/secret-scanning/alerts?state=open&per_page=100' --jq '[.[] | {number,state}]'
```

## Source evidence index

These anchors refer to this alignment revision; use the accompanying diff when
line numbers move.

| Surface | Evidence |
| --- | --- |
| CI and source guard | `.github/workflows/ci.yml:18`, `scripts/check-standards.mjs:6`, `scripts/check-standards.mjs:36`, `scripts/check-standards.test.mjs` |
| Foundry configuration | `infra/main.bicep:72`, `infra/validate_foundry.py:48`, `infra/tests/test_foundry_inputs.py` |
| Backend boundary/configuration | `backend/app/security.py:33`, `backend/app/security.py:101`, `backend/app/config.py:87`, `backend/tests/test_boundary.py`, `backend/tests/test_config.py` |
| Database history | `backend/app/store.py:45`; the matching query-plan regression verifies indexed ordering rather than just index existence |
| Frontend tables | `frontend/src/components/DomainTable.tsx:27`, `frontend/src/components/DomainTable.test.tsx`, scenario and FinOps integration tests |
| Theme | `frontend/src/ThemeController.tsx`, `frontend/src/ThemeController.test.tsx` |

## Validation and remaining release gates

- `npm run lint`: passed, including CFS/source checks, Ruff lint/format, strict
  mypy, ESLint and whole-frontend Prettier.
- `npm run build`: passed; Vite reports an 813.25 kB minified shared MUI/DataGrid
  chunk (244.43 kB gzip). This dependency-size trade-off is not hidden by raising
  the warning limit; further lazy-loading/chunk optimization remains a performance
  follow-up, not a failed build.
- `npm test`: passed, **187 tests**: 7 standards guard, 118 backend,
  21 infrastructure and 41 frontend.
- `$env:CI='true'; $env:PERNOVA_E2E_API_PORT='18000'; $env:PERNOVA_E2E_WEB_PORT='15173'; npm run test:e2e`:
  passed, **10 browser/HTTP journeys**. Test-owned servers exited afterward;
  existing applications on ports 5173/8000 were left untouched.
- `az bicep lint --file infra\main.bicep`: passed.
- `az bicep build --file infra\main.bicep --stdout`: passed.
- Standards-guard regression tests: 7 passed; 95.71% line coverage.
- `@mui/x-data-grid` 9.16.0 was researched through CFS before installation:
  stable MIT release, compatible MUI 9/React 19 peers. GitHub's published
  advisory query for that exact package/version returned no entries; this is
  not a substitute for the blocked full transitive dependency audit.
- `npm run check:feeds`: passed for both npm locks and `uv.lock`.
- Root `npm audit --omit=dev --json`: passed, no reported vulnerabilities.
- `npm audit --prefix frontend --json`: blocked by CFS HTTP 429; no clean full
  frontend audit is claimed.
- Docker daemon: unavailable; image build/runtime could not be verified.
- No Azure login, subscription selection, provisioning, tenant grant or access
  change was performed. Foundry runtime, Entra sign-in, APIM policy execution,
  telemetry ingestion, ARM validation and what-if remain unverified.

The first integrated lint run exposed 28 frontend formatting failures, including
CRLF checkout drift. Existing Prettier normalized the frontend; `.gitattributes`
now enforces LF consistently with `.editorconfig`. The subsequent integrated
lint/build passed. These were formatting changes, not a frontend redesign.

Previously recorded results in `.azure/deployment-plan.md` are historical.
This assessment supplies the current alignment evidence; it does not mark the
deployment plan `Validated`.
