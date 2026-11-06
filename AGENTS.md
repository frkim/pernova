# Pernova agent/developer contract

Pernova demonstrates synthetic supply-chain multi-agent analysis, deterministic
scenario selection, approval, controlled execution, audit and suspension.
Frontend: Vite React/TypeScript + MUI SPA (ADR 001). Backend: Python FastAPI.
State: single-process SQLite (ADR 002). Hosting: local loopback; optional
**undeployed** Azure Container Apps/APIM templates. No real SAP/Teams/Foundry IQ/
Agent 365 integration is implied.

## Binding inputs and ownership

Read `docs/api-contract.md`, `docs/supply-chain-disruption-manager.md` and
`.azure/deployment-plan.md` before editing. Contract overrides the brief's
contradictory stock data: 6,500 synthetic Belgian units, 2,000 floor, 4,000 transfer.

- Respect the explicit edit boundary in each task and repository CODEOWNERS.
- Application packaging is defined by root manifests, README, scripts, Dockerfile
  and CI; backend and frontend have separate source/lockfile ownership.
- Infrastructure is under `infra/`; architecture/governance guidance is under
  `docs/` and repository governance files.
- Do not silently edit shared contracts or overwrite concurrent work.
- Do not spawn nested agents for this bounded task.
- No cloud provisioning, subscription selection, tenant login, consent or access
  changes. Deployment requires explicit later subscription/region/approval.

## Setup and commands

Use README for exact install/run/lint/build/test/E2E commands. Local ports
are loopback frontend 5173 and API 8000. Backend dependencies are
`backend/pyproject.toml` and `backend/uv.lock`; frontend uses its committed npm lock.
The root image combines statics and FastAPI, non-root UID/GID 10001 with
`PERNOVA_DATA_DIR=/app/data`.

Safe infrastructure commands:

```powershell
az bicep lint --file infra\main.bicep
az bicep build --file infra\main.bicep --stdout
```

Use installed tooling; do not install public packages or auto-upgrade Azure tools.
Before restores follow [package feeds](https://github.com/frkim/ai-coding-standards/blob/main/standards/development/package-feeds.md):
PyPI `https://packagefeedproxy.microsoft.io/pypi/simple`,
npm `https://packagefeedproxy.microsoft.io/npm/`,
NuGet `https://packagefeedproxy.microsoft.io/nuget/v3/index.json`.
No blocked registry fallback or screening bypass.

## Standards contract

Read [development](https://github.com/frkim/ai-coding-standards/blob/main/standards/development/development.md),
[security](https://github.com/frkim/ai-coding-standards/blob/main/standards/security/security.md),
[compliance](https://github.com/frkim/ai-coding-standards/blob/main/standards/compliance/compliance-checklist.md),
[Azure](https://github.com/frkim/ai-coding-standards/blob/main/standards/azure/azure.md) and
[GitHub](https://github.com/frkim/ai-coding-standards/blob/main/standards/github/github.md).
Agent instructions are supplied by the upstream plugin or linked, not copied into
unowned paths: [coding](https://github.com/frkim/ai-coding-standards/blob/main/instructions/coding-standards.instructions.md),
[security](https://github.com/frkim/ai-coding-standards/blob/main/instructions/security.instructions.md),
[testing](https://github.com/frkim/ai-coding-standards/blob/main/instructions/testing.instructions.md),
[documentation](https://github.com/frkim/ai-coding-standards/blob/main/instructions/documentation.instructions.md),
[architecture](https://github.com/frkim/ai-coding-standards/blob/main/instructions/architecture.instructions.md).

## Non-negotiables

- Validate input, bound collections/retries/tokens/tool calls/cost and enforce
  authority server-side. LLMs do not calculate/authorize critical transactions.
- Agent identity derives from validated Entra claims in connected mode, never
  `x-agent`, tool arguments or source content. Local demo identity is not verified.
- User workload identities use Entra/managed identity; CI uses OIDC with minimum
  permissions. Pin actions to researched full SHAs; coordinate CI changes with maintainers.
- Use Foundry NEW resource/project, Responses API, current stable SDKs
  (`azure-ai-projects` 2.x for project work); no classic/Assistants.
- Do not claim configured integrations, telemetry or Agent 365 are live.
  Optional MSAL popup/silent memory-only token support is implemented and gated
  by all three Vite Entra settings; actual tenant/redirect/scope/role tests remain
  unverified. Easy Auth alone does not supply browser bearer tokens or force
  same-origin `/api/...` calls through APIM.
- Local KB is synthetic lexical retrieval, not real ACL enforcement or Foundry IQ.
- Synthetic costs are not current prices. ISO/GDPR/AI Act mappings are not certification.
- Keep secrets/PII out of logs, exports, issues and code. Follow SECURITY.md.
- Every UI supports persistent OS-aware dark/light mode, keyboard navigation and
  sortable/filterable/paginated searchable tables. Tests accompany features.
- Assess all five WAF pillars; document trade-offs/deviations/previews in ADRs.
- Use Mermaid for docs diagrams; diagnostic scratch scripts only in ignored tmp/.
- Test changes and report what passed, failed or could not run. Bicep build proves
  compilation only; Docker and tenant runtime validation may be unavailable.

Return a concise caller summary of owned files, validation and remaining gaps.
