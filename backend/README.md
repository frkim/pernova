# Backend operational conventions

The [binding API contract](../docs/api-contract.md) remains authoritative:
`/api` paths, snake_case, limit/offset workflow history, and
`{detail, correlation_id}` errors are intentional ADR 002 exceptions to the
generic upstream API conventions. This remains a single-process synthetic
workspace backed by SQLite, not a production multitenant service.

## Diagnostics and configuration

Boundary logs are JSON with UTC `timestamp`, `level`, `event` and a server-generated
`correlation_id`. Request completion records include only method, route category,
status and duration; actionable unexpected failures add the exception type.
Raw URLs, query strings, bodies, authorization headers and exception messages are
not logged. Client errors retain the binding error envelope and correlation header.
Once a streaming response has started, failures are logged and propagated to the
ASGI server rather than sending a second response.

Connected-mode responses, including built same-origin frontend assets and errors,
set `Strict-Transport-Security: max-age=31536000`. The policy deliberately omits
subdomain/preload directives because those require control of the parent domain.
Demo loopback responses do not enable HSTS. Connected mode requires HTTPS at the
trusted ingress; untrusted forwarded headers do not control this policy.

Environment parsing names invalid numeric, identity-mapping and signing-key-file
settings without echoing their supplied values. Agent-client registration accepts
at most 100 client IDs, each 1–100 characters, mapped to known synthetic agents.
Connected identity URLs and browser origins are validated before startup.

Request-body reads have a ten-second total deadline and a 64 KiB size ceiling.
Rate tracking retains at most 1,024 keys, expires inactive entries every
60 seconds, and preserves the existing 240-request sliding-minute limit. New
keys are refused with the existing 409 contract when tracking is full;
active entries are not evicted to bypass their limits. These are process-local
demo safeguards, not a distributed rate limiter.

Authentication attempts use an `auth_peer:` bucket based on the socket peer
before JWT validation or JWKS lookup. Failed and successful attempts both count;
after the limit, no further token/key work is performed. A successful authenticated
request also counts once against its separate `principal:` bucket, retaining the
principal limit across peer addresses. Public endpoints and preflights count only
once in a `public_peer:` bucket and perform no authentication. These namespaces
share the same bounded capacity, sliding window and expiry; forwarded headers
cannot choose or reset a peer bucket. A shared ingress socket peer may therefore
share the attempt limit across callers; trusted distributed ingress rate limiting
remains an independent production requirement.

Workflow history uses the `workflows_created_at_id` index on `(created_at DESC, id)`
for its stable limit/offset ordering. Startup creates it idempotently for new and
existing databases. SQLite query-plan regressions verify the actual page query
uses that index without a temporary sort.

## Optional inference and shutdown

`AsyncOpenAI` uses the APIM OpenAI v1 Responses route, a managed-identity gateway
audience, no model tools and no server-side response storage. A twenty-second
total application deadline bounds token acquisition and the Responses request,
in addition to the SDK timeout. Cancellation propagates; inference failures
retain their exception cause internally and fail closed.

Automatic inference retries remain disabled intentionally: an ambiguous failure
may already have consumed billed tokens, and reserved usage is retained by the
engine. Retrying without a fresh budget reservation could violate the critical
cost bound. This is a scoped API-07 retry deviation, not a claim that exponential
backoff and jitter are implemented. The engine's existing failure counter provides
its inference circuit-breaker guard.

No project operations are performed, so no `azure-ai-projects` dependency is needed.
If project or Agent Service operations are introduced, use Foundry new and the
2.x project SDK; do not introduce classic or Assistants APIs. Actual tenant,
Foundry, APIM and telemetry connectivity remain unverified.

Cleanup attempts identity, telemetry and database release even if an earlier
cleanup step fails. Workflow recovery failure also closes the initialized engine
before startup exits.

## Validation and dependency blocker

Use the existing lock without dependency resolution:

```powershell
uv run --project backend --no-sync ruff check backend
uv run --project backend --no-sync ruff format --check backend
uv run --project backend --no-sync mypy -p backend.app
uv run --project backend --no-sync pytest backend\tests -q
```

These are the backend portions of the root quality gates. Tests use synthetic
fixtures and mocks; no cloud requests are required.

Validation on 2026-11-06:

| Exact command | Result |
| --- | --- |
| `uv run --project backend --no-sync ruff check backend` | Passed. |
| `uv run --project backend --no-sync ruff format --check backend` | Passed; 22 files already formatted. |
| `uv run --project backend --no-sync mypy -p backend.app` | Passed; 11 source files. |
| `uv run --project backend --no-sync pytest backend\tests -q` | Passed; 118 tests, including structured logging, safe errors, configuration, HSTS, index query-plan and pre-authentication rate-limit regressions. |
| `node scripts\check-feeds.mjs` | Passed; both npm locks and the unchanged Python lock use approved sources. |
| `git --no-pager diff --check -- backend` | Passed. |
| `git --no-pager diff --exit-code -- backend\pyproject.toml backend\uv.lock` | Passed; manifests and locks unchanged. |

The reported high Dependabot alert #1, GHSA-3jp2-3mrg-2vxc, remains blocked:
`azure-monitor-opentelemetry → azure-monitor-opentelemetry-exporter → msrest →
requests-oauthlib → oauthlib 4.0.0`. On 2026-11-06, the configured protected CFS
index could not resolve the reported patched `oauthlib==4.0.1`. The manifest and
lock were preserved. Feed remediation or an approved CFS exception is required;
there is no public-feed fallback and no claim that the alert is resolved.

## Scoped standards evidence

Assessed against upstream commit `8d3608f356ab44b46d04453261f5967610a1a41d`.
This is bounded backend alignment, not an overall compliance certification.

| Checklist | Owned evidence and limits |
| --- | --- |
| CODE-06 | Named, sanitized configuration diagnostics; bounded mapping and connected-URL validation; regression tests. |
| CODE-07, SEC-10 | Timestamped JSON HTTP logs and safe correlated error envelopes; logging tests exclude synthetic sensitive exception text. |
| SEC-09 | Connected-mode HSTS added alongside existing CSP, nosniff, framing, referrer and CORS controls; demo loopback HSTS remains disabled. |
| CODE-08 | Unexpected request failures are logged; streaming failures propagate; inference preserves causes; failed cleanup does not skip later resource release. |
| SEC-04, SEC-08 | Body deadline and bounded tracking added. Socket-peer attempt limits run before JWT/JWKS work, successful requests retain a separate principal limit, and public requests count once. Regressions prove no JWKS work after the attempt limit. Distributed gateway controls remain unverified. |
| API-07 | Total outbound deadline, cancellation and existing circuit guard; retries intentionally disabled as described above. |
| API-03, API-04, API-08 | Binding ADR 002 contract and single-process SQLite exceptions preserved, not silently migrated. |
| AI-03 | Standard OpenAI v1 Responses inference only; no project SDK operations or classic/Assistants APIs introduced. |
| DEP-02, DEP-04 | Existing lock and CFS configuration preserved; protected-source checker passes. |
| TEST-01, TEST-06 | Added configuration, request/stream failure, deadlines, cancellation, capacity and cleanup regressions; existing persistence/workflow/API tests retained. |
| TEST-04 | Coverage percentage has not been measured; no coverage package was added. |
| API-09 | History-sort index added idempotently; query-plan tests cover new/existing databases and reopen without a temporary sort. Other query/index tuning was not benchmarked. |
| CODE-03 | Partial: strict typing/lint/format and Pydantic API schemas retained; configuration still uses the existing validated dataclass, not Pydantic settings. |
| CODE-05, CODE-09, API-02 | Current module layout and incomplete per-function documentation remain outside this surgical alignment. |
| GH-08 | Reported high dependency alert remains unresolved; SLA status needs alert timestamps and approved feed remediation. |

Well-Architected trade-offs: reliability improves through deadlines and cleanup;
security through bounded inputs and safe error diagnostics; operational excellence
through correlated JSON events and regression tests; performance efficiency through
bounded/pruned tracking; cost optimization through preserving one-shot inference
and usage reservations. These local safeguards do not replace distributed gateway
controls, managed persistence, production retention or tenant runtime validation.
