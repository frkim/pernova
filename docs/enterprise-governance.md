# Enterprise governance and evidence

This is a synthetic demo, **not certification, legal advice, or evidence that
Pernova is compliant**. Validate local control behavior with application tests;
validate cloud and tenant behavior separately. A document, checkbox or configured
endpoint does not prove operating effectiveness.

## Control state vocabulary

- **Local contract**: specified by `docs/api-contract.md`; runtime evidence comes
  from backend, UI and integration tests. Documentation alone does not certify it.
- **Template**: declared in `infra/`; offline build/lint only. Not deployed.
- **Unverified**: requires tenant, subscription, repository settings or enterprise
  procedures; the named owner must provide evidence.
- **Gap**: intentionally absent; must be resolved before enterprise use.

## Control matrix

| Risk/control | Local / template evidence | Enterprise gap and verification owner |
| --- | --- | --- |
| Identity spoofing | Loopback-only demo identity is not verified Entra; template validates Entra JWT and deletes `x-agent`; backend uses Reader/Operator/Approver/SecurityAdmin/Admin/Agent | IAM + backend: approved client/role grants and tests, gateway-only network, per-user/tenant object isolation (currently a shared demo workspace) |
| Excess tool authority | MCP server-side authenticated context; template per-client map/list filtering | Backend: exact agent mapping + argument/state tests; platform: external tool scopes/revocation |
| Unsafe transfer | Scenario + policy-bound approval; deterministic floors/cost/quantity; idempotent execution | Supply-chain owner: separation of duties, dual control if required, real SAP transactional adapter |
| Agent runaway | Bounded calls/tokens/cost and application suspension in local contract; template supplemental rates/quotas | Backend + on-call: suspension test, concurrent reservation, reviewed reactivation; not native Agent 365 shutdown |
| Unauthorized model | Application policy and APIM deployment allowlist | AI platform: approved model registry/version/region, provider usage reconciliation and evaluations |
| Prompt injection / PII | Synthetic negative presets and untrusted KB/tool boundary | Security + privacy: multilingual/adversarial evaluations, DLP, purpose limitation and data minimization; no general protection claim |
| KB access | Synthetic lexical corpus with provenance/citations | Data owner: source ACL security trimming, revocation and tenancy tests; Foundry IQ not connected |
| Trace / audit | Workflow trace/spans/events and JSON export contract; APIM W3C diagnostics template | Platform: live cross-hop trace, restricted evidence store, immutable/append-only audit and deletion/retention policy |
| Secrets / IAM | No committed credentials; two UAMIs declared | Platform: actual scoped roles, key-free inference, reviewed telemetry-key exception, Key Vault if new secrets needed |
| Network / availability | TLS public SPA shell/assets, Entra-protected APIs; single replica | Platform: verify exact static exclusions and unauthenticated API/MCP 401; private networking, WAF, zones, capacity, DR and durable shared store; no production SLO |
| Supply chain | Protected feed references, lockfile ownership, PR/CODEOWNERS templates | Repository owner: branch rules, CodeQL, push protection, Dependabot SLAs, signed/patched images/SBOM |
| Cost governance | Synthetic price label; bounded policy; required cost tags | FinOps: real rate card, budgets 50/80/100%, quotas/capacity, ingestion spend and monthly top-five review |
| Agent inventory | Local inventory owner/version/model/tool/state metadata | Agent 365 admin: actual registration, consent, licensing, access reviews, telemetry visibility tests |

## Indicative compliance mapping (not an assessment)

Use licensed standards and counsel to determine scope and applicable clauses.
The following is an evidence-planning map, **not a claim of conformity**:

| Framework | Relevant obligations/control families | Demo evidence candidates | Missing enterprise evidence |
| --- | --- | --- | --- |
| ISO/IEC 27001:2022 | A.5.9 inventory; A.5.15–18 access/identity; A.8.15–16 logging/monitoring; A.8.25–28 secure development | Agent catalog, threat model, role tests, trace/export, reviewed IaC/PR | ISMS scope, risk treatment/SoA, access reviews, incident records, audit results and independent certification |
| GDPR | Art.5 minimization/purpose/storage limitation; 25 privacy by design; 32 security; 30 processing records; 35 DPIA where required | Synthetic-only policy, redaction/retention design, access-denial tests | Lawful basis, controller/processor roles, DPA/transfer safeguards, DSAR/deletion workflow and DPIA decision |
| EU AI Act | Classification and actor duties; Art.4 AI literacy; transparency obligations where applicable; high-risk obligations only if legally in scope | Human approval, explicable deterministic scoring, provenance, inventory/evaluation plan | Counsel-led use-case/provider/deployer classification, applicable phase/date, technical documentation, oversight/logging/conformity duties if relevant |

A supply-chain demo is **not automatically high-risk** under the EU AI Act.
Do not infer regulatory status from the use of agents, Azure or Microsoft services.
Reassess if the purpose, users, affected persons, automation or deployment changes.

## Roles and accountability

- **Business approver**: examines eligible scenario, floors, country, quantities,
  cost and reason; can reject without executing. Approval is not a blanket grant.
- **AI/model owner**: approves deployments and evaluations; owns synthetic price
  assumptions; cannot self-approve a business action solely through a prompt.
- **Security/IAM owner**: roles, tool permissions, threat model, incident containment
  and periodic access reviews.
- **Platform/on-call**: IaC, observability, availability/DR and tested recovery.
- **Data/privacy owner**: classification, source ACLs, purpose/residency/retention.
- **Repository owner `@frkim`**: review settings and disclosure channel validation.

Quarterly access reviews and least-privilege group assignments are enterprise
requirements, not accomplished by checked-in CODEOWNERS. A real owner must accept
each exception and close or renew it before connected deployment.

## Evidence bundle

For each rehearsal retain a sanitized workflow export with trace ID, preset,
policy revision, scenario ID, model deployment, source IDs/versions, tool
decisions, approval reason/outcome, idempotency key and synthetic cost label.
Attach application test result/commit, Bicep build/lint result and signed-off
negative probes separately. Do not export JWTs, prompts containing PII or secrets.

Cloud evidence adds deployment/what-if review, Entra/IAM roles, APIM policy
revision, actual usage, query results, Agent 365 inventory/owner and access-review
results. Store evidence in an approved restricted location; local JSON export is
not tamper-proof evidence storage. Demonstration reset removes disposable state;
enterprise deletion/retention must cover backups, telemetry and source caches.

## Repository controls requiring verification

No repository settings are changed by these artifacts. Owner must verify PR approval,
stale-review dismissal, required lint/build/test/CodeQL checks, no force pushes,
secret scanning/push protection, private vulnerability reporting, Dependabot and
critical/high remediation (7/30 days), plus release SBOM. CI must remain
OIDC-only for approved deployment and actions pinned to full reviewed commit SHAs.
Use the upstream [compliance checklist][checklist] and record Pass / Fail /
Exception / N/A / Unverified with evidence; do not mark the whole repository Pass
because this matrix exists.

[checklist]: https://github.com/frkim/ai-coding-standards/blob/main/standards/compliance/compliance-checklist.md
