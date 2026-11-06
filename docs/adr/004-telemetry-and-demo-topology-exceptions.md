# ADR 004: demo telemetry and ingress exceptions

- Status: documented **demo exceptions**, not enterprise compliance approval.
- Date: 2026-11-06. Expiry: connected enterprise sign-off or 2026-12-06, whichever first.
- Approvers required at that gate: platform, security/IAM and data/privacy owners.

## Context

The undeployed synthetic-demo template combines a browser SPA, protected APIs,
APIM and application/platform telemetry without an approved enterprise target.
Its public ingress, platform ingestion authentication and ephemeral state differ
from the production baseline and require explicit, time-bounded treatment.

## Decision

### Limits

1. APIM has public HTTPS gateway; Container Apps has external ingress with a
   **public SPA shell/assets and Entra-protected business APIs**, not
   private/gateway-only networking. Easy Auth excludes exact `/`, `/theme.js`,
   `/favicon.svg`, the `/assets/*` prefix and the two health endpoints only.
   The shell must load before MSAL can obtain a bearer token. No `/api/*` or
   `/mcp` exclusion is permitted; `Return401` remains the default.
   Authorized callers can bypass
   gateway throttles by reaching backend directly. Backend must independently
   enforce business rules. Optional MSAL popup/silent token integration is
   implemented, but actual tenant redirect/scopes/roles and browser connectivity
   remain unverified. Easy Auth does not hand browser fetch the token expected by
   backend JWT validation. Same-origin API calls currently reach backend directly.
2. Platform diagnostics use supported Log Analytics shared-key integration for
   Container Apps logs and instrumentation-key ingestion for the APIM logger.
   References are resolved as resource properties in ARM, not committed or output.
   Application traces now use managed identity, but the complete telemetry
   topology is **not Entra-only**.
3. `applicationInsightsDisableLocalAuth=false` is the default compatible with
   the template's APIM logger. Switching it to true without a tested Entra
   ingestion path is not hardening evidence; it can break telemetry.
4. Application telemetry implements `AzureMonitorTraceExporter` through the pinned
   `azure-monitor-opentelemetry==1.8.12` dependency. Supplying
   `APPLICATIONINSIGHTS_CONNECTION_STRING` activates it and requires
   `AZURE_CLIENT_ID` for `ManagedIdentityCredential`; offline storage, Statsbeat,
   SDK stats and control-plane collection are disabled. OTLP remains available
   separately. The application UAMI needs **Monitoring Metrics Publisher** scoped
   to the target Application Insights resource; no grant is created here.
   Actual ingestion, redaction and cross-hop correlation remain unverified.
   Local spans/exporter configuration are not App Insights/Agent 365 visibility proof.
5. Single-instance, container-local SQLite and scale-to-zero are retained.
   **Demo RPO:** all synthetic history may be lost on restart/revision/scale-down;
   no recovery point is guaranteed. **Demo RTO:** manual restart/reseed, with no
   committed recovery-time objective or measured restore. No production RPO/RTO,
   backup, zone-redundancy or durable-data compliance is claimed. Managed durable
   storage, automated backups and measured restores require a separate approved
   design before enterprise use. No queue exists, so queue-depth alerting is
   inapplicable until one is introduced.

## Consequences

### Standards disposition and expiry

SEC-02 and AZ-06 remain partially unverified because platform logging still uses
key-based ingestion; the scoped exception above expires at the existing date,
not indefinitely. AZ-05 remains an explicit public-ingress/no-WAF deviation,
AZ-08 requires approved budget owners/amounts/50-80-100% notifications, and
API-08 / AZ-09 require durable state and a recovery design. These gaps cannot
be closed by changing an endpoint label, adding an unused vault or inventing a
subscription, recipient or region. Key Vault (AZ-04 / SEC-03) is not deployed
because this template accepts no application secrets; any later secret
integration must use an RBAC vault with soft delete and purge protection.
This ADR documents constraints; it does not waive blocking standards or
authorize deployment. Platform/security/privacy owners must close or explicitly
renew each exception before 2026-12-06, and before connected enterprise sign-off.

### WAF trade-offs

| Pillar | Trade-off |
| --- | --- |
| Operational excellence (primary) | Application Azure Monitor exporter implemented; platform logging and live ingestion/cross-hop evidence still require verification |
| Security | Public shell/configuration only, Entra-protected APIs and UAMI application export; key-based platform ingestion and direct API ingress remain explicit exceptions |
| Reliability | Diagnostic integration assists investigation, but no alert/automatic suspension/DR claim |
| Performance efficiency | 100% APIM trace sampling for small rehearsal; production sampling and exporter queues need measurement |
| Cost optimization | Short retention/disposable resources; APIM fixed and telemetry ingestion costs still need real budgets |

### Closure

Require a tested browser token/BFF flow, approved private gateway-only backend
topology/WAF, approved resource-scoped application ingestion role and live
ingestion/redaction/propagation tests, compatible platform authentication before
disabling local auth, alerts/on-call and FinOps acceptance.
Use the official [Container Apps auth][auth], [APIM diagnostics][apim] and
[Azure Monitor OTel][otel] guidance. The root image has non-root/pinned base
settings, but **Docker build/runtime remains unverified because the workstation
daemon is unavailable**. No exception permits committed secrets or fake evidence.

## Alternatives considered

- Provision private networking, WAF and durable managed state now: deferred
  because subscription, region, operational requirements and deployment approval
  have not been established.
- Disable all local telemetry authentication immediately: rejected until every
  platform ingestion path is proven compatible; otherwise diagnostics can fail.
- Treat the current topology as production-compliant or extend exceptions
  indefinitely: rejected; the recorded owners, closure evidence and expiry
  remain mandatory.

[auth]: https://learn.microsoft.com/en-us/azure/container-apps/authentication
[apim]: https://learn.microsoft.com/en-us/azure/api-management/api-management-howto-app-insights
[otel]: https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-enable
