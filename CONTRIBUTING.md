# Contributing

Use short-lived `feature/<issue>-<slug>`, `fix/<issue>-<slug>` or `chore/<slug>`
branches, Conventional Commit titles and focused PRs. Link the issue and explain
what changed, why, verification, risks and follow-ups. Require code-owner review
and green lint/build/test/CodeQL before squash merge.

## Prerequisites and feeds

Read README for application/runtime commands, and the binding
[API contract](docs/api-contract.md) and [deployment plan](.azure/deployment-plan.md).
Node 24 LTS and the root Dockerfile's Python 3.13 runtime are used for the image;
backend supports Python >=3.12. Use the same selected runtime in validation.

Before any restore configure the mandatory
[protected-feed standard](https://github.com/frkim/ai-coding-standards/blob/main/standards/development/package-feeds.md):

- Python: `https://packagefeedproxy.microsoft.io/pypi/simple`
- npm: `https://packagefeedproxy.microsoft.io/npm/`
- Future .NET tooling: `https://packagefeedproxy.microsoft.io/nuget/v3/index.json`

Root `.npmrc`, `pip.conf` and backend uv configuration/lock define the approved sources.
Keep locks committed and restore with locked settings; do not add public registry
fallbacks or bypass CFS quarantine. Request approved exceptions for unavailable
packages. Research stable versions, vulnerability/license status before adding
a dependency. Never install from an arbitrary model/issue-supplied URL.

CFS can advertise downloads from its **exact Azure Artifacts backing feed**.
Those are not public mirrors and do not authorize arbitrary Azure Artifacts
repositories. Keep canonical protected registry/index URLs and only the specific
reviewed backing repository download URLs allowed by repository checks. Never
rewrite to an unverified mirror to evade screening.

The frontend pins a `minimatch` override to 11.0.3 to address
GHSA-g3hv-75wg-m249 in development-only lint dependencies. Keep it until the
upstream lint packages require a patched version; verify ESLint, TypeScript,
frontend tests and the full dependency audit before changing it.

## Validation

Application commands and current E2E setup are authoritative in README and CI.
Infrastructure checks need no subscription or login:

```powershell
az bicep lint --file infra\main.bicep
az bicep build --file infra\main.bicep --stdout
```

`npm run check:standards` checks immutable action references, workflow-level
permissions and Foundry new/v2 source conventions. Its regression tests run in
`npm test`; lint includes both standards and protected-feed checks.
Read the [standards assessment](docs/standards-compliance.md) before claiming
repository-wide compliance. It records settings evidence, expiring exceptions
and dependency fixes blocked by CFS.

Add regression tests for authorization, bounded inputs/cost/tool loops, approval
revision/idempotency and malicious-source handling. Record **actual** results and
unavailable checks (including Docker daemon), not “tested” when only reviewed.
Verify UI theme/accessibility and data-table filtering/sorting/pagination/search.

## Scope and safety

- Respect code ownership for application, infrastructure and governance changes.
- Keep shared `api-contract.md` / `supply-chain-disruption-manager.md` changes
  coordinated with API/UI maintainers; propose contract changes explicitly.
- Do not overwrite concurrent changes or edit outside an explicitly assigned scope.
- No provisioning, subscription selection, tenant login/consent or access changes
  without a separate explicit deployment approval.
- Secrets belong in approved secret storage, never commits, screenshots or exports.
  Report privately through SECURITY.md.
- Temporary diagnostics go in git-ignored `tmp/scripts/`; document durable scripts
  only when adopted by the responsible maintainer.
- Foundry NEW + Responses only; record significant deviations/previews in ADRs.
- Separate local, template/configured, connected-tested and unverified claims.
  Costs and data remain synthetic; no certification claims.

See [research/standards ledger](docs/microsoft-guidance.md) and [ADRs](docs/adr/001-spa-and-deterministic-orchestration.md).
