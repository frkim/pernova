# Security policy

Pernova is a synthetic enterprise-agent demonstration, not an approved
production transaction system. Do not submit real business, personal or tenant
data to local fixtures, prompts, logs, tests or issues.

## Report a vulnerability privately

Repository security contact: **@frkim**, repository owner.
Use [GitHub private vulnerability reporting](https://github.com/frkim/pernova/security/advisories/new)
when enabled. Reporting availability is a repository setting and is **unverified
by this implementation lane**. If unavailable, contact @frkim to arrange an
approved private channel **without posting exploit details, credentials or data
in public issues**. No invented email address or response SLA is claimed.

Provide affected commit/version, sanitized reproduction, expected impact and
mitigation suggestions. Never send active tokens, real records or unredacted
prompts. Agree disclosure timing with the owner; do not publish before remediation.

## Maintenance and containment

Only the current demo branch is in scope; no historical-version support guarantee.
The owner must triage critical findings for remediation within 7 days and high
within 30, following the upstream standard, and track exceptions/incident owners.
Suspected leaks require immediate authorized revocation/rotation, usage audit and
history cleanup—not merely deleting a file. Record a post-mortem within five
working days after recovery.

Required settings (not enabled by a document): branch protection/review, CodeQL,
secret scanning with push protection, Dependabot and private vulnerability
reporting. Releases need dependency/image scanning and an SBOM.

See [threat model](docs/threat-model.md), [control matrix](docs/enterprise-governance.md),
[incident runbook](docs/operations-runbook.md), and
[security standard](https://github.com/frkim/ai-coding-standards/blob/main/standards/security/security.md).
Never weaken Entra validation, forge agent headers, evade protected feeds or
claim compliance to make a demonstration pass.
