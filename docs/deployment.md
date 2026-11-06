# Bounded Azure deployment

**Status: template only; no subscription or region selected, no cloud deployment,
no tenant consent or access changes.** Read [the plan](../.azure/deployment-plan.md)
and [binding API contract](api-contract.md) first. The original brief describes a
target experience, not connected services.

## Preconditions requiring a separate approval

The sponsor, platform owner and security owner must choose the subscription,
resource group, region, budget, identity owners and data residency. Before any
production design, agree availability/load, RTO/RPO, compliance scope, on-call
capabilities, retention, external integrations and authorized caller groups.
There are deliberately **no assumed production SLOs or multi-region promises**.
Only an isolated, disposable, synthetic demonstration is in scope now.

## What the Bicep actually declares

| Artifact | Configuration and consequence |
| --- | --- |
| `infra/main.bicep` | Resource-group scope; Container Apps environment/app, two user-assigned identities, Log Analytics, workspace-based Application Insights, APIM and diagnostics |
| Container Apps | TLS external ingress on port 8000; public SPA shell/assets and health, Easy Auth Entra bearer protection for APIs; one replica maximum, scale to zero |
| State | Ephemeral container-local SQLite; restart/revision/scale-to-zero can lose history. No database, durable volume, backup or HA is declared |
| Identities | Distinct backend and gateway UAMIs; no Entra registrations, Graph consent, app-role assignments, Azure role assignments or broad Contributor grants |
| APIM | Public HTTPS policy authority; Developer tier is a disposable demo choice, **not a production SLA**; subscription keys not used |
| Telemetry | Log Analytics 30-day default, APIM gateway logs + W3C App Insights diagnostics with zero body logging; application exporter still needs integration verification |
| Existing Foundry | Optional OpenAI v1 URL + project URL + deployment allowlist; creates no Foundry resource/project/model/hosted agent |

This is the [Gatekeeper pattern][gatekeeper] with an important limitation:
Direct Container Apps API ingress remains Entra-protected but reachable, so an authorized
caller can bypass APIM rate/model/tool controls if the backend exposes equivalent
routes. The backend must enforce every business rule independently. **Before
enterprise deployment, make backend ingress private and integrate APIM networking
using a supported SKU/topology; authenticate gateway-to-backend and preserve
validated end-user context.** Easy Auth alone does not prove gateway-only access.
Do not describe this demo topology as private or fully zero-trust production.

## Identity contract and route table

Use an existing single-tenant API app configured to issue **v2 access tokens**.
`apiAudience` is the exact `aud`, not a guessed URI; set it consistently in backend
and Easy Auth. APIM validates Entra signature/issuer/tenant, audience, expiry and
`ver=2.0`. The existing app must define and grant these app roles under approved
tenant administration; Bicep does not do so:

| APIM route | Caller and claims | Backend mapping |
| --- | --- | --- |
| `/pernova/api/...` | Approved `azp` plus any of `Reader`, `Operator`, `Approver`, `SecurityAdmin`, `Admin` | Forwards `/api/...`; backend enforces endpoint roles and scenario/revision approval; workflows are a shared demo workspace, not per-caller isolated |
| `/pernova/health/live`, `/health/ready` | Same APIM user checks | Direct backend health is unauthenticated; return no secrets/config |
| `/pernova-mcp/` POST | Approved agent workload `azp`, `Agent`, nonempty per-client tool allowlist | Forwards `/mcp`; backend resolves the caller's client ID via `PERNOVA_AGENT_CLIENTS_JSON`, never arguments or `x-agent` |
| `/pernova-models/openai/v1/responses` POST | Backend UAMI `azp` and custom API-app role `Inference` | APIM-only role check; gateway replaces Authorization with its own UAMI token for existing Foundry |

Backend endpoint roles in `backend/app/main.py` are:

- Read/bootstrap/history/events/export/knowledge: `Reader`, `Operator`, `Approver`,
  `SecurityAdmin` or `Admin`.
- Start/rescore workflows: `Operator` or `Admin`.
- **Approve or reject** workflows: `Approver` or `Admin`.
- Agent suspension/reactivation and policy updates: `SecurityAdmin` or `Admin`.
- A caller mapped as `Agent` cannot use the human control endpoints, even with
  additional human roles. Local `/mcp` permits authenticated human read-only
  tools; the deployed APIM MCP facade deliberately permits **Agent workloads only**.

There is no per-user workflow ownership in this implementation.
Do not grant extra roles to make a demonstration work: any tenant grant requires
separate IAM approval. `Inference` authorizes only the gateway model operation;
it is not among the backend's accepted inbound API roles.

The control wildcard rejects paths outside `/api/` and the two health endpoints,
so `/pernova/mcp` cannot bypass MCP policy. Static assets/root UI are not exposed
by these APIM operations. The single image serves a **public SPA shell** at the
backend URL so a browser can load MSAL before obtaining a token. Easy Auth
`excludedPaths` contains only `/`, `/assets/*`, `/theme.js`, `/favicon.svg` and the
two health paths. Root `/` is exact, **not `/*`**. `/api/*` and `/mcp` are never
excluded: enabled Easy Auth retains `Return401` for unauthenticated requests, and
the backend independently enforces JWT/role authorization. Public assets contain
JS/CSS and public application configuration, **not business data or secrets**.
Do not embed workflow/KB data in the bundle or widen exclusions for sign-in.

The [ACA auth-config schema][aca-auth-config] exposes `globalValidation.excludedPaths`;
the [shared Easy Auth reference][easy-auth-paths] explicitly illustrates a
subpath wildcard `/path3/subpath/*`, the syntax used for `/assets/*`. This is
documented syntax, **not a live ACA verification**. On the approved target,
verify anonymous shell/assets load while API/MCP calls return 401. If the
platform does not honor the required exact/prefix behavior, use a separately
approved public static host; never set global `AllowAnonymous` or exclude APIs
to make sign-in work. Cross-origin API access still requires **explicit approved
CORS origins** at APIM/backend and a browser Entra bearer-token flow.

**Optional connected-browser authentication is implemented** in
`frontend/src/auth.ts`: MSAL popup sign-in, `acquireTokenSilent` and memory-only
cache, gated by the three build-time settings below. API fetches acquire and
attach the real bearer token; authenticated streaming has an explicit
stream/polling path rather than relying on an unauthenticated EventSource.
This is **not tenant connectivity evidence**. Entra app registration, exact SPA
redirect URI, delegated API scope, role assignments/consent and actual browser
connectivity remain unverified. ACA Easy Auth does **not** supply that bearer
token to browser fetch automatically, and its session is not a substitute for
the backend's independent JWT validation.

| Frontend build-time variable | Required approved configuration |
| --- | --- |
| `VITE_ENTRA_TENANT_ID` | Existing tenant GUID; used for the Microsoft login authority |
| `VITE_ENTRA_CLIENT_ID` | Existing **SPA** client GUID, distinct from the backend API application/managed identity |
| `VITE_ENTRA_API_SCOPE` | Existing **delegated** API scope authorized for the SPA, e.g. `api://<approved-api-app-client-id>/<approved-delegated-scope>`; not the managed identity's `PERNOVA_APIM_SCOPE` `/.default` flow |

Set all three when building the Vite bundle; missing/invalid partial configuration
fails closed, while all absent retains local demo behavior. These are public
configuration values, **not secrets**. `backendEnvironment` or changing Container
Apps runtime variables does not retroactively alter built frontend statics.
Use the reviewed image-build configuration to supply them and rebuild/release
the immutable image. The registered SPA redirect and post-logout URI must match
`window.location.origin`. With a memory-only cache, page refresh loses the
in-memory session; reauthenticate deliberately, never paste tokens into storage.

**Current API routing is same-origin `/api/...`**, not a configurable remote
APIM base URL. A bundle served by Container Apps therefore calls that protected
backend directly; this does not put browser business APIs behind APIM.
To require APIM for those calls, implement and test an approved same-origin
reverse-proxy/route mapping to `/pernova/api/...` or a separately reviewed client
routing design. This template does not serve the SPA through APIM, and Entra
authentication alone is not gateway-only networking.

For browser calls through APIM, set `allowedBrowserOrigins` to exact approved
HTTPS origins (`PERNOVA_BROWSER_ORIGINS_JSON` in the parameter file). The template
injects a CORS policy **before JWT validation**, handles preflight, allows
GET/POST/PUT with Authorization, Content-Type and traceparent, and exposes
X-Correlation-ID/Retry-After with credentials disabled. Empty origins inject no
CORS policy and enable no cross-origin browser support. Configure the **same
origins** in backend `PERNOVA_ALLOWED_ORIGINS`; no wildcard or tenant grant is added.
Backend CORS separately allows GET/POST/PUT/OPTIONS and Authorization/Content-Type.
The backend's connected-mode CSP now explicitly allows the Entra login origin
for connect/frame operations; demo CSP stays local. A **different APIM origin**
still needs a reviewed CSP/routing change; merely enabling CORS does not change
the SPA's request URLs or CSP.

MCP and control preserve the original bearer token to allow independent backend
validation. Spoofable `x-agent`, `x-agent-id` and `x-ms-client-principal` headers are
deleted. Do not rely on injected identity headers without a protected proxy
boundary. Never forward a user token to Foundry; the gateway uses its UAMI.

## Parameters and exact backend configuration

`infra/main.demo.bicepparam` reads approved values from environment variables and
fails when required values are absent. It contains no invented GUIDs, resource IDs,
endpoints, credentials or model deployments. `mcpClientToolAllowlist={}` and
`allowedModelDeployments=[]` deny by default. JSON named values are stored as
**base64-encoded UTF-8 JSON**, not encrypted secrets, to avoid unsafe C# string
substitution. Modify them only through reviewed IaC.

Required parameter inputs: region, owner, cost center, immutable image, tenant/API
app/audience, approved client IDs, backend environment array, APIM contact.
Optional inputs: approved registry, existing Foundry resource v1 endpoint and
project endpoint, model deployments, browser origins and agent-client-to-tool allowlist.

The root Dockerfile builds Vite frontend statics into the FastAPI image.
Local dev is Vite `127.0.0.1:5173`
and FastAPI `127.0.0.1:8000`; backend dependency source is
`backend/pyproject.toml` + `backend/uv.lock`. No duplicate Dockerfile or package
restore instructions are introduced here.

The image uses immutable Node 24/Python 3.13 multi-stage base-image digests,
CFS-backed pip/uv, non-root UID/GID 10001 and writable `/app/data`, with
`frontend/dist` included and uvicorn on port 8000. **The workstation Docker daemon
is unavailable: the image has not been built or runtime-tested on this workstation.**

`backendEnvironment` is an explicit array of `{name, value}` entries read from
`PERNOVA_BACKEND_ENV_JSON`. These are the **actual** `Config.from_env` names:

| Environment variable | Local default / required connected value |
| --- | --- |
| `PERNOVA_MODE` | `demo`; explicitly set **`connected`** for Azure. Demo rejects non-loopback hosts/peers, including remote proxy callers |
| `PERNOVA_DATA_DIR` | Config defaults to `backend/data` relative to the installed backend source; the root non-root image sets **`/app/data`**. Preserve that writable path. Database is `pernova.sqlite3`; storage remains ephemeral |
| `PERNOVA_STEP_DELAY_SECONDS` | `0.8`; finite range 0..3, demonstration pacing only |
| `PERNOVA_ALLOWED_HOSTS` | CSV `localhost,127.0.0.1,[::1]`; connected: exact Container Apps/custom backend hostnames, **plus `localhost` for ACA probes and `127.0.0.1` for the image healthcheck**. No schemes, ports or wildcards. Resolve the real FQDN from the approved environment; stage app configuration if needed |
| `PERNOVA_ALLOWED_ORIGINS` | Loopback origins on ports 5173/8000 by default; connected: explicit **HTTPS** browser origins as CSV, matching APIM `allowedBrowserOrigins`. Origins have no path/query/fragment/userinfo |
| `PERNOVA_JWT_ISSUER` | Empty; connected: exact existing Entra issuer, normally `https://login.microsoftonline.com/<approved-tenant-id>/v2.0` |
| `PERNOVA_JWT_AUDIENCE` | Empty; connected: exact token `aud`, identical to Bicep `apiAudience`/Easy Auth |
| `PERNOVA_JWT_JWKS_URL` | Empty; connected Entra: approved tenant HTTPS discovery keys URL, normally `https://login.microsoftonline.com/<approved-tenant-id>/discovery/v2.0/keys` |
| `PERNOVA_JWT_PUBLIC_KEY_FILE` | Empty; optional trusted RSA public-key file for isolated verification tests. Cloud Entra deployments should use tenant JWKS/rotation, not a stale copied signing key |
| `PERNOVA_AGENT_CLIENTS_JSON` | `{}`; JSON object mapping **verified client application IDs** (`azp`; backend also supports `appid`) to known local agent IDs. APIM accepts v2 `azp` only. Unknown/unmapped `Agent` callers are denied |
| `PERNOVA_APIM_RESPONSES_ENDPOINT` | Empty disables real inference; optional **`responsesBaseUrl` output**, ending `/pernova-models/openai/v1/`, HTTPS with no query/fragment/userinfo |
| `PERNOVA_APIM_SCOPE` | Empty; with inference: existing custom gateway API App ID URI **`/.default`** scope, e.g. `api://<approved-api-app-client-id>/.default`. Not the downstream Foundry scope; the scope URI and token audience are related but are not necessarily identical strings |
| `PERNOVA_MODEL_DEPLOYMENT` | Empty; with inference: exact approved deployment, also in APIM `allowedModelDeployments` **and the application policy's `allowed_models`** |
| `PERNOVA_MODEL_EUR_PER_TOKEN` | `0`; with inference: finite operator-supplied conservative rate **>0 and <=0.1**. Estimate, not current quote or verified invoice |
| `AZURE_CLIENT_ID` | Supplied by Bicep: backend UAMI client ID for `ManagedIdentityCredential`; do not override it in `backendEnvironment` |

JWT verification uses RS256 and requires exp/iss/aud/sub plus an accepted
roles array. `Reader`, `Operator`, `Approver`, `SecurityAdmin`, `Admin`, `Agent` are the exact
backend role strings. APIM additionally checks approved clients; the backend
does not separately allowlist human client IDs, so direct-ingress exposure remains
a gap. Backend role checks protect a **shared synthetic workspace**, not
per-user workflow/tenant data isolation.

Local interactive API documentation is **`/api/docs`**, with generated
`/api/openapi.json`, only in demo mode. `/docs` is not the documented endpoint;
both interactive documentation/schema routes are disabled in connected mode.

For MCP, keep `PERNOVA_AGENT_CLIENTS_JSON` and APIM `mcpClientToolAllowlist` aligned:
each approved client maps to one known agent and a tool subset of that agent's
server-owned registry. One shared UAMI is not separate identity for every logical
agent. External MCP supports the read/simulation tool schemas only:
`get_shipment`, `get_inventory`, `get_demand`, `simulate_route`, `search_knowledge`.
`create_stock_transfer` is **not** an external MCP tool, even for an execution
agent; business writes remain in the deterministic human-approved workflow.

Optional inference sends exactly `{model, input, instructions,
max_output_tokens:512, tools:[], store:false}` through the APIM base URL. The
gateway permits bounded string instructions and an **empty tools array only**,
never provider-side tool definitions/calls. Backend uses a 20-second request
timeout, zero SDK retries, a conservative 4,096-token reservation, usage/content/
completion checks and a configured cost estimate. Failure is closed, not silently
replaced with a successful local answer.

Outside `Config`, telemetry supports two optional export paths:

- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` activates the OTLP exporter; review that
  endpoint's transport/auth/collector separately.
- `APPLICATIONINSIGHTS_CONNECTION_STRING` activates the actual
  `AzureMonitorTraceExporter`, using `ManagedIdentityCredential` with required
  `AZURE_CLIENT_ID`. The backend pins `azure-monitor-opentelemetry==1.8.12`;
  offline telemetry storage, Statsbeat, SDK stats and control-plane collection
  are disabled. The template supplies both application settings. Configuring
  both export paths enables both processors, so review duplicate destinations
  and ingestion cost deliberately.

The application UAMI requires **Monitoring Metrics Publisher** scoped to the
target Application Insights resource for Entra-authenticated telemetry ingestion;
despite its name, that role covers telemetry, not only metrics. See
[Application Insights Entra authentication][ingestion-auth]. This template does
**not** assign that role. The IAM owner must approve and implement the
resource-scoped grant separately, then run a synthetic workflow and verify its
trace ID and sanitized spans arrive in the intended resource. Exporter
configuration is not proof of authorization, ingestion or cross-hop correlation.
Neither exporter registers the application with Agent 365.

The template supplies `AZURE_CLIENT_ID` and
`APPLICATIONINSIGHTS_CONNECTION_STRING`. Do not duplicate/override these keys.
Connected inference will not work until the backend UAMI has the existing API
app's **`Inference`** application role, the API issues v2 tokens, and the APIM UAMI has
the least-privilege **Foundry role appropriate to the selected endpoint scope**.
Validate data-plane permission for the chosen resource/project; do not assume a
project-only role authorizes resource-level `/openai/v1`. The platform IAM owner
must implement approved, resource-scoped grants in the deployment pipeline.
There is no automatic role/grant or tenant login in this template.

Bootstrap status is intentionally conservative: SAP/Fabric simulator and MCP are
`local`; Foundry/APIM become `configured` only when optional inference is supplied;
Entra becomes `configured` in connected mode; Monitor becomes `configured` when
either export path is configured; Agent 365 stays `not_connected`. Neither `connected`
mode nor `configured` status proves a provider request, ingestion or tenant registration.

Use a **Foundry NEW** resource (`kind=AIServices`, `allowProjectManagement=true`)
and project with `disableLocalAuth=true`. Copy its actual v1 and project endpoints.
The OpenAI v1 resource route documented by Learn can use the
`<resource>.openai.azure.com` hostname even for a new Foundry resource; hostname
alone does not establish that the resource is classic. The project endpoint is
`https://<resource>.services.ai.azure.com/api/projects/<project>`.
No classic SDK, Assistants, threads/runs or monthly inference `api-version`.
For project features use `azure-ai-projects` **2.x**; simple inference can use
OpenAI Responses over REST or the standard `OpenAI` client.

## Offline validation (safe now)

Run from the repository root with the **already installed** CLI:

```powershell
az bicep lint --file infra\main.bicep
az bicep build --file infra\main.bicep --stdout
python -m unittest discover -s infra/tests -v
```

Do not install/upgrade tools, choose a subscription, log in, run `validate`,
`what-if` or deploy as part of this implementation. Build does not validate APIM
expression compilation, Entra roles, region/SKU availability, quotas, diagnostic
categories, image pull, Easy Auth behavior or network connectivity.

The standard-library artifact tests check auth/claim declarations, named-value
references, explicit schema wiring, bounded options, identity/header controls and
demo topology limitations. They are static regression checks, **not live APIM
policy-expression or Entra authorization tests**.

After **separate cloud approval**, the platform owner uses a protected OIDC
pipeline to validate and review what-if against the approved target, then deploy.
Production changes are IaC-only, with environment reviewers; no stored Azure
credentials. Review denial tests in [gateway controls](gateway-controls.md) before
marking any integration connected.

## Explicit deployment gaps

- Non-root, immutable, patched image and writable state path: root image settings;
  read-only-root support must be tested, not inferred from Bicep.
- APIM private backend connectivity, WAF/edge protection, least-privilege IAM,
  Entra group/app-role assignments and browser auth: not declared here.
- Application traces now have a UAMI-authenticated Azure Monitor exporter.
  The remaining application gates are its approved ingestion role and live
  ingestion/propagation/redaction tests, not missing exporter implementation.
- APIM diagnostics still use instrumentation-key ingestion, and ACA uses supported
  Log Analytics shared-key plumbing. These are platform template references,
  never outputs or committed credentials. Keep
  `applicationInsightsDisableLocalAuth=false` until **all** relevant platform
  ingestion paths are proven compatible with disabling local authentication;
  app managed identity support alone does not make the APIM logger key-free.
  See ADR 004.
- No durable state, zone redundancy, secondary region, failover, backups,
  telemetry alerts/action groups, budgets or tested restore is declared.
- Configure real subscription budgets at 50/80/100% and on-call alerts before
  cloud rehearsal; budgets are notifications, **not hard spend caps**.

## WAF trade-offs

| Decision / primary pillar | Security | Reliability | Performance efficiency | Cost optimization | Operational excellence |
| --- | --- | --- | --- | --- | --- |
| Public SPA + Entra-protected API + APIM / Security | Public static bundle only; API claims/tools fail closed; direct-ingress bypass remains | Two service dependencies | Extra hop/validation | APIM fixed cost | Versioned paths/policies; tenant setup still needed |
| One ephemeral replica / Cost | Synthetic-only data | No persistence guarantee or HA | No concurrent scale-out | Scale to zero | Simple reset; cold start and loss are expected |
| W3C traces / Operational excellence | Zero prompt/body/token logging | Enables diagnosis, not automatic recovery | Export overhead; sample production deliberately | Retention/ingestion must be budgeted | Correlation requires live verification |
| Optional existing Foundry / Cost | MI and approved model deployments | Local synthetic fallback must be labelled | Quota/latency determine capacity | Bounded calls; not exact spend guarantee | No speculative resource creation |

Patterns: [Gatekeeper][gatekeeper], [Circuit Breaker][circuit],
[Compensating Transaction][compensating]. Do not blindly retry a real
cross-country write; enterprise adapters need transactional idempotency and
compensation. See [ADRs](adr/002-local-persistence-and-contract.md).

[gatekeeper]: https://learn.microsoft.com/en-us/azure/architecture/patterns/gatekeeper
[circuit]: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
[compensating]: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
[ingestion-auth]: https://learn.microsoft.com/en-us/azure/azure-monitor/app/azure-ad-authentication
[aca-auth-config]: https://learn.microsoft.com/en-us/azure/templates/microsoft.app/containerapps/authconfigs
[easy-auth-paths]: https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-file-based
