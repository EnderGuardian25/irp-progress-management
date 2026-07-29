# CLAUDE.md — IRP Progress Management System

Guidance for Claude Code working in this repository. These rules override default behaviour.

---

## What this is

A progress-tracking and evaluation system for the Bistec Hearts Academy **Industry Readiness Programme (IRP)**. Students submit a short text update each working day; mentors review, record attendance, and evaluate monthly against a fixed rubric with AI-produced scoring. Built as the Month 2 Internal Project Sprint deliverable of the IRP itself.

**Source of truth for requirements:** `docs/interview-and-prd.md`. Every functional requirement is numbered `FR-n` and every non-functional one `NFR-n` — reference those IDs in commits, PRs, stories, and ADRs. If a change maps to no FR, it does not belong in this repo.

**Supporting docs**
| File | What it's for |
|---|---|
| `docs/interview-and-prd.md` | Requirements, personas, non-goals, NFR targets, team contract, open points |
| `docs/stakeholder-interview.md` | Raw stakeholder answers — the primary record; consult when a requirement's intent is unclear |
| `docs/IRP_Progress_Management_System_Brief.pdf` | Original brief (v1.0 draft) |
| `docs/month-2-challenge-context.md` | Programme constraints: stack, deploy target, deliverables, load-test criteria. **A source record — do not edit it.** It is the evidence any deviation is measured against |
| `docs/design-system.md` | Visual system, verified colour tokens, typography, motion, copy voice, a11y floor |
| `docs/adr/` | Architecture decisions. Read before proposing an alternative that one already rejected |
| `docs/superpowers/specs/` and `plans/` | Per-slice design specs and their task-by-task implementation plans |
| `handoff.md` §2a | **The build order.** The Phase 1–7 list in §2b is traceability only, superseded as sequence |

---

## Stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| Frontend | Next.js **16**, TypeScript strict — see [ADR-0004](docs/adr/0004-nextjs-16-over-pinned-15.md); the brief pins 15, **mentor sign-off pending (O-12)** |
| API | Fastify + TypeScript |
| Database | PostgreSQL 16 via Prisma |
| Auth | Azure AD SSO, Bistec training tenant |
| Deploy | Azure Container Apps |
| IaC | Bicep, committed in `infra/` |
| CI/CD | GitHub Actions only |
| Observability | Azure Application Insights via `@opentelemetry/api` |
| Load testing | k6 |
| Package manager | pnpm workspaces |

The stack is a programme constraint, not a preference. Swapping any row needs an ADR **and** stakeholder escalation.

### Pinned versions

Verified against the registry on 2026-07-28. **The rule is *newest version the surrounding ecosystem actually supports*, not *newest version published*** — see [ADR-0005](docs/adr/0005-typescript-6-for-eslint-compatibility.md).

| Tool | Pinned | Newest | Why not newest |
|---|---|---|---|
| Node | 24.x | — | — |
| pnpm | 11.17.0 | — | — |
| TypeScript | **6.0.3** | 7.0.2 | typescript-eslint requires `<6.1.0`, and it *is* ESLint's TypeScript parser — TS 7 means no linting at all. ADR-0005 |
| ESLint | 10.8.0 | — | — |
| typescript-eslint | 8.65.0 | — | — |
| Vitest | 4.1.10 | — | — |
| @redocly/cli | 2.x | — | Config uses `recommended-strict`; plain `recommended` exits 0 on warnings |
| openapi-typescript | 7.x | — | — |
| @hey-api/openapi-ts | 0.87.x | — | Needs `-i ./spec/openapi.yaml`; a bare two-segment path reads as a registry shorthand |
| OpenAPI | **3.1.0** | — | Brief says 3.0; ADR-0006. Requires `ajv/dist/2020` **and** `ajv-formats` |
| Next.js | 16.2.12 | — | Brief pins 15; ADR-0004, sign-off pending (O-12) |
| Fastify | 5.10.0 | — | — |
| Prisma | 7.9.1 | — | — |
| `@prisma/adapter-pg` | 7.9.1 | — | Prisma 7 removed `datasourceUrl` from `PrismaClientOptions`; a driver adapter is required for a direct connection (ADR-0008) |
| `ajv` | 8.20.0 | — | Exposes the `ajv/dist/2020` entry point we require for JSON Schema 2020-12, matching OpenAPI 3.1's schemas (ADR-0006) |
| `ajv-formats` | 3.0.1 | — | ajv implements no string formats itself; the spec uses `uri-reference`, `uuid`, `email` |
| `jose` | 6.2.4 | — | ESM-only; `createRemoteJWKSet` + `jwtVerify` for JWT validation against a JWKS endpoint |
| `@opentelemetry/api` | 1.9.1 | — | Stable API surface the Node SDK packages below implement against |
| `@opentelemetry/sdk-trace-node` | 2.10.0 | — | `NodeTracerProvider` + `SimpleSpanProcessor` backing the hand-written tracing plugin (ADR-0007) |
| `@opentelemetry/sdk-trace-base` | 2.10.0 | — | Dev-only; supplies `InMemorySpanExporter`, the test double injected into the exporter seam `createTracerProvider` exposes |
| `@opentelemetry/resources` | 2.10.0 | — | `resourceFromAttributes` sets the service name on the trace resource |
| `@opentelemetry/semantic-conventions` | 1.43.0 | — | `ATTR_SERVICE_NAME` constant, avoids a hand-typed attribute key |
| `fastify-plugin` | ^5.1.0 | — | Declares plugin `dependencies` so `tracing` → `problem-details` → `auth` ordering is enforced at boot, not by convention |
| `tsx` | 4.23.1 | — | Dev-only; runs `src/index.ts` directly for `pnpm dev` without a separate build step |
| `next-auth` | **5.0.0-beta.32** | 4.24.15 (`latest`) | v5 is the only version with App Router support — Server Components, `middleware`, and the `handlers` export. v4 predates all of it. `latest` being an *older* major is why this row looks inverted. Shipping a beta is a deliberate exception to the pin rule; ADR-0010 |
| React | 19.2.8 | — | Required by Next.js 16 |
| Tailwind CSS | 4.3.3 | — | v4's CSS-first `@theme` config takes the OKLCH tokens directly; ADR-0001 |
| `@playwright/test` | 1.62.0 | — | Dev-only. The end-to-end smoke test is the only thing proving the whole sign-in chain |
| `server-only` | 0.0.1 | — | Makes "the token never reaches the browser" a build-time error rather than a convention |

Before bumping anything, check the peer ranges of what depends on it. The TypeScript 7 case is the worked example of why.

---

## Repository layout

```
irp-progress-management/
├── spec/
│   └── openapi.yaml          hand-written, source of truth for the API
├── apps/
│   ├── web/                  Next.js 16
│   └── api/                  Fastify
├── redocly.yaml              recommended-strict + a custom four-response assertion
├── eslint.config.mjs         type-aware; generated dirs ignored
├── packages/
│   ├── core/                 pure domain logic — the cycle/date engine. Builds to dist/
│   ├── types/                GENERATED, git-ignored, never committed or hand-edited
│   └── client/               GENERATED SDK, git-ignored. Bundler-only — ships raw TS
├── infra/
│   └── main.bicep
├── tests/
│   └── load/                 k6 scripts
├── docs/
│   ├── interview-and-prd.md
│   ├── stakeholder-interview.md
│   ├── month-2-challenge-context.md
│   ├── design-system.md      visual system, tokens, copy voice
│   ├── adr/                  NNNN-title.md
│   └── superpowers/
│       ├── specs/            YYYY-MM-DD-<topic>-design.md
│       └── plans/            YYYY-MM-DD-<feature>.md
├── .github/workflows/
├── CLAUDE.md
└── handoff.md
```

---

## House rules

**Spec-first, always.** `spec/openapi.yaml` is hand-written and changes *before* any handler. Types and the client SDK are generated from it in CI. Never hand-edit `packages/types/` or `packages/client/` — if the shape is wrong, fix the spec and regenerate.

**API contract rules** (these are graded, and they are also just correct):
- Every endpoint defines `200`, `400`, `401`, and `500` responses. No exceptions.
- Every schema carries example values; every parameter carries a description.
- Request bodies are `additionalProperties: false`. Validate strictly, reject loudly.
- Errors use RFC 7807 Problem Details as the response body shape.
- `pnpm spec:lint` must pass with **zero warnings**, not just zero errors. This is enforced by `extends: [recommended-strict]` in `redocly.yaml` — **plain `recommended` exits 0 on warnings and there is no `--fail-on-warnings` flag**, so the bar was unenforced until a review caught it.
- The four-response rule is enforced by a **custom Redocly assertion**, not by `operation-4xx-response` — that built-in only requires *at least one* 4xx, so a missing `401` lints clean under it.
- **A partial OpenAPI document cannot lint clean.** `no-unused-components` flags anything unreferenced, so a schema and the operation using it must land in the same task. Plan a spec change as one unit.

**Generated packages.** `packages/types` and `packages/client` are git-ignored and regenerated by `pnpm generate`; a fresh clone must run it before typecheck will pass. `apps/api/src/generated/prisma` is a **third** such directory — git-ignored, eslint-ignored, and regenerated by `prisma generate` (`pnpm --filter @irp/api exec prisma generate`); CI runs it *before* the generated-output check, since that check is whole-repo and unfiltered. That check is **two** conditions, because one does not cover the other: `git ls-files` over the three generated directories catches force-committed output, and `git status --porcelain` catches a `.gitignore` regression that leaves generated files untracked-and-unignored. **`git status --porcelain` alone cannot detect a force-committed generated file** — the determinism gate guarantees regeneration is byte-identical, so a tracked copy leaves the tree clean and the check exits 0. It said otherwise until a whole-branch review ran it against a force-added `packages/types/src/schema.ts`. Never commit generated output — a tracked copy is a second version of the contract that can drift. New generated directories go in `eslint.config.mjs`'s `ignores` with **package-specific** patterns; a broad `**/src/**` would silence real source. Strictness may be relaxed for generated code **only in that package's own tsconfig**, never in `tsconfig.base.json`.

**Prisma 7 datasource config.** The schema's `datasource` block carries `provider` only — Prisma 7 removed `url` from it, and `prisma validate`/`migrate`/`generate` fail `P1012` before touching a database if it's still there. The connection URL lives in `apps/api/prisma.config.ts` via `defineConfig`/`env` from `prisma/config`. Likewise, `PrismaClientOptions` no longer accepts `datasourceUrl` — it is a union of `{ adapter }` | `{ accelerateUrl }`, so a driver adapter is required for a direct connection: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` via `@prisma/adapter-pg` ([ADR-0008](docs/adr/0008-prisma-driver-adapter-over-accelerate.md)).

**Prove a gate fails before trusting it.** Two of this project's four CI gates looked correct and did nothing until a review tested them with a deliberately broken input. Adding a gate means demonstrating it goes red.

**No hand-written fetch in the frontend.** `apps/web` imports only from `packages/client`. A raw `fetch()` to our own API is a bug.

**The dev auth bypass is temporary and must be deleted, not left dormant.**
`AUTH_DEV_BYPASS=true` makes `apps/web` mint tokens with a local key. It swaps
the token *issuer* — `apps/api` still validates every token with its real `jose`
path — so it is not an auth skip. Two guards keep it out of production: a
startup throw when the flag meets `NODE_ENV=production` (matched
case-insensitively, so the guard fires more often, not less — a container
that sets `NODE_ENV=Production` must still trip it); and `apps/web/lib/dev-identity.ts`
never being **evaluated** in production, because the dynamic import that
loads it is gated on the same flag. **This second guard is not bundle
exclusion** — a dynamic `await import()` with a literal specifier is
statically analyzable, and Turbopack still emits it as a lazy chunk rather
than removing it from the production bundle; do not write or repeat the
claim that it is excluded from the bundle. The startup throw
(`assertBypassNotInProduction`, in `apps/web/auth.config.ts`) is the guard
that structurally enforces the block, but its coverage is **per entry
point, not automatic**: it runs at `auth.config.ts`'s own top level, which
covers `apps/web/auth.ts` and `apps/web/middleware.ts` (which imports
`auth.config.ts` directly, since it is not edge-safe to go through
`auth.ts`) — but a **third** entry point, `apps/web/app/api/dev-jwks/route.ts`,
imports `apps/web/lib/dev-identity.ts` directly and does not pull in
`auth.config.ts` by any other path, so it needed — and now has — its own
explicit call to `assertBypassNotInProduction(process.env)` at module scope.
A whole-branch review proved the gap before the fix: a production `next
start` with the flag on correctly 500'd on `/` and `/api/auth/session`, but
served a live, freshly generated JWKS with 200 from `/api/dev-jwks`. **The
rule going forward: any new module that imports `lib/dev-identity` directly
must call the guard itself** — do not assume importing something that
imports `auth.config.ts` is enough, and do not assume the guard's coverage
is exhaustive just because it is described as "the same call." **Never
weaken either guard**, and never loosen the exact-match comparison on
`AUTH_DEV_BYPASS` or the case-insensitivity of the `NODE_ENV` comparison —
the two checks are intentionally asymmetric, one narrow and one broad, and
both directions matter. Once the Entra directory exists, perform the
cutover in the Plan 3 spec §7 and remove the bypass. ADR-0012.

**Hard-won facts from Plan 3, worth not rediscovering:**

- **`pnpm typecheck` is not sufficient for `apps/web`.** Plain `tsc` does not run Next's own
  checks: it missed a `typedRoutes` error and a `middleware.ts` export-shape error that broke
  the production build for four tasks before a reviewer ran the real build. `pnpm --filter
  @irp/web build` is part of the required verification set for any change touching `apps/web`.
- **Next canonicalises loopback hostnames to the literal string `localhost`**
  (`NextURL.parseURL` / `REGEX_LOCALHOST_HOSTNAME` in `next/dist/server/web/next-url.js`).
  Driving a browser at `127.0.0.1` breaks two things: the dev server 403s `/_next/*` as
  cross-origin (its allowlist is `localhost`/`*.localhost`), killing the HMR upgrade Next
  connects *before* hydrating — so React never hydrates, no click handler is attached, the page
  renders perfectly via SSR and nothing throws; and Auth.js computes its base origin as
  `localhost` regardless of `AUTH_URL`, so a callback redirect lands on an origin without the
  cookie. **The `::1` hazard that motivates `127.0.0.1` elsewhere applies to servers we bind
  ourselves** — Fastify listens IPv4-only, Next's dev server listens on both. So `apps/api` is
  addressed as `127.0.0.1` and the browser as `localhost`.
- **`JWT_ISSUER` is string-compared against the token's `iss` claim; `JWKS_URI` is fetched.**
  They need not match and here deliberately do not.
- **jose 6.2.4 ships a single WebCrypto build with no `node` export condition**, and jsdom's VM
  realm fails jose's `instanceof Uint8Array` check — `// @vitest-environment node` is the
  established fix. Its error classes live under `jose.errors`, **not** as top-level exports; a
  top-level import is `undefined` and `instanceof undefined` throws.
- **Vitest orders test files by cached duration then file size, not filename.** Any test relying
  on execution order is unstable across machines. Every database test must create the rows it
  needs in-file, because the `apps/api` suites `TRUNCATE` the `User` table.
- **`pnpm --filter @irp/web build` fails locally unless you pass `AUTH_DEV_BYPASS=false`**, and
  that is the guard working, not a bug. `next build` sets `NODE_ENV=production`, and Next loads
  `apps/web/.env.local` — which sets the bypass flag for development — into `process.env`, so
  `assertBypassNotInProduction` correctly refuses to build. Set the flag explicitly to `false`
  for a local build; an explicit value wins because Next does not override an already-set
  variable. **CI is unaffected**: `.env.local` is git-ignored and CI never sets the flag, which
  is why the CI build step deliberately runs with it absent. If a local `next build` ever
  succeeds with `AUTH_DEV_BYPASS=true`, guard one has broken — investigate immediately.

**Time handling.** Store every timestamp in UTC. Evaluate every deadline, late flag, and cycle boundary in **Asia/Colombo (UTC+05:30)**. Never rely on the server's local timezone — the deploy region is not Sri Lanka. Cycles run the 10th → the 9th of the following month.

**Weekdays are required; weekends are optional extra work.** A weekday with no entry and no absence, past the grace window, is **Missed**. A weekend day can hold entries and they count as **Extra** — but a weekend is *never* missed, *never* late, and never appears in a compliance denominator. Any date arithmetic over *required* days must skip weekends; arithmetic over *recorded activity* must not.

**No deploys outside CI.** No shell scripts checked in, no portal clicks, no `az` commands run by hand for anything that should be Bicep.

**How work is executed.** Every slice runs the same loop: `brainstorming` → a spec in
`docs/superpowers/specs/` → `writing-plans` → a plan in `docs/superpowers/plans/` →
`subagent-driven-development` to execute it, one fresh subagent per task with an independent
reviewer after each. **One plan, one branch, one PR, merged before the next plan starts.**

When a subagent finds a defect in the plan's own code, fix the plan at source and commit that
correction alongside the code fix. A plan that has silently diverged from the codebase is
worse than no plan.

**Archive the SDD scratch directory between plans.** `subagent-driven-development` writes
task briefs, implementer reports, review diffs and the progress ledger to `.superpowers/sdd/`
under fixed names — `progress.md`, `task-1-brief.md`, and so on. Those names repeat every
plan, so starting a new plan silently overwrites the last one's record. The directory is
gitignored, so nothing recovers it.

**Before the first task of a new plan:** move everything except `progress.md` and `.gitignore`
into `.superpowers/sdd/plan-<N>/`, then reset `progress.md` for the incoming plan. Plan 1's
ledger was lost to exactly this before the convention existed.

**Git discipline** (solo sprint — see the team contract in `docs/interview-and-prd.md` §4.3):
- No direct commits to `main`. One branch and one PR per plan.
- PR description names the FR(s) it implements.
- Conventional commits.
- Any decision with a plausible rejected alternative gets an ADR first, naming at least two rejected alternatives.

---

## Domain glossary

Read this before writing schema or naming anything.

| Term | Meaning |
|---|---|
| **Batch** | A cohort of students with its own start and end dates. Two run concurrently; calendars are independent. |
| **Cycle** | A monthly evaluation window, 10th → 9th, anchored to the batch's admission date, in Asia/Colombo. The unit of scoring. |
| **Entry** | One text submission by a student. Multiple entries per day are allowed. |
| **Daily report** | All of a student's entries for one date, rolled up. The reviewable unit. |
| **States** | `Submitted → In Review → Evaluated`. There is **no Rejected state** — do not add one. |
| **Required day** | A weekday. Carries a submission obligation and counts in compliance denominators. |
| **Optional day** | A Saturday or Sunday. May hold entries, carries no obligation, never counts in a denominator. |
| **Late** | An entry for a required day, submitted after that day ended but inside the grace window. Flagged, still accepted. Optional days are never late. |
| **Absent** | A **weekday** a student explicitly marked as absent with a reason. Distinct from a missed submission. Absence does not apply to weekends — there is nothing to be absent from. |
| **Missed** | A **weekday** with no entry and no absence record, past the grace window. Final. A weekend is never missed. |
| **Extra** | An entry on a Saturday or Sunday. Recorded, surfaced to the mentor, and fed to the AI summary as positive context. Never required, never penalised by its absence. |
| **Rubric** | Five fixed criteria, weights **20 / 25 / 25 / 10 / 20**. Not configurable at runtime — no admin UI for weights. |
| **Performance index** | The AI-produced weighted score for a cycle. The score of record; a mentor may override it. |
| **Override** | A mentor-set score that supersedes the AI's. Stores the new score, the original AI score, and the mentor's reason. |
| **Admin** | A mentor. Every mentor is an Admin; there is no super-admin tier. Admins share access across all batches in v1. |

---

## Hard boundaries — do not build these

Confirmed non-goals. If a task seems to require one of these, stop and re-read `docs/interview-and-prd.md` §3.3.

- File or attachment uploads — submissions are **text only**
- Task assignment or project management — the system records work, never assigns it
- Leave-request or approval workflow — absence is recorded, not requested
- Mobile app or responsive mobile layout — desktop only, min 1280px
- Configurable rubric weights
- Any student-visible score, rank, or leaderboard; any student-to-student visibility or messaging
- Cross-batch comparison or analytics
- Data migration or import — the system starts empty
- Admin date-correction / back-dating — wrong-date submission is prevented by construction instead
- A reject-and-resubmit review flow
- Editing the AI summary text
- Payroll, stipend, or HR integration

Deferred to v2: quarterly evaluation, automated emailing of the monthly report.

---

## NFR targets to build against

| Target | Value |
|---|---|
| API p95 | < 250 ms at 50 RPS sustained |
| Burst | 200 RPS for 30 s, zero 5xx |
| Auth-gated | 10 RPS for 5 min, zero token failures |
| Memory drift | < 50 MB over 30 min idle |
| Deploy pipeline | under 8 minutes |
| Trace visibility | in App Insights within 60 s of a request |
| OpenAPI lint | zero errors, zero warnings |

---

## Open points — ask, don't assume

Listed in full as `O-1`..`O-9` in `docs/interview-and-prd.md` §5. The ones that block code:

- **O-2** — whether the monthly report PDF is emailed in v1 or download-only. Currently assumed **download-only**.
- **O-3** — winner tie-break rule. Currently assumed: weighted score → submission compliance → earliest average submission time.
- **O-5** — AI provider is undecided, and student submissions are personal data. Needs an ADR and leadership escalation **before** any AI call is implemented. Do not wire a third-party model API without it.
- **O-6** — exact wording of the five rubric criteria, needed before the schema hardens.
- **O-7** — whether absence and lateness carry an automatic score penalty. Currently assumed **no** — context for the AI summary only.

When work depends on one of these, implement behind the stated assumption, mark it `// ASSUMPTION: O-n` in code, and log it. Do not silently pick a different answer.
