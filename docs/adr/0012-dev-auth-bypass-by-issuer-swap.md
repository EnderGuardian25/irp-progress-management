# ADR-0012 — Dev auth bypass by issuer swap

- **Status:** Accepted
- **Date:** 2026-07-29
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** FR-1 (Azure AD SSO), FR-2..FR-4 (role gating), NFR-14 (no local passwords)
- **Relates to:** ADR-0010 (Auth.js v5) — the bypass is a second provider in the same config, not
  a parallel auth system; ADR-0011 (Bicep Graph extension) — this decision is why that file moved
  to Plan 4

---

## Context

Damian's work account has no confirmed Entra admin access (`handoff.md` §3, "Azure and Entra:
the real state"), so a dedicated Entra directory for this project may not be creatable on the
current timeline. Meanwhile, 50 of the 75 remaining graded points sit behind having *something*
deployed and traced, and this project's own build order requires slice 1 to be deployed and
traced before slice 2 begins. Blocking all of Plan 3 (and therefore Plan 4's deploy) on Entra
provisioning was judged too costly to accept.

## Decision

Ship a **dev-only Auth.js Credentials provider** (`apps/web/lib/dev-identity.ts`,
`devIdentityProvider()`) that mints a **real** RS256 JWT signed with a locally-generated key pair,
and publishes the matching public key as a JWKS document at `GET /api/dev-jwks`. `apps/api`
validates that token through **the same `createRemoteJWKSet` + `jwtVerify` code path** it uses
for real Entra tokens — nothing about the API's auth plugin branches on which mode produced the
token.

**The bypass swaps the token *issuer*; it does not skip authentication.** A request presenting a
dev-minted token still goes through full signature verification, issuer/audience checks, and
expiry checks against a real (if locally hosted) JWKS endpoint.

### Two guards, applied per entry point — not one gate covering everything

1. **A startup throw** (`assertBypassNotInProduction`, `apps/web/auth.config.ts`) fires when
   `AUTH_DEV_BYPASS === "true"` and `NODE_ENV` case-insensitively equals `"production"`. The two
   comparisons are **deliberately asymmetric**: `AUTH_DEV_BYPASS` must match the literal string
   `"true"` exactly, so `"1"`, `"TRUE"`, or `"yes"` can neither enable the bypass nor accidentally
   satisfy the guard's own check; `NODE_ENV` is compared with `.toLowerCase()`, so the guard fires
   *more* often, not less — a container that sets `NODE_ENV=Production` (capitalized) still trips
   it. The call sits at **module scope in `auth.config.ts`**, not `auth.ts`, because
   `apps/web/middleware.ts` imports `auth.config.ts` directly (`auth.ts` is not Edge-safe), so
   invoking the guard only from `auth.ts` would let the Edge middleware path boot clean with the
   bypass live in a production build.
2. **The dev module is never *evaluated* in production**, along whichever path reaches it.
   `apps/web/auth.ts` reaches `lib/dev-identity.ts` only through a dynamic
   `await import("./lib/dev-identity")` gated on `AUTH_DEV_BYPASS`, so with the flag off, the
   module's top-level `await generateKeyPair(...)` never runs and no key is ever generated in a
   process reached through that path.

**This is NOT the module being "excluded from the production bundle."** That claim is false and
was corrected during Task 5's review: a dynamic `import()` with a literal specifier is statically
analyzable, so Turbopack still emits `lib/dev-identity.ts` as a lazy chunk in the production
build rather than removing it. Next.js also inlines only `NODE_ENV` and `NEXT_PUBLIC_*`
variables at build time, so `process.env.AUTH_DEV_BYPASS` remains a genuine runtime read the
bundler has no way to prove dead and eliminate. `import "server-only"` at the top of
`lib/dev-identity.ts` does not help here either — that directive only breaks an import from a
*Client Component* via the `react-server` export condition; it has no bearing on whether the
module is included in a server bundle.

**Guard one is the guard that structurally enforces the block. Guard two only prevents
evaluation, and it matters only because guard one exists to catch the case where it doesn't** —
if the startup throw were ever removed, a production process with the flag mistakenly left on
would still dynamically `import()` and evaluate the module, generate a key, and mint tokens
`apps/api` would accept. The module being present-but-unevaluated is not, on its own, a safety
property; it depends on guard one holding.

Both guards were demonstrated red during Task 5's execution: removing the startup throw failed
exactly the two tests asserting it, and separately loosening the `AUTH_DEV_BYPASS` comparison to
`!== undefined` failed the other two tests in that suite, confirming all three conjuncts
(`AUTH_DEV_BYPASS === "true"`, `NODE_ENV` case-insensitive `"production"`, and the throw itself)
are each independently load-bearing.

**Guard one's coverage is per entry point, not a single gate over the whole feature — and a
whole-branch review found a third entry point neither guard reached.** `apps/web/app/api/dev-jwks
/route.ts` imports `lib/dev-identity.ts` directly, on its own import path that goes through
neither `auth.ts` nor `auth.config.ts`, and `apps/web/middleware.ts` excludes all of `/api`
wholesale (see the note above `config.matcher` in that file), so nothing was calling the guard
for this route at all. The review proved it by building with the flag off, then running
`next start` (which sets `NODE_ENV=production`) with `AUTH_DEV_BYPASS=true`: `/` and
`/api/auth/session` both correctly 500'd at the guard, but `GET /api/dev-jwks` returned **200**
with a live JWKS containing a freshly generated RSA key. Nothing minted a token from it — sign-in
itself still 500'd — but `generateKeyPair()` ran, unauthenticated, in a production process. Fixed
by adding a third call site: `route.ts` now imports `assertBypassNotInProduction` from
`auth.config.ts` and invokes it at its own module scope, the same pattern as `auth.config.ts`
itself. There are now **three** entry points and three call sites — `auth.ts`, `middleware.ts`
(via `auth.config.ts`'s own module scope), and `app/api/dev-jwks/route.ts` — and the durable rule
is: **any module that imports `lib/dev-identity` directly must call
`assertBypassNotInProduction(process.env)` itself**; do not assume that importing something which
imports `auth.config.ts` is enough, because nothing enforces that transitively.

**This was the third instance of the same overclaim pattern on this branch** — a reader should
learn that *coverage claims about this bypass need checking, not trusting*, not just correct the
specific wording below. The first: the guard was, in an earlier draft, called only from
`auth.ts`, which would have left the Edge `middleware.ts` path unguarded (fixed by moving the call
to `auth.config.ts`'s own module scope, per guard one above). The second: the claim that
`lib/dev-identity.ts` is "excluded from the production bundle" (fixed by the correction earlier in
this section — it is a lazy chunk, not an absent one). The third is this one: a passage asserting
`auth.ts` and `middleware.ts` are "covered by the same single call" read as if that call's
coverage were exhaustive, when a third module importing `lib/dev-identity` directly was never in
scope for it. Each time, the fix was in wording that overclaimed completeness rather than in the
underlying mechanism.

## Consequences

### Positive

- The API has **no auth-mode branch at all** — the 403-for-unregistered-user rule, role
  handling, and token signature/issuer/audience validation are exercised identically whether the
  token came from Entra or the dev provider.
- Local development and CI exercise `createRemoteJWKSet` — the actual production JWKS-retrieval
  mechanism — every day, rather than only in the (currently dormant) real-token CI job.
- The eventual cutover to a real Entra tenant is four config steps with no code change (see
  `docs/manual-setup-steps.md` §1.3b), which makes slice-1 §6's "an issuer swap, not a rewrite"
  claim something this plan demonstrates rather than merely asserts.

### Negative, stated plainly

- **An auth bypass exists in the codebase.** That is a permanent liability for as long as it
  exists, requiring both guards above to keep holding with every future change to `auth.config.ts`
  or `auth.ts`.
- **A dev-signed token is not an Entra token.** App-role claim shapes, tenant-specific claim
  quirks, and any Entra-side conditional-access interaction remain unproven until the real-token
  CI job (slice-1 §6, Plan 3 decision 5) is woken with `ENTRA_REAL_TOKEN_TESTS=true`.
- **Restarting `apps/web` rotates the key** (`generateKeyPair` runs once per process, held at
  module scope) and invalidates every outstanding session — acceptable in dev, called out so it
  is not mistaken for a bug during a demo.

## Alternatives considered

### Rejected — a trusted header (`x-dev-user`) that skips JWT validation

The simplest possible bypass: a header the dev frontend sets, trusted directly by `apps/api`
with no signature check. Rejected because it would make the 403-for-unregistered-user rule, role
claim handling, and token validation **production-only code paths** — exactly the most
security-critical logic in the system would become the *least* exercised in day-to-day
development, which is backwards from what a bypass should optimize for.

### Rejected — a containerised mock OIDC server (Dex, `mock-oauth2-server`)

More faithful to the real authorization-code + redirect flow than a Credentials provider.
Rejected because it adds a container, a `docker-compose` service, and a startup dependency to
every local dev run and every CI job, in order to test a flow that Auth.js itself already owns
and implements — and it would still need a local signing key, so it does not remove the actual
piece of infrastructure this decision is about.

## Revisit when

The Entra directory exists (`docs/manual-setup-steps.md` §1.1a). At that point:

1. Perform the four-step cutover in `docs/manual-setup-steps.md` §1.3b.
2. Wake the real-token CI job by setting the `ENTRA_REAL_TOKEN_TESTS` repository variable.
3. **Delete the bypass** — `apps/web/lib/dev-identity.ts`, its provider registration, its route
   (`/api/dev-jwks`), and its tests — **rather than leaving it dormant.** A dormant bypass behind
   an unset flag is still code that must be read, reasoned about, and kept from regressing on
   every future change; deletion, not dormancy, is the intended end state.
