# Pernova · Supply Chain Disruption Manager

A control tower to **anticipate disruption, orchestrate agents and control every
decision**. This synthetic demonstration covers business value, human approval,
model and MCP tool governance, tracing, knowledge retrieval and cost controls.
The demonstration UI is in French.

## Run locally

Install **Node.js 24 LTS**, **Python 3.13**, **uv** and npm.
Dependencies are locked and restored exclusively through Microsoft CFS
[protected package feeds](https://github.com/frkim/ai-coding-standards/blob/main/standards/development/package-feeds.md).
The repository includes `.npmrc`, `pip.conf` and uv index configuration.

```powershell
npm ci
npm run setup
npm run dev
```

Open **http://127.0.0.1:5173** after the API reports `Application startup complete`.
The API listens at http://127.0.0.1:8000, with generated documentation at
http://127.0.0.1:8000/api/docs.
Start a nominal analysis, inspect traces, compare scenarios, then approve or
reject the synthetic transfer. Negative presets demonstrate policy denials and
agent suspension.

Local mode needs **no Azure subscription, secret, paid LLM call, SAP access or
Agent 365 tenant**. Business data, agent responses and costs are synthetic.
The application implements the controls, authorization, calculations, approvals,
persistent local journal and traces.
“Configured” never means cloud connectivity has been verified.

## Features

| Surface | Experience |
| --- | --- |
| Control Tower | Logistics incident, workflow and business impact |
| Agents and traces | Parallel analyses, tool calls and correlated span tree |
| Comparison | Weighted criteria, stock constraints and human decision |
| Governance | Agent/model inventory, MCP policy, suspension and integrations |
| Knowledge | Document search, classification and source citations |
| FinOps | Tokens, estimated costs, budgets and control decisions |
| Audit | JSON evidence export for a workflow and its decision |

The European route map uses bundled public-domain Natural Earth country contours
in a Mercator projection, without external tiles or a mapping service.
Paris, Brussels, Madrid and Rotterdam are illustrative geographic landmarks,
not verified Pernova facilities; sourcing routes remain synthetic options.
Directional motion highlights the selected route, with a pause control and
automatic suspension offscreen, in hidden tabs, or when reduced motion is enabled.

Azure integration targets **Microsoft Foundry (new/v2), Azure API Management,
Application Insights/Azure Monitor and Agent 365**.
Inference uses the OpenAI v1 Responses API; project operations, if added, must
use `azure-ai-projects` 2.x rather than classic SDKs or Assistants.
Tenant capabilities, enterprise authentication and cloud controls require
separate configuration and runtime verification.
This application is **neither compliance certification nor a production planning system**.

## Validate

```powershell
npm run lint
npm run build
npm test
npx --no-install playwright install chromium
npm run test:e2e
```

`npm run check:feeds` verifies both npm lockfiles and the Python lockfile.
`npm run check:standards` rejects mutable CI action pins, workflow-wide elevated
permissions and legacy Foundry source/dependencies. Both run as part of lint in CI.
These checks prevent specific regressions; they do not certify every convention.
After npm dependency changes, `npm run feeds:normalize` replaces only known CFS
backing-feed URLs with Microsoft proxy URLs, without changing versions or integrity.
The Python lock retains downloads explicitly advertised by the CFS index from
its exact approved Azure Artifacts backing feed.
Chromium is a Playwright test runtime, not an npm package.

E2E starts its own servers and refuses to reuse an unknown running application.
If the default ports are busy, run with free loopback ports instead of stopping
another session's processes:

```powershell
$env:PERNOVA_E2E_API_PORT = '18000'
$env:PERNOVA_E2E_WEB_PORT = '15173'
npm run test:e2e
```

## Deploy and get help

Read the [deployment guide](docs/deployment.md) before considering Azure deployment.
The checked-in templates are undeployed; subscription, region and deployment approval
must be supplied separately. No production readiness is implied.
See the [standards assessment](docs/standards-compliance.md) for verified gaps and exceptions.
For setup problems, use the repository's [issue templates](https://github.com/frkim/pernova/issues/new/choose).
Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Repository layout

```text
backend/         FastAPI, orchestration, policies, synthetic data and tests
frontend/        React / TypeScript / Material UI control tower
infra/           Infrastructure and Azure API Management policies
docs/            Architecture, boundaries, governance and demonstration guide
tests/e2e/       HTTP and browser Playwright journeys
scripts/         Protected-feed and standards checks used locally and in CI
```

- [Original brief](docs/supply-chain-disruption-manager.md)
- [API contract and business invariants](docs/api-contract.md)
- [Audience guides: demonstration, security, Agent 365, architecture and deployment](docs/README.md)
- [Azure preparation plan](.azure/deployment-plan.md)

Local state and test artifacts are ignored by Git.
See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution rules. MIT license.
