# Agent 365: real onboarding, not a mock connection

Research: official Microsoft Learn, **2026-11-06**. Recheck capability/role/license
availability in the chosen tenant before adoption. This repository registers no
agents, changes no consent/access and runs no Agent 365 CLI provisioning commands.
The local catalog is **not an Agent 365 inventory**.

## Current documented capabilities and requirements

| Capability | Learn's current prerequisites / boundary |
| --- | --- |
| Identity / registration | Tenant with Agent 365 enabled; no additional identity license described by the current quickstart; registered Entra blueprint, instance identity, owners/sponsors and approved permissions |
| Setup permissions | Global Administrator, or **Agent ID Developer with a Global Administrator available for OAuth permission grants**; Azure subscription/resource-create permission for the referenced onboarding flow |
| Observability | At least one tenant user with an **assigned Microsoft 365 E7 or Microsoft Agent 365 license**; SKU availability alone is not sufficient |
| Work IQ MCP tooling | Microsoft 365 Copilot license, delegated permission model and Global Administrator grants; **preview**; standard S2S onboarding skips Work IQ tooling |
| Agent user / notifications | Agent user account; **Frontier preview** tenant participation for the quickstart's AI teammate/mailbox/Teams presence path |
| SDK / CLI | SDK adds selected identity/tooling/notification integration to existing agents; CLI sets up identity/configuration, packages/publishes and can deploy; registration alone is not telemetry integration |
| Governance | Available admin inventory, Entra identity/access and security/compliance surfaces depend on tenant configuration, licenses and integration; no automatic application business-policy enforcement |

Agent 365 supports existing agents on Python, Node.js and .NET and different
hosting platforms. Choose [the integration option][developer] first; built-in
integration or registry sync might avoid an SDK solely for registration.
This demo's four analytical agents plus deterministic stages are local concepts;
they are **not four or six separate Entra Agent IDs**. One backend UAMI does not
prove agent-specific tenant identity.

## Admin-owned manual checklist (separate change request)

1. Name tenant, sponsor, accountable agent owner, purpose, data scope, permitted
   tools/models and lifecycle/retirement date. Confirm licensing and applicable
   privacy/AI obligations; choose standard agent S2S/OBO versus AI teammate.
2. Have authorized tenant administrators review [current quickstart][quickstart],
   identity model and [CLI reference][cli]. Confirm the Microsoft-managed Agent
   365 CLI enterprise app is available; a tenant-owned custom CLI app is only
   a documented fallback, **not an excuse to create secrets or bypass consent**.
3. Prepare an IT-approved blueprint and agent identity using the approved flow.
   Enumerate delegated/application permissions and grants at least privilege;
   perform consent review, Conditional Access/PIM review, sponsor ownership and
   access-review scheduling. This step changes tenant resources: do not automate
   it merely by running the Pernova deployment.
4. Add only required SDK capabilities. Keep standard agent S2S identity separate
   from Work IQ delegated requirements; do not claim mailbox/Teams notifications
   for a tenant outside Frontier preview. Any preview adoption needs ADR approval.
5. Instrument according to Agent 365's telemetry schema. Current Learn says a
   valid root **`invoke_agent`** span is needed for the surfaced run; HTTP 200 from
   export is **not visibility proof**. With no qualifying assigned license,
   telemetry can be dropped; without the root span, records may remain queryable
   in Defender advanced hunting but not appear in the expected agent surfaces.
   Ordinary local workflow spans or App Insights records are not Agent 365
   onboarding evidence.
6. Validate registration, token acquisition, allowed/denied tool scope and
   cross-hop trace correlation in the approved tenant. Record agent identity,
   blueprint version, owner, grant approvals and sanitized outcomes.
7. Where custom-agent publication is required, the current
   [publish guide][publish] describes `a365 publish` packaging manifest/icons and
   **manual Microsoft 365 admin center upload**, with Global Administrator for
   that upload step. Packaging success is not registration/instance/runtime proof.
   Verify actual catalog appearance and create/test an instance separately.
8. Demonstrate access revocation and ownership review; retire unused identity,
   permissions and deployment through approved change control.

No CLI/SDK install is needed for the local demo. If the admin later adopts .NET
tools, use a dedicated approved config with `<clear />` and only
`https://packagefeedproxy.microsoft.io/nuget/v3/index.json` (or an approved existing
Azure Artifacts feed), a researched/pinned version and the upstream
[package-feed standard][feeds]. Do not copy Learn's public-registry install
defaults or evade protected-feed screening.

## Suspension and evidence

Pernova's suspension/“kill switch” is **application-owned**: persist suspended
state, reject subsequent tool calls, invalidate unsafe approvals, record reason
and trace, investigate and require deliberate reactivation. APIM's static
allowlist does not consume the local suspension table.

Agent 365/Entra may govern inventory, permissions and supported access surfaces;
removing access is not a guaranteed instantaneous stop of arbitrary executing
application code or cancellation of an in-flight transaction. **There is no
native universal Agent 365 Pernova kill-switch claim.** Test revocation latency
and backend containment independently.

Until the checklist is completed, show Agent 365 as `not_connected`. A configured
endpoint or screenshot of a catalog is not E2E permission/telemetry evidence.

[quickstart]: https://learn.microsoft.com/en-us/microsoft-agent-365/developer/get-started
[developer]: https://learn.microsoft.com/en-us/microsoft-agent-365/developer/
[cli]: https://learn.microsoft.com/en-us/microsoft-agent-365/developer/agent-365-cli
[publish]: https://learn.microsoft.com/en-us/microsoft-agent-365/developer/publish
[feeds]: https://github.com/frkim/ai-coding-standards/blob/main/standards/development/package-feeds.md
