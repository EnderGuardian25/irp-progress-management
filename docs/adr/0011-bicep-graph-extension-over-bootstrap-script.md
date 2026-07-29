# ADR-0011 — Microsoft Graph Bicep extension over a committed bootstrap script

- **Status:** Accepted
- **Date:** 2026-07-29
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** FR-1 (Azure AD SSO), D3 (infrastructure as code, no portal drift)
- **Relates to:** ADR-0012 (dev auth bypass) — the reason this file's *timing* changed even
  though its *content* did not; supersedes the reasoning recorded in
  `docs/superpowers/specs/2026-07-28-slice-1-integration-skeleton-design.md` §7

---

## Context

Entra app registrations (the `apps/web` confidential client and the `apps/api` audience/app
roles) are **Microsoft Graph objects, not ARM resources**. Plain Bicep, which only speaks ARM,
cannot create them. `CLAUDE.md` bans hand-run `az` commands for anything that should be Bicep,
and bans checked-in deploy shell scripts — so "create the registrations by hand once, script it
so it is reviewable" was never fully compliant, only the closest available option before this
decision.

## Decision

Use the **Microsoft Graph Bicep extension**, declaring registrations as
`Microsoft.Graph/applications@v1.0` resources in `infra/entra.bicep`.

Verified sufficient for what this project needs: it supports `api.oauth2PermissionScopes`,
`appRoles` with `allowedMemberTypes`, `web`/`spa.redirectUris`, `identifierUris`,
`requiredResourceAccess`, and `requestedAccessTokenVersion`. `uniqueName` is a required property
on the resource and doubles as the **idempotency key** — redeploying the same Bicep against an
existing `uniqueName` updates the registration in place rather than creating a duplicate.

**This supersedes the reasoning in slice-1 spec §7** ("The Bicep exception, stated honestly"),
which chose a committed, documented, idempotent `az ad app` bootstrap script as the pragmatic
option available at the time that section was written. The Graph extension being GA and
sufficient removes the need for that exception entirely.

**The file itself now lands in Plan 4, not Plan 3.** The timing changed, not the decision: Plan
3 originally depended on the registrations existing (slice-1 spec §7, decision 4, "Plan 3 cannot
work without the registrations"), which made writing `infra/entra.bicep` a Plan-3 task. ADR-0012's
dev auth bypass removed that dependency — Plan 3 now runs end to end against a locally-minted
token and needs no Entra directory at all. Writing Graph Bicep against a tenant that cannot be
deployed to or tested (Damian's work account had, at time of writing, no confirmed Entra admin
access — see `handoff.md` §3 "Azure and Entra: the real state") produces an unverifiable file, so
it is deferred to Plan 4, when a dedicated directory exists to deploy it against.

## Consequences

### Positive

- No checked-in deploy script — `infra/` stays the single mechanism for creating infrastructure,
  matching every other resource in this project.
- `uniqueName`-based idempotency means re-running the deploy pipeline is safe; it will not create
  duplicate registrations on every merge to `main`.
- The registration's shape (scopes, app roles, redirect URIs) lives in version control and goes
  through the same PR review as everything else in `infra/`.

### Negative — two things that are Microsoft safeguards, not gaps in our automation

Both belong in the deploy runbook rather than being treated as follow-up work:

- **Bicep cannot emit a client secret.** `passwordCredentials.secretText` is a read-only property
  on the Graph resource — the extension can create the registration but not mint its secret. The
  secret is minted once, out of band, with `az ad app credential reset`, and lands in
  `apps/web/.env.local` locally and as a GitHub Actions secret (`ENTRA_CLIENT_SECRET`) for CI/CD.
- **Admin consent requires a portal click.** Granting the app's requested permissions (and later,
  assigning the k6 service principal its app role) needs a human in the Entra portal — this is a
  deliberate Microsoft safeguard against silently-consented permissions, not something Bicep is
  missing.

Also recorded, since both surfaced during design and are easy to be caught out by at deploy time:

- **Graph replication lag can fail a first deploy.** A newly-created service principal's object
  ID may not have propagated through Graph by the time a dependent resource (e.g. a role
  assignment) references it in the same deployment.
- **Assigning an app role needs elevated consent**, with no narrower permission scope available —
  this affects giving the k6 load-test service principal its role for the auth-gated NFR-3 run.

## Alternatives considered

### Rejected — a committed, idempotent `az ad app` bootstrap script

Re-runnable, reviewable, and it was slice-1's original choice for exactly those reasons.
Rejected now because `CLAUDE.md`'s "no checked-in deploy scripts" rule needs no exception once
the Graph Bicep extension is GA and verified sufficient — keeping the script anyway would mean
maintaining **two** mechanisms for creating infrastructure (Bicep for everything else, a shell
script for this one resource type) when one covers everything.

### Rejected — portal clicks for the registrations themselves

Banned outright by `CLAUDE.md` ("no portal clicks... for anything that should be Bicep") and
produces no reviewable artefact. Deliverable 3 is graded on infrastructure as code; a
portal-created registration is undetectable drift the first time someone touches it by hand.

## Revisit when

- The Graph Bicep extension proves insufficient for a registration property this project needs
  that is not in the "verified sufficient" list above (e.g. some more advanced credential type or
  federation scenario) — re-evaluate whether the script alternative becomes necessary for that
  one property, or whether the extension gains it in a later release first.
