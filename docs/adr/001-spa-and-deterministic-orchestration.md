# ADR 001: Vite React + MUI SPA with separate FastAPI

- Status: accepted for the bounded synthetic demo by implementation scope.
- Date: 2026-11-06. Review: before connected release or 2026-12-06.
- Decision owner: application/architecture owner; no enterprise architecture sign-off implied.

## Context and decision

The coding standard defaults to Next.js or Vue with Material UI; the original
brief suggested React/Fluent UI. Use **Vite + React + TypeScript + MUI** with a
separate FastAPI API. This control tower is a client-side operational SPA, not an
SSR/SEO application. The root image builds statics and serves same origin.
MUI follows the coding-standard design system; avoid a second component kit.

Four analytical agents are simulated; scoring, constraints, authorization and
execution are deterministic. This is not proof of Foundry-hosted orchestration.
Optional connected inference uses **Foundry NEW Responses API**, never Assistants
or classic SDKs; adding project/hosted-agent features requires separate review.

## WAF and alternatives

| Pillar | Consequence |
| --- | --- |
| Security (primary) | API owns validation/authorization; no LLM authority. Optional MSAL popup/silent memory-only token client is implemented; tenant roles/scopes/redirect and browser tests remain unverified |
| Reliability | Fewer runtime components locally; backend/state remain single points of failure |
| Performance efficiency | Small static delivery; no SSR overhead, but client rendering/bundle must be measured |
| Cost optimization | One disposable app image; avoid unnecessary hosting/platform dependencies |
| Operational excellence | Separate API contract and frontend build; root image combines packaging with E2E validation. Vite proxy is local development, not deployment auth |

Next.js would provide server rendering/BFF capabilities at added framework/runtime
complexity; adopt if enterprise session/auth/SSR requirements justify it. This
exception expires at review; do not use it to waive accessibility, themes,
table navigation, quality gates or identity requirements.
