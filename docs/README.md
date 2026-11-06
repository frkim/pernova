# Pernova enterprise demo documentation

Start with the [original brief](supply-chain-disruption-manager.md), binding
[API contract](api-contract.md) and [implementation plan](../.azure/deployment-plan.md).
The brief is a target narrative; the contract and implementation status determine
what can actually be demonstrated.

| Audience / task | Guide |
| --- | --- |
| Presenter, supply chain, executive sponsor | [10–15 minute storyline and reset/recovery](operations-runbook.md) |
| Platform / Azure deployment owner | [Bounded deployment and explicit production gaps](deployment.md) |
| Security / threat review | [Threat model](threat-model.md), [gateway/MCP/model/KB controls](gateway-controls.md) |
| Enterprise governance / privacy / FinOps | [Control and compliance evidence matrix](enterprise-governance.md) |
| Tenant / IAM / Agent 365 owner | [Actual registration, access and capability prerequisites](agent-365-onboarding.md) |
| Architecture review | ADR [SPA](adr/001-spa-and-deterministic-orchestration.md), [SQLite/contract](adr/002-local-persistence-and-contract.md), [previews](adr/003-preview-and-connected-capability-gates.md), [telemetry/ingress exceptions](adr/004-telemetry-and-demo-topology-exceptions.md) |
| Implementer / reviewer | [Authoritative Learn and coding-standards research](microsoft-guidance.md), [infrastructure validation](validation-infra-governance.md) |
| Standards / repository owner | [Upstream standards assessment, corrections and unresolved gates](standards-compliance.md) |

**Truth labels:** local synthetic behavior ≠ verified Entra; configured ≠ connected;
template ≠ deployed; lexical fixture search ≠ source-ACL retrieval/Foundry IQ;
application suspension ≠ universal native Agent 365 shutdown; synthetic price
estimates ≠ real Azure pricing; compliance mapping ≠ certification.

No subscription or region has been selected. Cloud deployment and tenant access
changes require separate explicit approval.
