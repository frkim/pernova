# ADR 003: no implicit preview or connected-service adoption

- Status: accepted scope constraint.
- Date: 2026-11-06. Review: each connector change, no later than 2026-12-06.

## Context

The synthetic demonstration must distinguish local behavior from verified
enterprise connections. Foundry and Agent 365 capabilities have different
availability, preview and identity requirements; a template or SDK declaration
alone cannot establish that those requirements are met.

## Decision

The demo uses local simulated analysis and curated lexical knowledge, not
Foundry IQ, managed multi-agent workflow/memory, Agent 365 Work IQ MCP or
Frontier-only AI teammate notifications. **No runtime preview is adopted by this
infrastructure template.** These integrations remain `not_connected`.

Current Agent 365 guidance identifies Work IQ MCP as preview and agent
user/notification quickstart capabilities as Frontier-preview-dependent.
If the enterprise chooses either, create a feature-specific ADR with tenant
availability/license evidence, identity/consent model, failure/rollback behavior,
security evaluation, cost/region/residency and an exit/review date.

The template uses the current documented ARM diagnostic-settings
`2021-05-01-preview` schema. This is a resource-provider schema dependency, not a
claim of preview AI service use. Bicep 0.47.16's recent-version rule recommends
`2016-09-01`; a **one-line scoped suppression**, not global disabling, records the
choice. Recheck the provider schema at the next CLI/toolchain review.

Foundry NEW Responses inference remains optional, subject to current deployed
model/region support, MI access and negative-test evidence. No classic fallback
is authorized if the selected endpoint fails.

### Foundry v2 connection gate

Inference is enabled only with the existing resource OpenAI v1 endpoint,
existing Foundry (new) project endpoint and nonempty model deployment allowlist
together. All three conditional model resources and the output share that gate.
The supported offline `infra/validate_foundry.py` check rejects partial,
legacy-path, query-bearing, mismatched-host and unbounded/malformed input
without contacting Azure or logging values. Bicep also bounds and types input
collections. No resource/project/model or identity grant is provisioned.

Current official SDK guidance (retrieved 2026-11-06) identifies stable project
SDK 2.x, with Python `azure-ai-projects>=2.3.0` and `openai>=3.0.0` in its
examples. Existing inference uses the standard OpenAI Responses API and needs
no project SDK. Future project work must research/pin a current stable CFS
release and use `agents.create_version()` with `PromptAgentDefinition`, not
Assistants, threads or runs. No new preview or dependency is adopted here.

Endpoint shape cannot distinguish a standalone OpenAI account from Foundry
(new). Before connection the platform owner must provide actual
`kind=AIServices`, `allowProjectManagement=true`, `disableLocalAuth=true`,
child-project parentage, supported region/model and least-privilege
endpoint-scoped IAM evidence. See [deployment gates](../deployment.md).
Missing evidence remains **unverified**, not an accepted production exception
to AI-01 through AI-04. AI-05 has no runtime preview adoption in this template.

## Consequences

### WAF trade-offs

Operational excellence (primary): explicit connection status and reproducible
demo, instead of fragile speculative integration. Security improves through no
implicit tenant grants. Reliability retains offline fallback. Performance is
not a benchmark of hosted services. Cost avoids speculative resources but does
not measure real provider/tenant operation.

## Alternatives considered

- Adopt managed workflows, memory or IQ previews immediately: rejected because
  tenant availability, consent, security evaluation and rollback evidence are
  not established.
- Fall back to classic Foundry or Assistants when connection fails: rejected
  because new work must use Foundry (new) and the Responses API.
- Infer connectivity from endpoint configuration alone: rejected because
  resource provenance, IAM and runtime behavior require separate evidence.
