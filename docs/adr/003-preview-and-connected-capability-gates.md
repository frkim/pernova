# ADR 003: no implicit preview or connected-service adoption

- Status: accepted scope constraint.
- Date: 2026-11-06. Review: each connector change, no later than 2026-12-06.

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

## WAF trade-offs

Operational excellence (primary): explicit connection status and reproducible
demo, instead of fragile speculative integration. Security improves through no
implicit tenant grants. Reliability retains offline fallback. Performance is
not a benchmark of hosted services. Cost avoids speculative resources but does
not measure real provider/tenant operation.

Foundry NEW Responses inference remains optional, subject to current deployed
model/region support, MI access and negative-test evidence. No classic fallback
is authorized if the selected endpoint fails.
