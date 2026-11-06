# Authoritative Microsoft research ledger

Checked **2026-11-06** against Microsoft Learn using public Learn search/article
retrieval. The bounded standards-alignment follow-up also successfully used
Microsoft Learn MCP search, full SDK-overview retrieval and Python code-sample
search for Foundry v2. Earlier MCP initialization failures do not describe that
successful follow-up. These are service/feature
references, not proof that Pernova has connected or licensed them. Recheck before
deployment because tenant capability, region availability and previews evolve.

| Source | Finding applied to this demo |
| --- | --- |
| [APIM AI gateway](https://learn.microsoft.com/en-us/azure/api-management/genai-gateway-capabilities) | Gateway governance covers compatible LLM APIs and MCP; an APIM resource alone is not policy/evaluation evidence |
| [Validate Entra token](https://learn.microsoft.com/en-us/azure/api-management/validate-azure-ad-token-policy) | Tenant/audience/client/claim validation; caller authority comes from validated token |
| [Rate limit by key](https://learn.microsoft.com/en-us/azure/api-management/rate-limit-by-key-policy) | Per-key throttling; use authenticated identity, not caller `x-agent` or a shared IP as agent identity |
| [LLM token limit](https://learn.microsoft.com/en-us/azure/api-management/llm-token-limit-policy) | **Responses API supported** in current guidance; classic/v2 gateway support, no Consumption tier listed; counting from returned usage, estimation/streaming/concurrency limitations |
| [Validate content](https://learn.microsoft.com/en-us/azure/api-management/validate-content-policy) | JSON format/content-type/size validation before preserved JObject model/tool checks |
| [LLM content safety](https://learn.microsoft.com/en-us/azure/api-management/llm-content-safety-policy) | Separate content-safety integration/configuration needed; not attached or called “PII prevention” here |
| [MCP overview](https://learn.microsoft.com/en-us/azure/api-management/mcp-server-overview), [secure MCP](https://learn.microsoft.com/en-us/azure/api-management/secure-mcp-servers) | APIM-native MCP exposure/governance exists; this demo instead proxies bounded local JSON-RPC, explicitly not full native transport/discovery |
| [APIM CORS](https://learn.microsoft.com/en-us/azure/api-management/cors-policy) | Opt-in exact origins and bearer headers; preflight must precede JWT enforcement. No wildcard credentials or tenant grants |
| [APIM managed identity](https://learn.microsoft.com/en-us/azure/api-management/api-management-howto-use-managed-service-identity) | UAMI authentication requires actual data-plane authorization; declare identity without invented resource grants |
| [Foundry SDK/endpoints](https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/sdk-overview) | New project endpoint and resource OpenAI v1 have different purposes; MI, narrow Foundry roles; no classic SDK |
| [Foundry v2 SDK overview (full article retrieved 2026-11-06)](https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/sdk-overview) | Current table: stable Python project SDK 2.x, `azure-ai-projects>=2.3.0`, and `openai>=3.0.0` for project samples; choose/pin a current stable CFS release when adding project operations. No project SDK needed for the existing inference-only adapter |
| [Responses API](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses) | Standard v1 Responses inference, deployed model names, Entra scope `https://ai.azure.com/.default`, region/model compatibility; API not Assistants |
| [Agent 365 developer](https://learn.microsoft.com/en-us/microsoft-agent-365/developer/), [existing-agent quickstart](https://learn.microsoft.com/en-us/microsoft-agent-365/developer/get-started) | Registration, chosen capabilities and validation are distinct; exact current licenses/roles, Work IQ preview, Frontier-only teammate path |
| [Agent 365 CLI](https://learn.microsoft.com/en-us/microsoft-agent-365/developer/agent-365-cli), [publish](https://learn.microsoft.com/en-us/microsoft-agent-365/developer/publish) | CLI can mutate tenant/cloud resources; publication includes manual admin-center upload, not automatic connected runtime |
| [Container Apps authentication](https://learn.microsoft.com/en-us/azure/container-apps/authentication), [Entra provider](https://learn.microsoft.com/en-us/azure/container-apps/authentication-entra) | Easy Auth protects ingress; existing registration and actual client bearer flow required |
| [ACA auth-config schema](https://learn.microsoft.com/en-us/azure/templates/microsoft.app/containerapps/authconfigs), [Easy Auth path configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-authentication-file-based) | ACA supports excludedPaths; shared Easy Auth reference explicitly illustrates `/path3/subpath/*`. Public shell/asset exclusions permit MSAL bootstrap, never anonymous API/MCP; exact ACA runtime matching still requires target tests |
| [MSAL browser caching](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching), [popup sign-in](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/login-user), [token acquisition](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/acquire-token), [redirect URI](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url) | Optional SPA uses popup + acquireTokenSilent and memoryStorage; exact registered redirect/delegated scope/roles and actual tenant tests are separate requirements |
| [Container Apps observability](https://learn.microsoft.com/en-us/azure/container-apps/observability) | Platform logs versus application traces are separate |
| [OpenTelemetry in App Insights](https://learn.microsoft.com/en-us/azure/azure-monitor/app/opentelemetry-enable), [APIM/App Insights](https://learn.microsoft.com/en-us/azure/api-management/api-management-howto-app-insights) | Exporter/logger/diagnostics/correlation need configuration; no body logging; ordinary OTLP is not automatically Agent 365 telemetry |
| [Application Insights Entra authentication](https://learn.microsoft.com/en-us/azure/azure-monitor/app/azure-ad-authentication) | Application UAMI requires Monitoring Metrics Publisher at the target App Insights resource; managed-identity application export does not make APIM instrumentation-key diagnostics key-free |
| [WAF](https://learn.microsoft.com/en-us/azure/well-architected/), [Gatekeeper](https://learn.microsoft.com/en-us/azure/architecture/patterns/gatekeeper), [Circuit Breaker](https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker), [Compensating Transaction](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction) | Assess all five pillars and explicitly acknowledge private-backend, durability, budgets and DR gaps |

## Coding standards read

The following `frkim/ai-coding-standards` **main** documents were read, not merely
linked: [development](https://github.com/frkim/ai-coding-standards/blob/main/standards/development/development.md),
[package feeds](https://github.com/frkim/ai-coding-standards/blob/main/standards/development/package-feeds.md),
[security](https://github.com/frkim/ai-coding-standards/blob/main/standards/security/security.md),
[compliance checklist](https://github.com/frkim/ai-coding-standards/blob/main/standards/compliance/compliance-checklist.md),
[Azure](https://github.com/frkim/ai-coding-standards/blob/main/standards/azure/azure.md),
[GitHub](https://github.com/frkim/ai-coding-standards/blob/main/standards/github/github.md)
and [AGENTS template](https://github.com/frkim/ai-coding-standards/blob/main/templates/AGENTS.md).

The follow-up read the supplied full standards snapshot at commit
`8d3608f356ab44b46d04453261f5967610a1a41d`, including Azure, security,
compliance and architecture instructions. The bounded implementation and
checklist dispositions are recorded in [validation evidence](validation-infra-governance.md).
This is not a claim that every repository convention or connected control passed.
The Foundry route now requires both endpoint types and an explicit deployment
allowlist; the offline gate rejects legacy/query-bearing/mismatched endpoint
inputs. Neither a valid hostname nor the v2 SDK proves the account's resource
kind, disabled local authentication, region support, project parentage or IAM.

Protected CFS feeds are mandatory **before any restore**, including containers,
developer examples and future Agent 365 tooling. Preserve existing approved
Azure Artifacts feeds; do not fall back to a blocked public registry, proxy/VPN,
vendored downloads or unreviewed package sources. Missing packages require the
approved CFS exception process.

Canonical protected indexes/registries can advertise package downloads from an
exact CFS Azure Artifacts backing repository. This is not a public mirror:
retain only the specific reviewed backing-feed URLs allowed by repository checks,
not an unrestricted Azure Artifacts hostname allowlist. Registry/index configuration
must remain the approved canonical CFS endpoint.
