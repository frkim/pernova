## Change and motivation

Issue:

## Ownership / contract

- [ ] Change stays in its agreed scope; maintainers reviewed shared-contract changes.
- [ ] Documentation and ADRs updated for decisions, previews or deviations.
- [ ] No credentials, personal or real business data included.
- [ ] Protected CFS feeds used; locks preserved; new dependencies researched.

## Verification

List actual commands, outcomes and commit/environment. Mark unavailable checks
explicitly; do not substitute Bicep compilation for APIM/Entra/runtime validation.

- Application lint / type / build / tests:
- Browser E2E and accessibility:
- Bicep lint / `build --stdout`:
- Negative authorization / model / tool / approval-replay tests:
- Docker / cloud / tenant checks unavailable:

## Security, WAF and enterprise evidence

- [ ] Caller authority is server-validated, never an `x-agent` header.
- [ ] Approval/idempotency, data/KB ACL limits and bounded costs/tools reviewed.
- [ ] Local/template/configured/connected-tested/unverified states remain honest.
- [ ] Synthetic data/prices and non-certification labels preserved.
- [ ] All five WAF pillars and relevant trade-offs considered.
- [ ] No provisioning, tenant grants or subscription selection without separate approval.
- [ ] CI actions, if changed, use full SHA pins and minimum permissions.

Risks, residual gaps, rollout/reset and owners:
