# ADR 002: single-instance SQLite and bounded contract

- Status: accepted **only for synthetic local/disposable demo**.
- Date: 2026-11-06. Review/expiry: before enterprise connected data or 2026-12-06.

## Context

The local rehearsal must run without a managed database or enterprise tenant.
The existing API and UI share a binding contract; replacing it without a
coordinated compatibility migration would break the demonstration.

## Decision

Use SQLite for workflow snapshots, policy/state and isolated synthetic stock
ledgers. Run **one backend process and at most one container replica** per
database. The root image uses writable `/app/data`; template mounts no durable
volume. Cold restart/revision/scale-to-zero may lose cloud state.

The binding contract intentionally uses `/api/...`, snake_case,
`limit/offset` workflow history with total and bounded other collections, SSE
snapshots/GET fallback and `{detail, correlation_id}` errors. This differs from
the generic standard's `/api/v1`, page/pageSize/sort/search and problem+json
defaults. Preserve the signed shared contract in this demo rather than inventing
incompatible schemas across backend/UI. Backend must still bound every collection
and validate inputs; the exception does not waive security or resource limits.

Observed implementation uses SQLite transactions and unique idempotency records;
these must be tested by the application owner. They do not establish distributed
transactional guarantees. Each workflow's synthetic stock ledger is isolated;
this is not enterprise ATP or a global shared stock ledger.

## Consequences

| Pillar | Consequence |
| --- | --- |
| Cost optimization (primary) | No managed database cost or provisioning for a rehearsal |
| Security | Synthetic data only; no tenant-level isolation/real ACL assumption |
| Reliability | No HA/durable backup/DR; disposable history; no production RTO/RPO claimed |
| Performance efficiency | Simple low-load operation; multiple writers/replicas prohibited |
| Operational excellence | Easy deterministic reset; API deviations explicit; migrations/concurrency and restore remain enterprise work |

## Enterprise migration gate

Agree actual SLO/load, RTO/RPO, transaction and residency requirements before
choosing a managed **transactional shared store**. Preserve atomic policy/approval
checks, stock reservation/write and idempotency constraints; test concurrent
approvals, replay and crash recovery. Design durable audit/outbox and real-adapter
compensation using the [Compensating Transaction pattern][pattern].
Use a compatible contract/version migration rather than silently breaking UI.
No enterprise database service or replication pattern is provisioned here.

## Alternatives considered

A managed transactional store would provide shared durable state but requires
an approved subscription, residency/SLO requirements and deployment validation.
A new `/api/v1` collection/error contract would align with the generic API
standard but requires API/UI migration and compatibility tests. Neither is
silently introduced into this bounded local alignment.

[pattern]: https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction
