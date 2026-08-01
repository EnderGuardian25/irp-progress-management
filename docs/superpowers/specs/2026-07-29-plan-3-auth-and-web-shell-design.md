# Plan 3 — Auth and web shell

- **Status:** Approved
- **Date:** 2026-07-29
- **Branch:** `feat/plan-3-auth-and-web-shell`
- **Slice:** 1 — Deployed integration skeleton (`handoff.md` §2a)
- **Covers:** T-11 (Azure AD SSO on both apps, Admin/Student role gating, no local passwords)
- **Requirements:** FR-1, FR-2, FR-3 (groundwork), FR-4, NFR-13, NFR-14; FR-28/FR-33 partially,
  via the `CycleRibbon` component this plan introduces
- **Supersedes:** slice-1 spec §7's committed-bootstrap-script decision; parts of `handoff.md`
  §3 decision 4 (see §2)

---

## 1. Goal

Prove the whole chain end to end: **a browser signs in, a real JWT is minted, `apps/api`
validates it for real, a real `User` row is found, and that user's name renders on a real page.**

Everything else in this plan exists to make that sentence true and to keep it true.

This is the last slice-1 plan before deploy. Plan 4 takes what lands here and puts it on Azure, so
the bar is "works, is tested, and is deployable", not "is finished as a product".

## 2. What changed since the brainstorm's Section 1

Section 1 was approved on 2026-07-28 and stands. Three things changed on 2026-07-29 and this
section is the record, because two of them alter previously-settled decisions.

### 2.1 A dev auth bypass is now in scope — and the Entra dependency is out

Damian's work account has **no Entra admin access**, so the dedicated directory that
`docs/manual-setup-steps.md` §1.1a calls the blocker may not be creatable at all. Rather than let
Plan 3 wait on it, this plan adds a **dev bypass** (§6).

The bypass does **not** bypass authentication. It swaps the *token issuer* and leaves every line of
validation running. That distinction is the whole design and §6 states it in full.

Consequence: **Plan 3 no longer depends on Entra existing.** It can be built, tested, reviewed,
merged and demonstrated today.

### 2.2 `infra/entra.bicep` moves to Plan 4

`handoff.md` §3 decision 4 placed it in Plan 3, justified as *"Plan 3 cannot work without the
registrations, so the thing that creates them belongs here."*

**That premise is now false.** With the bypass, Plan 3 works with no tenant at all. Writing Bicep
against a directory that does not exist, cannot be deployed, and cannot be tested would produce
unverifiable infrastructure code — which this repo's "prove a gate fails before trusting it" rule
cannot accept. Plan 4 already owns `main.bicep`, the deploy workflow and the Azure credentials, so
it takes `entra.bicep` too.

**The rest of decision 4 survives intact:** when the registrations are created, they are created by
Bicep's Microsoft Graph extension, not by a checked-in script and not by portal clicks. Only the
*timing* changed. The ADR owed for that choice (§12) is still owed, and is still Plan 3's, because
this is where the reasoning was done.

### 2.3 The sign-in page uses the split-with-ribbon treatment

Chosen from three mockups. The design objection — that it imports Plan 7's signature component into
a slice defined as having no product screens — was raised, weighed, and overridden. It is mitigated,
not ignored: the ribbon is built as a **real component** Plan 7 extends, not a placeholder that
would drift from it (§5.3).

## 3. Decisions carried in, unchanged

From `handoff.md` §3. Not re-opened.

| # | Decision |
|---|---|
| 1 | Thin vertical slice. No product screens |
| 2 | **Auth.js v5** with the Microsoft Entra provider. MSAL rejected |
| 3 | **The access token never reaches the browser** |
| 5 | Hermetic test suite plus one secrets-gated real-token CI job |
| 6 | That job **hard-fails, never skips**, when secrets are expected but absent |
| 7 | First users are a documented one-off insert. Plan 5 owns seeding (T-07) |

## 4. Architecture — two token sources, one validation path

```
  BYPASS MODE                  apps/web
  ┌───────────────┐    ┌──────────────────────────────┐
  │ pick identity │───▶│ Auth.js: dev credentials     │
  │ admin/student │    │   signs JWT with local key   │
  │ /unregistered │    │   oid = dev-admin-1          │
  └───────────────┘    │                              │
                       │ jwt callback → encrypted     │
  ENTRA MODE           │ HTTP-only cookie (JWE)       │
  ┌───────────────┐    │                              │
  │ Microsoft     │───▶│ Auth.js: MicrosoftEntraId    │
  │ sign-in       │    │   oid = Entra object id      │
  └───────────────┘    └──────────────┬───────────────┘
                                      │ decode() — server only
                                      │ per-request createClient()
                                      ▼
                       ┌──────────────────────────────┐
                       │ apps/api — logic UNCHANGED   │
                       │ jose vs JWKS · iss · aud     │
                       │ oid → findByExternalId       │
                       │ no row → 403                 │
                       └──────────────────────────────┘
```

**The only difference between modes is which JWKS the API trusts.** `JWKS_URI` and `JWT_ISSUER` are
configuration. There is no mode branch in `apps/api`, and no second code path.

This makes slice-1 spec §6's promise — *"pointing at a real Bistec training tenant later is an
issuer and app-registration swap, not a rewrite"* — **demonstrated rather than asserted**, because
by shipping two issuers we will have performed the swap.

### 4.1 Why the token is read with `decode`, not from the session

In Auth.js v5 the `session` callback's return value is what `auth()` gives a Server Component **and**
what the client-side `GET /api/auth/session` endpoint returns to the browser. Putting `accessToken`
there would hand the browser a working bearer token, destroying decision 3.

So:

- the **`jwt` callback** stores `access_token` on the token → encrypted, HTTP-only, server-only;
- the **`session` callback** deliberately exposes only `name` and `email`;
- `lib/api-client.ts` reads the raw JWE with `decode()` from `next-auth/jwt`, passing the session
  cookie's value and the cookie name it was read under (the HKDF salt). `decode` takes
  `{ token, secret, salt }` — three values we control — where `getToken()` instead needs a
  request-shaped argument coupled to Auth.js internals that have churned across betas.

Decision 3 then becomes a **test** (§10), not an intention.

### 4.1a One source of truth for role

**The session does not carry `role`.** It would be a second source of truth competing with the
`User` row, and they can disagree — a mentor demoted in the database would keep an `ADMIN` session
cookie until it expired.

The authoritative role is the one `GET /api/v1/me` returns, read from the `User` row. `apps/web`
renders whatever the API says. The Entra app-role claim (slice-1 spec §6) is used for coarse
gating at the API boundary in later plans, never as the display value and never as the record.

### 4.2 Why a per-request client, not the generated singleton

`packages/client/src/client.gen.ts` creates a **module-level singleton** at import time. Attaching a
per-user token to it would leak tokens across concurrent requests in a Next.js server process.

`lib/api-client.ts` therefore calls `createClient()` fresh per request and call sites pass it
explicitly: `getCurrentUser({ client })`. Cross-request leakage becomes impossible by construction
rather than by care.

**This requires a package change.** `createClient`/`createConfig` are exported from
`packages/client/src/client/index.ts`, but `packages/client/package.json` exports only `"."`. A
`"./client"` subpath export must be added. `packages/client/.gitignore` ignores `src/` only, so
`package.json` is hand-written and tracked — this does not touch the never-hand-edit rule.

## 5. Repository layout

```
apps/web/
├─ app/
│  ├─ layout.tsx                    root: html/body, fonts, design tokens
│  ├─ (auth)/
│  │  ├─ signin/page.tsx            split: ribbon left, sign-in right
│  │  └─ not-registered/page.tsx    terminal 403 state — see §8
│  ├─ (app)/
│  │  ├─ layout.tsx                 topbar + sidebar frame
│  │  └─ page.tsx                   /  — renders the authenticated user
│  └─ api/auth/[...nextauth]/route.ts
├─ components/
│  ├─ app-frame/                    topbar, sidebar
│  ├─ cycle-ribbon/                 real component — Plan 7 extends
│  └─ ui/                           shadcn primitives (ADR-0001)
├─ lib/
│  ├─ api-client.ts                 server-only; decode → createClient
│  └─ dev-identity.ts               NEVER EVALUATED in production (not bundle-excluded)
├─ auth.ts                          full Auth.js config
├─ auth.config.ts                   edge-safe subset for middleware
├─ middleware.ts                    redirect guard — UX only
├─ next.config.ts                   transpilePackages: ['@irp/client']
└─ e2e/signin.spec.ts               Playwright smoke test
```

### 5.1 Route groups

Two groups. `(auth)` is unframed; `(app)` carries the design-system frame. The distinction the
design system draws becomes a **directory boundary** rather than a runtime conditional, so a new
page inherits the frame by where it is filed. Route groups do not affect URLs — `(app)/page.tsx`
serves `/`.

### 5.2 The guard, and where authority actually lies

`middleware.ts` redirects unauthenticated requests to `/signin`. `lib/api-client.ts` throws if the
session carries no access token.

**Neither is the security boundary, and the spec says so explicitly so that nobody later mistakes a
redirect for a control.** Next.js layouts are cached across navigations and its docs warn against
relying on them for authorization; middleware has had bypass CVEs. The boundary is `apps/api`:
a global fail-closed hook, `jose` validation against the JWKS, and 403 for a valid token with no
`User` row. The web-side guards are UX and defence in depth.

### 5.3 `CycleRibbon` — a real component, deliberately

Built as a genuine component taking day-status props, rendered on the sign-in page with hardcoded
illustrative data. Plan 7 **extends** it with real data and interaction rather than replacing it.

The alternative — a decorative placeholder — was rejected because two things that resemble each
other drift, and a fake ribbon whose day-mark vocabulary later contradicts the real one is worse
than no ribbon. There is only ever one ribbon.

Scope discipline: this plan builds the **day-mark rendering** only — full, partial, late notch,
absent, missed, not-reached, today, and the half-width weekend `+` slot per FR-33. No data
fetching, no cycle arithmetic (that is `@irp/core`'s, already built), no interaction.

### 5.4 Typography

Plus Jakarta Sans and IBM Plex Mono, both OFL, via `next/font/google` — which downloads at build
time and self-hosts, so there is no runtime dependency on Google's CDN.

## 6. The dev bypass

**The single most dangerous thing in this plan.** Designed accordingly.

### 6.1 What it is

A second Auth.js provider, present only when `AUTH_DEV_BYPASS=true`. Choosing an identity mints a
JWT signed with a **local private key**, carrying that identity's `oid`. `apps/api` validates it
against a **local JWKS** with its real `jose` code path.

`apps/api/test/helpers/keys.ts` already does exactly this for the 48 passing tests. The bypass is
that helper promoted from test-only to a dev runtime mode — not new machinery.

### 6.2 What it is not

It does **not** skip the API's authentication. Rejected alternatives and why:

- **A trusted header (`x-dev-user`) that skips JWT validation.** Would create a production-only code
  path for the 403 rule, the role claims and the token validation — the most security-critical logic
  in the system would be the least exercised.
- **A mock OIDC server in a container** (Dex, `mock-oauth2-server`). More faithful to the real flow,
  but adds a container, a compose service and a startup dependency to every dev run and CI job, to
  test a flow Auth.js itself owns.

### 6.3 The two guards

Both, because a bypass reaching production is unauthenticated access to student personal data, not
a recoverable bug.

1. **Runtime, the enforcing guard:** `assertBypassNotInProduction`, defined in `auth.config.ts`,
   throws at startup if `AUTH_DEV_BYPASS=true` while `NODE_ENV=production`. It runs at
   `auth.config.ts`'s own module scope — not only from `auth.ts` — because `middleware.ts` imports
   `auth.config.ts` directly (`auth.ts` is not edge-safe, so middleware cannot go through it).
   Without the call living in `auth.config.ts` itself, an edge-only import path would boot clean
   with a live bypass in production; only a page or route that also pulls in `@/auth` would trip
   it. `process.env` reads are Edge-runtime-safe in Next 16 — the Edge sandbox mirrors the real
   `process.env` rather than restricting reads to statically inlined names.

   The two string comparisons inside the guard have **deliberately opposite strictness**:
   `AUTH_DEV_BYPASS === "true"` is exact, so `"1"`/`"TRUE"`/`"yes"` must neither enable the bypass
   nor trip the guard. `NODE_ENV` is compared case-insensitively
   (`env.NODE_ENV?.toLowerCase() === "production"`), so the guard fires *more* often, not less — a
   container that sets `NODE_ENV=Production` must still trip it. The flag that enables the bypass
   is matched narrowly; the check that blocks it is matched broadly. Opposite risk profiles need
   opposite strictness.

2. **`lib/dev-identity.ts` is never EVALUATED in production — this is NOT bundle exclusion.** A
   dynamic `await import()` with a literal specifier is statically analyzable; Turbopack emits it
   as a lazy chunk and does not remove it from the production bundle. `import "server-only"`
   doesn't change that either — it only turns a *Client Component* import into a build error via
   the `react-server` condition, and has no bearing on server-bundle inclusion. What is actually
   guaranteed: because the dynamic import in `auth.ts` is gated on `AUTH_DEV_BYPASS`, the module's
   top-level `generateKeyPair()` call never runs when the flag is off — the module sits in the
   bundle, unevaluated. Guard 1 above is the one that structurally enforces the block; this guard
   only keeps the module's side effects from executing, and depends on guard 1 to matter.

The runtime throw is tested, and **demonstrated red before it is trusted** (§10) — by two
mutations: removing the throw, and loosening the `AUTH_DEV_BYPASS` comparison to `!== undefined`.
Both must produce failures.

### 6.4 The three identities

| Identity | `oid` | `User` row and role | Exercises |
|---|---|---|---|
| Mentor | `dev-admin-1` | yes — `ADMIN` | The Admin identity renders (FR-2 groundwork) |
| Student | `dev-student-1` | yes — `STUDENT` | The Student identity renders (FR-2 groundwork) |
| Unregistered | `dev-unknown-1` | **no row** | **403 → `/not-registered`** |

Note the role lives in the `User` row, not in the dev identity — consistent with §4.1a. Switching
identity switches the `oid`; the role follows from the database.

These identities **establish** the Admin/Student distinction so it can be seen and demonstrated.
They do not enforce it — role-based authorization lands with the endpoints that need it, in Plans 6
and 7 (§14).

The third identity turns the spec's most load-bearing authorization rule into something clickable
rather than something only a test knows about.

## 7. User assignment, and the Entra cutover

The identity contract is unchanged in both modes: `apps/api` matches `User.externalId` against the
token's `oid`. The bypass only chooses the `oid`.

`User` rows come from a **documented one-off `INSERT`** in the runbook — settled decision 7, so
Plan 5 keeps ownership of real seeding (T-07). If no row matches, the API returns 403, which is
correct behaviour and self-documenting.

**Cutover when Entra exists:**

1. `UPDATE "User" SET "externalId" = '<entra-oid>'` for each real person (or insert new rows).
2. Unset `AUTH_DEV_BYPASS`.
3. Point `JWKS_URI` and `JWT_ISSUER` at the tenant.
4. Set the three web-side variables `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`,
   and `AUTH_MICROSOFT_ENTRA_ID_ISSUER`. `auth.config.ts`'s `isEntraConfigured` requires all three
   non-empty before it registers the Microsoft Entra provider at all — with them unset, no provider
   is registered regardless of steps 1–3, and `/signin` renders the "not configured" panel (Plan 4B
   Task 7's third sign-in state) rather than a working sign-in button. **This step was missing from
   earlier versions of this list**, found during Plan 4B's documentation reconciliation: three
   documents had started reasoning about "setting the three variables" as though this section already
   said so.
5. Set `vars.ENTRA_REAL_TOKEN_TESTS=true` to wake the dormant CI job (§11).

**No code change beyond step 4's configuration.** That is the design working. Step 4 is still
config-only, not a rebuild: `/signin` is `export const dynamic = "force-dynamic"` (Plan 4B Task 7,
CORRECTION 2), so it reads `process.env` per request rather than baking one state into static HTML
at build time. Setting the three variables on the Container App creates a new revision — a new
process — which is what makes the flags be re-read; no image rebuild is required.

## 8. Error handling — four states, not two

The 403 trap, designed rather than discovered: middleware redirects *unauthenticated* users to
`/signin`, but **403 means authenticated-and-valid, merely unregistered**. Treating it as "sign in
again" produces an infinite loop — valid session → app → 403 → `/signin` → already signed in → app.

| Condition | Web behaviour |
|---|---|
| No session | → `/signin` |
| **403** — valid token, no `User` row | → **`/not-registered`**, terminal. "Ask a mentor to register you." **Never `/signin`** |
| 401 — expired or invalid token | Sign out, → `/signin` with a notice |
| 500 | Error boundary showing the **`traceId`** from the Problem Details body |

`apps/api` already puts a real span's `traceId` in every problem body, so surfacing it as
"Reference: `4bf92f…`" costs nothing and makes NFR-6's trace visibility user-facing.

## 9. API-side changes

Three. Two were already owed.

1. **A global fail-closed `onRequest` hook.** The spec's document-level `security` default is
   fail-closed while the implementation is opt-in per route. Plan 2B closed the gap with a
   route-discovery *test*; this plan closes it *structurally*. The test stays as belt and braces.
2. **Fix the unconditional `catch` around `jwtVerify`** in `apps/api/src/plugins/auth.ts`. It
   currently swallows key-getter failures too, so once `createRemoteJWKSet` is real, a JWKS outage
   would tell every user *"your token is invalid"* (401) while the true fault is a 5xx — actively
   misleading during an incident. Plan 2B logged this as a Plan 3 obligation precisely because this
   is the plan that makes it real. **Distinguish key-retrieval failure from token invalidity.**
3. **`JWKS_URI` / `JWT_ISSUER` become the mode switch** — configuration only, no code change.

## 10. Testing

| What | How | Gate |
|---|---|---|
| Existing 48 `apps/api` tests (of 160 repo-wide) | Unchanged | Regression |
| API tests parameterised over token source | One suite, two signers | Both modes assert identical behaviour |
| `CycleRibbon` day marks incl. weekend `+` slot | React Testing Library | FR-33 logic is real |
| App frame | React Testing Library | — |
| **Token-leak invariant** | `GET /api/auth/session`; fail if the body contains anything token-shaped | Makes decision 3 verifiable |
| **Prod guard** | Startup throws on bypass + `NODE_ENV=production` | **Demonstrate red first** |
| **Global fail-closed hook** | Route discovery: every `/api/` route rejects a tokenless request | **Demonstrate red first** |
| **End-to-end chain** | Playwright: click sign-in → assert the real user renders; unregistered → `/not-registered` | The only test proving the slice's thesis |
| Real Entra token | Dormant CI job (§11) | Hard-fails when expected but absent |

Two gates must be **demonstrated red before being trusted** — the prod guard and the fail-closed
hook. This is not a formality: two of this repo's original four gates looked correct and did
nothing, and in Plan 2B a *gate-proof* turned out to be the thing that could not fail.

**Playwright is new tooling.** It needs a pinned version, and a line in `CLAUDE.md`'s pinned-versions
table. It is a dev dependency, not a stack row, so no ADR is owed — but the pin discipline applies.

`vitest.config.ts` in `apps/api` sets `fileParallelism: false` because both database suites
`TRUNCATE` the same table. Any new database-touching suite inherits that constraint.

## 11. CI additions

**A dormant real-token job**, gated on a repo **variable** rather than on secret presence:

```yaml
real-token:
  if: vars.ENTRA_REAL_TOKEN_TESTS == 'true'
  steps:
    - name: Assert expected secrets are present
      # hard-fail if the variable says these tests are expected but a secret is missing
```

Variables are readable when secrets are not, so the job can distinguish **"expected but absent"**
(hard fail, per decision 6) from **"not configured yet"** (do not run). This is the
`apps/api/test/helpers/require-db.ts` pattern with the flag made explicit instead of inferred.

The practical effect: **Plan 3 merges with the job written and the variable unset**, so the Entra
blocker gates only the final wiring, never the plan.

Also added: `apps/web` lint, typecheck and test steps; a Playwright job with browsers cached.

## 12. ADRs owed

Per `CLAUDE.md`, each names at least two rejected alternatives.

| # | Subject | Rejected |
|---|---|---|
| **0010** | Auth.js v5 over MSAL | MSAL Node; hand-rolled OIDC |
| **0011** | Bicep Graph extension over a committed bootstrap script | `az ad app` script; portal clicks |
| **0012** | **Dev auth bypass by issuer swap** | Trusted header skipping validation; containerised mock OIDC server |

0012 is the important one. It must record that the bypass preserves the validation path, both
guards, and the exact cutover in §7.

## 13. Definition of done

- [ ] `apps/web` scaffolded, Next.js 16, TypeScript strict, `transpilePackages: ['@irp/client']`
- [ ] `packages/client/package.json` exports `"./client"`
- [ ] Sign-in page renders the split treatment with a real `CycleRibbon`
- [ ] Dev bypass signs in as all three identities; unregistered lands on `/not-registered`
- [ ] Both guards in place; the runtime throw demonstrated red
- [ ] Global fail-closed hook in place, demonstrated red
- [ ] `auth.ts`'s `catch` distinguishes key-retrieval failure from token invalidity
- [ ] Token-leak test passes
- [ ] Playwright smoke test green
- [ ] Authenticated page renders the real user from `GET /api/v1/me` via `@irp/client`
- [ ] Existing 160 tests still green; `lint`, `typecheck`, `spec:lint` clean
- [ ] ADRs 0010–0012 written
- [ ] Runbook: dev-identity `INSERT`s, and the Entra cutover in §7
- [ ] Three ADR/doc supersessions recorded (§2)

## 14. Out of scope

- Product screens — submission, review, dashboards. Plans 6 and 7
- `infra/entra.bicep` — moved to Plan 4 (§2.2)
- Real seeding — Plan 5, T-07
- Deploy, App Insights wiring, `SIGTERM` handling — Plan 4
- Role-based *authorization* beyond rendering the role. Enforcement lands with the endpoints
  that need it, Plans 6–7
- Mobile layout. Desktop only, min 1280px, NFR-13

## 15. Risks

| Risk | Mitigation |
|---|---|
| **The bypass reaches production** | Two independent guards, one demonstrated red. §6.3 |
| The bypass becomes permanent because Entra never arrives | The cutover is 4 config steps (§7) and the dormant CI job proves the Entra path when woken. FR-1 remains partially satisfied and that is already recorded |
| `decode()` needs the cookie name it was read under as the salt | Isolated to one file, `lib/api-client.ts`, behind one function |
| `CycleRibbon` drifts from Plan 7's needs | It is the real component, extended not replaced. §5.3 |
| Playwright flakes and erodes trust in CI | One spec, no timing-dependent assertions; failures block rather than retry |
| Plan 3 is now larger than "thin" | `entra.bicep` moved out. If task count still runs long at planning, split the API-side changes (§9) into their own plan — they are independent of the web work |
