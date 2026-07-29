# ADR-0010 — Auth.js v5 (`next-auth@5.0.0-beta.32`) over MSAL Node

- **Status:** Accepted
- **Date:** 2026-07-29
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** FR-1 (Azure AD SSO, no local passwords), FR-2..FR-4 (role gating), NFR-14
  (no local passwords)
- **Relates to:** ADR-0004 (Next.js 16 over the pinned 15) — this decision only exists because
  the App Router is in play; ADR-0012 (dev auth bypass) — the bypass is a provider registered
  through this same Auth.js config, not a parallel auth mechanism

---

## Context

`apps/web` is Next.js 16 App Router. FR-1 requires Azure AD SSO with no local passwords
(NFR-14). Slice-1 spec §6 named Auth.js v5 as the expected choice and reserved the final call
to the Impl Lead, who confirms it here.

`CLAUDE.md`'s pin rule is *the newest version the surrounding ecosystem actually supports, not
the newest version published*. For a Next.js App Router project, that is Auth.js **v5** — v4
predates Server Components, Route Handlers and Next middleware entirely, and has no supported
integration path for any of them. Confusingly, `next-auth@latest` on npm resolves to **`4.24.15`**
— an *older major* than what this project ships, because v5 has not left beta. This ADR records
that inversion explicitly so it does not read as a mistake later.

## Decision

`next-auth` pinned to **`5.0.0-beta.32`** with the Microsoft Entra ID provider
(`next-auth/providers/microsoft-entra-id`).

This is a **deliberate exception to the pin-discipline norm of shipping stable releases**:
we are pinning a beta. The mitigation is that the version is pinned **exactly**, not with a
caret or range — `"next-auth": "5.0.0-beta.32"` — so any move to a newer beta or the eventual
stable release is a reviewed dependency bump, not something that arrives silently on a routine
`pnpm install`.

## Consequences

### Positive

- Full App Router integration: `NextAuth(authConfig)` yields `handlers`, `auth`, and a
  middleware-compatible export in one call — the `middlewares`/callback-route/cookie-encryption
  machinery is Auth.js's problem, not this codebase's.
- The same `authConfig` object is shared between `apps/web/auth.ts` (Node) and
  `apps/web/middleware.ts` (Edge, via `apps/web/auth.config.ts` directly) — one provider list,
  one set of callbacks, checked by both runtimes.
- Registering the dev-bypass provider (ADR-0012) is a second entry in the same `providers`
  array, not a second authentication system — the production Entra path and the dev path are
  exercised by identical Auth.js machinery end to end.

### Negative

- **A beta dependency is a permanent line item to track.** `5.0.0-beta.32` can change API shape
  before a stable release; the exact pin defers that risk to a reviewed bump rather than
  eliminating it.
- Community documentation and Stack Overflow answers skew toward v4; v5-specific behaviour
  (e.g. the JWE session cookie format, `decode()` semantics — see Task 7's cookie-salt work)
  is under-documented and had to be verified against `@auth/core` source directly during this
  plan.

## Alternatives considered

### Rejected — MSAL Node (`@azure/msal-node`)

Microsoft's own auth library. Rejected because it has **no Next.js integration**: session
storage, the OAuth callback route, cookie encryption, and Edge-compatible middleware would all
have to be hand-built. This plan's first decision (slice-1 spec §2, carried into Plan 3) was to
ship a *thin* vertical slice — hand-rolling four separate pieces of security-sensitive
infrastructure, each a place to get subtly wrong, is the opposite of thin.

### Rejected — a hand-rolled OIDC client on `jose`

`jose` is already a dependency (`apps/api`'s JWKS validation, and now the dev-bypass token
minting), and the authorization-code + PKCE flow is well documented, so this is *possible*.
Rejected because PKCE verifier storage, state/nonce validation, token refresh, and encrypted
cookie handling are exactly the code where a subtle error is both easy to introduce and hard to
detect in review — and none of it is differentiating work for an IRP progress tracker. Auth.js
already solves it and is exercised by a much larger user base than this codebase would ever
achieve alone.

## Revisit when

- Auth.js v5 reaches a stable (non-beta) release — bump the exact pin as a reviewed change.
- Bistec training-tenant access is granted (see `handoff.md` §3, `docs/manual-setup-steps.md` §1)
  — FR-1 becomes fully satisfied by an issuer and app-registration swap in `authConfig`, per
  ADR-0012's revisit condition, with no change to this decision.
