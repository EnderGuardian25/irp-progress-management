# Handoff — IRP Progress Management System

**Created:** 2026-07-27
**Origin:** split out of `bistec-intern-onboarding` (Month 2 Internal Project Sprint)
**Target location:** `D:\Bistec\irp-progress-management`
**Team:** Damian De Cruz, solo (all three BMAD roles — see `docs/interview-and-prd.md` §4)
**Stakeholder / decision owner:** IRP Mentor, Bistec Hearts Academy (contact via Teams)

---

## 0. Where this folder lives

This folder was authored inside the onboarding repo and **copied** to its own location:

| Path | Role |
|---|---|
| `D:\Bistec\irp-progress-management\` | **The build repo. Authoritative. Work here.** |
| `D:\Bistec\bistec-intern-onboarding\weekly-challenges\month-2\irp-progress-management\` | Frozen snapshot, committed as part of the Month 2 submission record. Do not build here |

If you are reading this at the onboarding-repo path, you are in the snapshot — switch to `D:\Bistec\irp-progress-management`.

Still to do in the build repo:

```powershell
cd "D:\Bistec\irp-progress-management"
git init
git add .
git commit -m "chore: initial commit — PRD, interview record, and project guidance"
gh repo create irp-progress-management --private --source . --push   # or create it in the Bistec org
```

Copies of the PRD, the interview record, and the brief also sit directly under the onboarding repo's `weekly-challenges/month-2/` as the graded submission artefacts. **This repo is authoritative for building.** If a requirement changes, change it here — then copy back to the onboarding repo if the submission copy needs to match.

---

## 1. State of play

**Last updated:** 2026-07-29, **Plan 2B merged as PR #5**. Plan 3 is in the design phase on
`feat/plan-3-auth-and-web-shell` — the brainstorm is partly done and its settled decisions are
recorded in §3. No Plan 3 code exists yet.

**Machine change, 2026-07-29.** Development moved to a second machine. It is fully provisioned and
verified: install → generate → prisma generate → core build → `pnpm typecheck` clean, and
**160 tests / 16 files green against real Postgres** (112 core + 48 api). Docker server 29.6.1,
Postgres on host port **5433** as on machine 1. **The Azure CLI is NOT installed here** — it needs
an elevated MSI install, see `docs/manual-setup-steps.md` §1.2. The hosting topology was settled
this session and is ADR-0009.

### Done

**Documentation**
- **Stakeholder interview** — `docs/stakeholder-interview.md`.
- **Deliverable 1 — Interview Record + Problem Statement + PRD + Team Contract** — `docs/interview-and-prd.md`. 33 numbered FRs, 15 NFRs, 12 non-goals, traceability table. Open points now run O-1 to O-13.
- **`docs/design-system.md`** — visual system. Palette verified by script: 35 pairs across light and dark pass WCAG AA, all tokens in sRGB gamut.
- **Nine ADRs** — `docs/adr/0001`–`0009`. Each names at least two rejected alternatives.
  **0007** hand-written tracing plugin over auto-instrumentation (Plan 2B Task 3);
  **0008** Prisma driver adapter (`@prisma/adapter-pg`) over Accelerate (Plan 2B Task 5) —
  Accelerate was rejected partly because student submissions are personal data and it is a
  third-party proxy they would transit, the same concern class as O-5;
  **0009** hosting topology (2026-07-29) — GHCR over ACR, public-with-firewall Postgres over a
  VNet private endpoint, migrations as a Container Apps Job, Southeast Asia, and scale-to-zero
  with the API's replica floor raised only for the k6 run.
- **`docs/manual-setup-steps.md`** — everything needing a human. **Start here if you are Damian.**

**Code — merged to `main`**

| PR | Plan | What |
|---|---|---|
| #1 | — | Design direction, ADRs 0001–0003, slice 1 spec |
| #2 | 1 · Foundation + cycle engine | `@irp/core`, 112 tests, green under three timezones in CI |
| #3 | 2A · Contract + generation | `spec/openapi.yaml`, `@irp/types`, `@irp/client`, spec-lint and determinism gates |
| #5 | 2B · Service + persistence | Fastify service, Prisma persistence, Azure-AD-shaped auth. FR-5 implemented; FR-3 groundwork only |

A running Fastify service exists: `GET /health` and `GET /api/v1/me`, Azure-AD-shaped JWT auth,
Prisma-backed user lookup with soft delete, RFC 7807 errors carrying a real span's traceId.
**160 tests across 16 files, zero skipped** (`apps/api` 48/9, `@irp/core` 112/7), against real
Postgres, green on all three CI timezone legs.

Plan 2B's whole-branch review found five Important issues, all fixed before merge. Three are worth
knowing because they change how the service behaves: the problem handler now honours Fastify's own
4xx `statusCode` instead of collapsing everything into a 500; `createValidatorCompiler` selects a
**coercing** ajv for querystring/params/headers and a strict one for bodies, so the first
`type: integer` query parameter in Plan 6 will not 400 on every request; and a route-discovery
guard test asserts every `/api/` route sits behind the auth preHandler, because the spec's
document-level `security` default is fail-closed while the implementation is opt-in per route.
The structural fix for that last one — a global fail-closed hook — is **Plan 3's**.

Two seams are deliberate extension points, not accidents of this slice's scope: `buildServer(deps:
ServerDeps)` in `apps/api/src/server.ts` takes config, the user repo, the JWKS key-getter, and the
tracer provider as constructor arguments, so Plan 3 swaps the JWKS source without touching how the
service is composed; and `createTracerProvider(exporter: SpanExporter)` in
`apps/api/src/telemetry.ts` takes only the exporter, with `apps/api/src/index.ts` currently
supplying `new ConsoleSpanExporter()` — Plan 4 replaces that one argument with an App Insights
exporter and nothing else changes.

**What exists now**

```
spec/openapi.yaml        OpenAPI 3.1, two operations, lints clean under recommended-strict
packages/core/           the cycle/date engine. Builds to dist/. 112 tests
packages/types/          GENERATED, git-ignored, never committed
packages/client/         GENERATED, git-ignored, never committed
apps/api/                Fastify service — config, ajv 2020-12 validator compiler, hand-written
                         tracing plugin, RFC 7807 handler, Prisma + user repo, JWT auth plugin,
                         routes, server composition, entrypoint. 34 tests
apps/api/prisma/         schema.prisma (User + Role) + committed migration
apps/api/prisma.config.ts    Prisma 7 CLI datasource config (the schema block cannot hold `url`)
apps/api/src/generated/prisma/   GENERATED, git-ignored — a THIRD generated package
apps/api/docker-compose.yml  local Postgres 16, host port ${IRP_DB_PORT:-5432}
redocly.yaml             recommended-strict + a custom four-response assertion
eslint.config.mjs        type-aware, generated dirs ignored
.github/workflows/ci.yml 3-timezone matrix + Postgres service, prisma generate/migrate
```

### Not started

`apps/web`, `infra/`, `tests/load/`. **Plan 3 is in design, not blocked.** Plan 4 needs the Entra
directory below before its Bicep can deploy from CI.

### Blocked / needs the stakeholder
| # | Item | Blocks |
|---|---|---|
| **—** | **A dedicated Entra directory.** The Azure *subscription* now exists and hosting works; **Entra is the remaining gap** — see §3 "Azure and Entra: the real state" | Creating the app registrations, and Plan 4's Graph Bicep deploying from CI. `docs/manual-setup-steps.md` §1 |
| O-5 | **AI provider + data-processing approval.** Student submissions are personal data leaving the tenant | The whole AI slice (Plan 9, FR-22 to FR-26). Needs an ADR and escalation to leadership |
| O-6 | Exact wording of the five rubric criteria | The evaluation schema and screen |
| O-10 | FR-13 and FR-15 conflict on the Monday grace window | Implemented on the FR-15 reading, marked `// ASSUMPTION: O-10`. Blocks nothing |
| O-11 | Weekends reclassified as optional Extra work — **changes FR-12, adds FR-33** | Implemented. §4.2 reserves FR changes to the mentor, so sign-off is outstanding |
| O-12 | Next.js 16 over the pinned 15 | Impl Lead confirmed 2026-07-28; build proceeds. Mentor notification outstanding |
| O-13 | OpenAPI 3.1 over the brief's 3.0 | Impl Lead accepted the grading risk. Shipped |
| O-1, O-2, O-3, O-4, O-7, O-8, O-9 | Interview metadata; email delivery; tie-break; leadership access; absence penalty; non-goals confirmation; Demo Day date | Assumptions stated; nothing blocked |

Full list with current assumptions: `docs/interview-and-prd.md` §5.

Also outstanding and small: **the Bistec brand hex.** `--primary` is a placeholder indigo. Any replacement must avoid hue 20–70° (reserved for `missed`/`late`) and 140–170° (reserved for `ok`).

---

## 2. Build task list

> ### ⚠️ Ordering superseded, 2026-07-28
>
> **The Phase 1–7 ordering below is no longer the build order.** It has been replaced by the
> slice-based roadmap in §2a. The T-numbers are still live — they remain the index from work
> to FRs, and every plan cites them — but **the phases they sit in no longer describe
> sequence.**
>
> **Why it changed.** Phase 5 put deploy behind eight Phase-4 feature tasks, one of them
> (T-17) blocked on O-5. That parked 25 graded points behind a blocked task and made
> Deliverable 4 unstartable, since k6 needs a deployed URL. Deploy is now pulled into
> slice 1.
>
> Read §2a for order. Read §2b for the FR traceability the T-numbers carry.

### 2a. Slice roadmap — this is the build order

Each slice ships working software. Each plan is one branch and one PR, merged before the next
begins. Plans live in `docs/superpowers/plans/`, specs in `docs/superpowers/specs/`.

| Slice | Plan | Covers | Feeds | Status |
|---|---|---|---|---|
| **1 — Deployed integration skeleton** | 1 · Foundation + cycle engine | T-01, T-03, T-06 | D2 | ✅ **Merged, PR #2** |
| | 2A · Contract + generation | T-08 (thin), T-09 | D2 | ✅ **Merged, PR #3** |
| | 2B · Service + persistence | T-05 (User only), T-10 (thin) | D2 | ✅ **Merged, PR #5** |
| | 3 · Auth + web shell | T-11 | D3 | **In design** — branch `feat/plan-3-auth-and-web-shell`. Decisions in §3 |
| | 4 · Infra, deploy, observability | T-19 – T-23 | D3 | Needs the Entra directory (§3) before Graph Bicep can deploy from CI |
| **2 — The product** | 5 · Full data model + seed | T-05 (full), T-07 | D2 | Not started |
| | 6 · Submission + review flows | T-08 (full), T-12, T-13 | — | Not started |
| | 7 · Dashboards | T-14, T-15 | SC-4 | Not started |
| **3 — Evaluation** | 8 · Notifications | T-16 | — | Not started |
| | 9 · AI evaluation | T-17 | — | **Blocked on O-5** |
| | 10 · Winner + PDF | T-18 | — | Not started |
| **4 — Proving it** | 11 · Load test + retro | T-24 – T-26 | D4 | Not started |

**The one ordering rule that matters:** slice 1 must be deployed and traced before slice 2
begins. Features land on a pipeline already known to work — never the other way round.

T-02 (ADRs) is continuous, not a task: five are written, more land as decisions arise.
T-04 (per-story docs in `docs/stories/`) is **dropped** — the spec-plus-plan pair in
`docs/superpowers/` serves the same purpose with acceptance criteria attached, and
maintaining both would guarantee drift.

### 2b. T-number reference — traceability only, not sequence

### Phase 1 — Foundations
| # | Task | Covers |
|---|---|---|
| T-01 | pnpm workspace monorepo scaffold: `apps/web`, `apps/api`, `packages/types`, `packages/client`, `spec/`, `infra/`, `tests/load/`, `docs/adr/`, `docs/stories/`. TypeScript strict everywhere | D2 |
| T-02 | ADRs. **Done:** 0001 Tailwind + shadcn/ui · 0002 light-default theming · 0003 cycle ribbon for FR-28. **Remaining:** monorepo tooling; AI provider (**blocked on O-5**). Numbering is chronological by decision — the bootstrap "record architecture decisions" ADR is redundant, `CLAUDE.md` already carries that convention | D2 |
| T-03 | Baseline GitHub Actions workflow: install → lint → typecheck → test → redocly lint. Runs on PR | D2 |
| T-04 | Story breakdown — write `docs/stories/S-0xx-*.md` from the FRs, with acceptance criteria per story | D1/D2 |

### Phase 2 — Data model
| # | Task | Covers |
|---|---|---|
| T-05 | Prisma schema: `User`, `Batch`, `Enrolment`, `Entry`, `DailyReport`, `AbsenceRecord`, `Cycle`, `Evaluation`, `Override`, `Award`. Soft-delete on students | FR-5, FR-6, FR-8 |
| T-06 | Cycle/date engine: 10th→9th boundaries anchored to admission date, Asia/Colombo evaluation, weekday-only arithmetic, grace-window and late determination. **Unit-test this hard — it's the subtlest logic in the system** | FR-9, FR-12, FR-13, FR-14, NFR-12 |
| T-07 | Seed script: 2 batches, 10 students, a month of realistic entries including late and absent days | D2 |

### Phase 3 — API contract (Deliverable 2)
| # | Task | Covers |
|---|---|---|
| T-08 | Hand-write `spec/openapi.yaml`: auth, students, batches, entries, daily reports, absence, review transitions, evaluations, overrides, awards, dashboards. Every endpoint 200/400/401/500; RFC 7807 error body; `additionalProperties: false`; examples on every schema | FR-1..FR-32, NFR-7, NFR-8 |
| T-09 | Wire generation into CI: `openapi-typescript` → `packages/types`, `@hey-api/openapi-ts` → `packages/client`. Fail the build if generated output is stale | D2 |
| T-10 | Fastify handlers typed off the generated `paths`. Strict request validation returning Problem Details | FR-1..FR-21 |

### Phase 4 — Application
| # | Task | Covers |
|---|---|---|
| T-11 | Azure AD SSO on both apps; Admin/Student role gating; no local passwords | FR-1..FR-4, NFR-14 |
| T-12 | Student daily submission flow: text-only, multiple entries/day, current-or-previous-weekday only, absence marking. Under 2 min to submit | FR-10..FR-17, NFR-9 |
| T-13 | Mentor review flow: Submitted → In Review → Evaluated, mentor's own attendance/task record, lock on Evaluated. **No reject state** | FR-18..FR-20 |
| T-14 | Mentor dashboard — performance summary + "N of M submitted today" + late/absent counts, no scrolling. **Ship this first; it is the stakeholder's must-have** | FR-28, SC-4 |
| T-15 | Student dashboard — own history, "Month N of 6", strengths-and-weaknesses summary. No score, no rank, no other students | FR-29, FR-30 |
| T-16 | Teams + email notifications on submission and state change | FR-21 |
| T-17 | AI monthly evaluation: summary generation, fixed-rubric scoring (20/25/25/10/20), mentor override with reason, no summary editing, no mid-cycle evaluation. Persist model version + score. **Blocked on O-5** | FR-22..FR-27, NFR-15 |
| T-18 | Winner computation + downloadable PDF with AI justification | FR-31, FR-32 |

### Phase 5 — Deploy & observability (Deliverable 3)
| # | Task | Covers |
|---|---|---|
| T-19 | `infra/main.bicep` — Container Apps, Postgres 16, App Insights, Azure AD app registration. No portal clicks | D3 |
| T-20 | Deploy workflow to Azure Container Apps on merge to `main`, under 8 min | D3, NFR-5 |
| T-21 | OpenTelemetry → App Insights, every route traced, visible within 60 s | D3, NFR-6 |
| T-22 | Tested rollback path to the previous revision, with exact commands | D3 |
| T-23 | `deploy-runbook.md` — infrastructure, pipeline, auth, observability, rollback | D3 |

### Phase 6 — Load test & retro (Deliverable 4)
| # | Task | Covers |
|---|---|---|
| T-24 | k6 scripts in `tests/load/`: sustained 50 RPS, 200 RPS burst, auth-gated 10 RPS × 5 min, 30 min idle memory watch | D4, NFR-1..NFR-4 |
| T-25 | Run them, capture results, analyse the slowest endpoint citing App Insights traces | D4 |
| T-26 | `retro-and-load.md` — start/stop/continue (≥3 each), velocity vs estimate, honest notes on solo multi-agent orchestration, results table, bottlenecks, follow-ups with owners and dates | D4 |

### Phase 7 — Post-demo (before Month 3)
Fix every P1/P2 from the stakeholder demo · Dependabot + weekly patch rotation · postmortem for the worst sprint day · convert one endpoint to typed-SDK-only · pin an App Insights dashboard in the README · pair-review two other teams' OpenAPI specs.

---

## 3. Current position

**Branch:** `feat/plan-3-auth-and-web-shell` · **Next:** finish the Plan 3 **brainstorm** (Sections 2–3), write the spec, then `writing-plans` · **Ledger:** none yet — Plan 2B's workspace was deleted at merge, and Plan 3's is created by `sdd-workspace` when execution starts

> **Ledger path convention changed.** The `subagent-driven-development` skill now resolves a
> **per-plan** workspace via `scripts/sdd-workspace <plan-file>` — `.superpowers/sdd/<plan-basename>/`
> — so plans no longer overwrite each other's records and the old manual archiving step is
> obsolete. The flat `.superpowers/sdd/progress.md` path referenced by older notes is dead.

**Plan 2B is merged (PR #5).** Its SDD workspace was deleted at merge, per the skill — git history
and the PR description are the record now.

### Azure and Entra: the real state

Verified on 2026-07-28. **The old "no Azure account, `az` not installed" note was wrong in both
directions** — correcting it is why this section exists.

| Thing | State |
|---|---|
| Azure CLI | Installed, **2.88.0** |
| Subscription | **`Azure subscription 1`**, `7bb869f8-053c-4c2d-b444-1bf079bfcef7`, Enabled |
| Tenant | `d5e769b0-fd19-45e4-a4a8-b73545450234` — **`bisteccare.lk`**, signed in as `Damian@bisteccare.lk` |
| Hosting (ARM) | ✅ Works — `az group list` exits 0 |
| Resource providers | ❌ **All `NotRegistered`** — `Microsoft.App`, `Microsoft.DBforPostgreSQL`, `Microsoft.Insights`, `Microsoft.OperationalInsights`, `Microsoft.ContainerRegistry`. Register before Plan 4 or Bicep fails confusingly |
| Entra / Graph | ❌ **Blocked by conditional access.** Every Graph call returns `InteractionRequired` / `LocationConditionEvaluationSatisfied`, inconsistently within a single session |
| Permissions in `bisteccare.lk` | **Unknown.** The queries that would answer it are the ones Graph refuses. Do not record this as "no permissions" — it was never established |

**Two facts that together decide the auth design:**

1. **The users are not in `bisteccare.lk`.** Students and mentors hold `bistecglobal.com` accounts,
   and Damian has no account there. An app registration is scoped to one directory, so a
   single-tenant app in `bisteccare.lk` would let nobody but Damian sign in.
2. **CI cannot re-authenticate interactively.** Even if the registrations can be created by hand in
   `bisteccare.lk`, Plan 4 deploys Graph Bicep from GitHub Actions. Whether a conditional-access
   policy targeting users also catches a workload identity depends on separately-licensed
   configuration — unverified, and Plan 4 is the expensive place to find out.

**Decision: a dedicated Entra directory**, created by Damian, where he is Global Administrator.
The Azure subscription stays in `bisteccare.lk` — hosting is demonstrably unaffected. Use a
**native cloud-only** `admin@<name>.onmicrosoft.com` account for all CLI and Bicep work, not the
external `Damian@bisteccare.lk` identity the new tenant grants Global Admin to on creation.

**Do not substitute a personal Microsoft account.** Microsoft's Graph Bicep docs state that
*"permissions for personal Microsoft accounts cannot be used to deploy Microsoft Graph resources
declared in Bicep files"* — an MSA would silently invalidate the Bicep-for-Entra decision below.

**FR-1 remains partially satisfied**, exactly as slice-1 spec §6 "Known gap" already records: auth
is generic OIDC, so pointing at a real Bistec training tenant later is an issuer and
app-registration swap, not a rewrite. `manual-setup-steps.md` §3 carries the standing mentor ask.

### Plan 3 design decisions — settled in the brainstorm, do not re-litigate

The brainstorm is **partly complete**: Section 1 (architecture and data flow) is approved.
Sections 2 and 3 have not been presented, and no spec file exists yet.

| # | Decision | Why |
|---|---|---|
| 1 | **Thin vertical slice.** `apps/web` scaffold, Auth.js sign-in/out, one authenticated page calling `GET /api/v1/me` through `@irp/client` and rendering the real user, design-system tokens and app frame. **No product screens** | Proves the whole chain end to end and keeps Plan 4 close behind, honouring "deployed and traced before slice 2" |
| 2 | **Auth.js v5** with the Microsoft Entra provider | Slice-1 §6 named it as expected and reserved the call to the Impl Lead, who confirmed it. MSAL rejected: no Next.js integration, so session storage, callback routes and middleware would all be hand-built in a plan meant to be thin |
| 3 | **The access token never reaches the browser.** Session is an encrypted HTTP-only cookie; the token is pulled server-side and attached by `@irp/client` | Makes `CLAUDE.md`'s "no hand-written fetch in the frontend" structural rather than a matter of discipline — the browser has no token to fetch with |
| 4 | **Entra registrations in Bicep** — `infra/entra.bicep`, `Microsoft.Graph/applications@v1.0`, landing in **Plan 3**, not Plan 4 | Verified GA and sufficient: supports `api.oauth2PermissionScopes`, `appRoles` with `allowedMemberTypes`, `web`/`spa.redirectUris`, `identifierUris`, `requiredResourceAccess`, `requestedAccessTokenVersion`. `uniqueName` is required and is the idempotency key. Keeps `CLAUDE.md`'s no-checked-in-scripts rule intact with **no exception needed**. Plan 3 cannot work without the registrations, so the thing that creates them belongs here |
| 5 | **Testing: hermetic suite + one secrets-gated real-token CI job** | All existing tests stay offline via the `getKey` injection seam. One job acquires a real Entra token through the **k6 service principal** and calls `/api/v1/me`. That principal is required by Deliverable 4 anyway (NFR-3, "10 RPS for 5 min, zero token failures" — the reason slice-1 §6 rejected Easy Auth), so it is D4's prerequisite built early, not extra scaffolding |
| 6 | **The secrets-gated job must hard-fail, never skip**, when secrets are expected but absent | A conditionally-skipped job is the exact false-green shape this repo has been bitten by twice — `describe.skipIf` and the porcelain gate. Apply the `apps/api/test/helpers/require-db.ts` pattern |
| 7 | **First users: a documented one-off insert**, recorded in the runbook | The API returns 403 for a valid token with no `User` row (spec §7, deliberate; FR-3 is not built). Rejected: a throwaway seed script, because **Plan 5 owns seeding (T-07)** and a second one would drift; and auto-provisioning on first sign-in, because that silently contradicts §7's "rejected, not provisioned" security posture |

**Constraints carried into the spec:**

- **Bicep cannot emit a client secret** — `passwordCredentials.secretText` is read-only. Auth.js
  needs one for the confidential-client code flow, so `infra/entra.bicep` creates the
  registrations and the secret is minted once with `az ad app credential reset`, landing in
  `.env.local` and a GitHub Actions secret. That step and the **admin-consent portal click** are
  Microsoft safeguards, not gaps in our automation — both belong in the runbook.
- **Graph replication lag can fail a first deploy** — service principal IDs may not have
  propagated when dependent resources deploy.
- **Assigning an app role needs elevated consent**, with no narrower permission available. Affects
  giving the k6 service principal its role.
- **Two ADRs are owed** before or with the implementation, per `CLAUDE.md`'s two-rejected-
  alternatives rule: **Auth.js v5 over MSAL**, and **Bicep Graph extension over a committed
  bootstrap script or portal clicks**.

**Mandatory fix, not optional, and it belongs in this plan:** `apps/api/src/plugins/auth.ts`'s
`catch` around `jwtVerify` is unconditional and swallows key-getter errors too. Inert with a local
key set; with `createRemoteJWKSet` a JWKS-endpoint outage would tell every user *"your token is
invalid"* (401) while the real fault is a 5xx. Plan 2B logged it as a Plan 3 obligation precisely
because this is the plan that makes it real.

### Starting a fresh session

1. Read `CLAUDE.md`, then this file — **§3's "Azure and Entra: the real state" and "Plan 3 design
   decisions" are the resume map.** Then `docs/superpowers/specs/2026-07-28-slice-1-integration-skeleton-design.md`
   §6 (the auth shape and its "Known gap") and §7, and
   `docs/superpowers/specs/2026-07-28-plan-2-api-contract-design.md` §7 (the 403 rule) and §9
   (error handling) for what the API already guarantees.
2. Bring the clone up. **`prisma generate` needs `DATABASE_URL` in the shell environment first** —
   Prisma 7 dropped implicit `.env` loading, and `prisma.config.ts` resolves `env("DATABASE_URL")`
   from the real process env, so a bare `prisma generate` fails `PrismaConfigEnvError` on a fresh
   clone. The value only has to *parse*; `generate` never connects.

   ```powershell
   pnpm install
   pnpm generate
   Copy-Item apps/api/.env.example apps/api/.env      # git-ignored
   $env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
   pnpm --filter @irp/api exec prisma generate         # third generated package
   pnpm --filter @irp/core build
   pnpm typecheck                                      # should be clean, 4 projects
   ```

   To run the database-backed tests as well:

   ```powershell
   $env:IRP_DB_PORT = "5433"
   docker compose -f apps/api/docker-compose.yml up -d
   pnpm --filter @irp/api exec prisma migrate deploy
   pnpm test        # expect 160 tests / 16 files, zero skipped
   ```

   Verified end to end on a second machine on 2026-07-29: 112 core + 48 api, all green.
3. **Plan 3 is mid-brainstorm.** Section 1 is approved; Sections 2 and 3 are not written. Resume
   with `superpowers:brainstorming` — present the remaining sections, then write the spec to
   `docs/superpowers/specs/2026-07-28-plan-3-auth-and-web-shell-design.md`, then `writing-plans`,
   then `subagent-driven-development`. **Do not skip to implementation**; the brainstorm's
   HARD-GATE requires an approved design first.
4. The settled decisions in §3 are approved — build on them, do not re-open them. What is *not*
   settled: the web shell's file layout, the sign-in page's visual treatment, how Auth.js session
   config is tested, and the CI job's exact shape.
5. **Blocked on Damian:** the dedicated Entra directory (§3) must exist before any of Plan 3's
   auth can be wired against something real. Everything else in the plan — the Next.js scaffold,
   the design-system frame, the `transpilePackages` wiring — proceeds without it.
6. For new plans, `subagent-driven-development` creates its own workspace via `sdd-workspace` — no
   manual archiving.

### Local environment facts that cost real debugging time

Verified on the development machine on 2026-07-28. These are environment-specific, not
repository rules, but rediscovering them is expensive.

| Fact | Consequence |
|---|---|
| **The Bash tool is network-sandboxed** — it cannot open a TCP connection to a localhost port | Every database command must run through **PowerShell**. Prisma fails `P1001: Can't reach database server` from Bash even with a healthy container and a port provably open from the host. This looks exactly like a broken database and is not |
| **`localhost` resolves to `::1`** | Use `127.0.0.1` in connection strings |
| **Host port 5432 is held by an unrelated project's container** (`designer-postgres-1`) | `apps/api/docker-compose.yml` parameterises the host port as `${IRP_DB_PORT:-5432}`; local runs use **5433**. CI is unaffected — a GitHub runner's service container binds 5432 with nothing to conflict. **Do not "fix" the workflow to 5433** |
| Local connection string | `postgresql://irp:irp@127.0.0.1:5433/irp?schema=public` |
| `docker info` hung past 120s once, mid-session | Probe with `docker version --format '{{.Server.Version}}'` under a timeout instead |

### Hard-won constraints discovered *during* Plan 2B

New, and all of them cost a round trip or a corrected plan. Formal doc/spec reconciliation is
**Task 10's** job — this table is the raw record so nothing is lost first.

| Constraint | Why it matters |
|---|---|
| **Prisma 7 removed `url` from the schema's `datasource` block** | `prisma validate`/`migrate`/`generate` all fail `P1012` before touching a database. The URL now lives in `apps/api/prisma.config.ts` via `defineConfig`/`env` from `prisma/config`. The `datasource` block carries `provider` only |
| **Prisma 7 removed `datasourceUrl` from `PrismaClientOptions`** | It is now a union of `{ adapter }` \| `{ accelerateUrl }` — a **driver adapter is required** for a direct connection. We use `@prisma/adapter-pg` (**ADR-0008**), which brings `pg` and `@types/pg` as its own dependencies, so it is one line in `package.json`. `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` |
| **A gate-proof is itself a gate** | Task 9's "prove `migrate deploy` fails" test pointed at a nonexistent database on a *reachable* host and expected non-zero. It exits **0**: the `postgres:16` image's `POSTGRES_USER` is a superuser with `CREATEDB`, so Prisma silently creates the database and applies migrations. CI uses the same image, so the test would have passed everywhere while proving nothing. Point at an **unreachable host:port** instead |
| **`describe.skipIf(!dbUrl)` exits 0 on a skip** | A database suite with no `DATABASE_URL` vanishes and the run reports green. `apps/api/test/helpers/require-db.ts` is now the single source of truth for `dbUrl` and throws when `process.env.CI` is set without it. **Every database suite must import `dbUrl` from there**, never read `process.env` directly, or it is silently unguarded |
| **`res.json()` returns `unknown`** | Reading a field off it trips `@typescript-eslint/no-unsafe-member-access`, and the repo lints at zero warnings. Use `res.json<T>()` with a local shape interface; bare `res.json()` only when handing the whole body to a validator or `toEqual`/`toMatchObject`. This broke the plan's verbatim test code twice |
| **Plugin composition order is structurally enforced, not merely conventional** | `tracing` → `problem-details` → `auth` are `fastify-plugin`-wrapped with declared `dependencies`, so a wrong order in `server.ts` **throws at boot** and fails the composition test. Order is guaranteed by fp's dependency graph, not by the test's assertions |
| **`vitest.config.ts` sets `fileParallelism: false`** | Both database suites `TRUNCATE` the same table. Enabling parallelism would make them race. Load-bearing |
| **The generated Prisma client lives in `apps/api/src/generated/prisma/`** | A **third** git-ignored, eslint-ignored generated directory — same discipline as `@irp/types`/`@irp/client`: never committed, regenerated by `prisma generate`, and CI must generate it **before** typecheck |

### Carried forward — open items created by Plan 2B

- **No `SIGTERM`/`SIGINT` handler exists anywhere in `apps/api`.** Azure Container Apps sends
  `SIGTERM` on scale-down and redeploy, so in-flight requests are dropped on every deploy. This
  bears directly on the NFR "200 RPS burst, zero 5xx" target. **A Plan 4 obligation.**
- **The auth plugin's `catch` around `jwtVerify` is unconditional** and also swallows errors thrown
  by the key-getter itself. Harmless with a local key set, but once **Plan 3** wires a real
  `createRemoteJWKSet`, a JWKS-endpoint outage will present to clients as `401 "your token is
  invalid"` rather than a 5xx — actively misleading during an incident.
- **`index.ts` only `$disconnect()`s Prisma inside the `catch` around `app.listen`.** If
  `buildServer` itself rejects, the client leaks. Low stakes since the process exits.

### Superseded constraints from Plan 2A (kept for context)

These still hold, but are no longer the newest thing to know.

| Constraint | Why |
|---|---|
| **`ajv/dist/2020`, not Fastify's default ajv** | The spec is OpenAPI 3.1, so its schemas are JSON Schema 2020-12. Fastify's default is draft-07 and will *silently* misinterpret them — the worst failure mode for the one mechanism keeping spec and service aligned |
| **`ajv-formats` is mandatory** | The document uses `format: uri-reference`, `uuid`, `email`. Ajv implements no formats, and in strict mode an unknown format **throws at schema-compile time** — the API fails at boot, not on a bad request. See ADR-0006 |
| **`@irp/client` is bundler-only** | It ships runtime code as raw TypeScript with `noEmit`. Plan 3 needs `transpilePackages: ['@irp/client']` in Next.js. `apps/api` cannot load it |
| **Relax strictness only in a generated package's own tsconfig** | Never `tsconfig.base.json`. `packages/client` sets `lib: ["ES2023","DOM"]` and `exactOptionalPropertyTypes: false` because its `include` covers only generated files |
| **New generated dirs go in `eslint.config.mjs` ignores** | Package-specific patterns only. A broad `**/src/**` would silence real source |
| **A partial OpenAPI document cannot lint clean** | `no-unused-components` warns on anything unreferenced, so schemas and the operations using them must land in one task. This forced a plan restructure |

### The `DayStatus` design risk — resolved as a Plan 6 obligation

`@irp/core` hand-writes `DayStatus` as an eight-value union, and the concern was that the first
domain endpoint would generate a **second** one from the spec with nothing linking them.

**It does not materialise in Plan 2B.** This slice's spec surface is `User`, `Role`, `Problem` and
`HealthStatus` — no day-status schema exists to collide with, so core's union has no generated
counterpart yet. The decision (derive core's unions from `@irp/types`, or assert set-equality in a
test) is **deferred to Plan 6**, where the first domain endpoint lands, and Task 10 records it as a
Plan 6 obligation.

A related but weaker case *did* appear and was judged acceptable: `UserRecord.role` in
`apps/api/src/db/user-repo.ts` hand-writes `"ADMIN" | "STUDENT"` against Prisma's generated `Role`
enum. Unlike `DayStatus`, this one is **compiler-checked** — `role: u.role` is assigned against the
interface, so a third `Role` member fails typecheck rather than drifting silently. The file carries
a comment saying so.

### What still governs the order

Execution runs under `superpowers:subagent-driven-development`: a fresh implementer subagent
per task, an independent reviewer after each, fixes looped until the review is clean, then a
whole-branch review before the PR.

**What still governs the order:**

- The cycle/date engine comes before anything else touching dates. Late, absent and grace
  logic is where this project would quietly go wrong, and every downstream feature depends
  on it. It is Plan 1 for that reason.
- Nothing in `apps/` is written before `spec/openapi.yaml` covers it. Deliverable 2 is scored
  on the spec.
- The mentor dashboard (T-14) is the stakeholder's stated must-have if only one thing ships,
  so it lands as early as its dependencies allow — Plan 7, immediately after the flows it
  reads from.
- T-17 waits on O-5. Everything else routes around it.

**Open points blocking future plans:** O-5 (AI provider) blocks Plan 9. O-6 (rubric wording)
blocks the evaluation schema. O-10 to O-13 need mentor sign-off but block nothing — all are
implemented behind stated assumptions and marked in code. **The Azure account blocks Plans 3
and 4 and is the only genuinely blocking item.**

### Gates that exist, and what each actually catches

Worth knowing because one of them was silently broken until the whole-branch review found it.

- **`redocly lint` under `recommended-strict`** — the plain `recommended` preset exits **0 on warnings** and there is no `--fail-on-warnings` flag, so the zero-warning bar was unenforced for most of Plan 2A. `recommended-strict` promotes warnings to errors. Verified by deliberate failure.
- **A custom Redocly assertion** enforces all four of `200`/`400`/`401`/`500`. The built-in `operation-4xx-response` only requires *at least one* 4xx — deleting a `401` used to lint clean.
- **The determinism gate** regenerates and diffs checksums, catching a non-deterministic generator. "Never hand-edited" is enforced by `.gitignore` plus a `git status --porcelain` check, not by the diff.
- **The three-timezone CI matrix** (UTC, America/New_York, Pacific/Kiritimati) brackets Asia/Colombo both ways, so an off-by-one-day error from reading server local time cannot pass.

**Added in Plan 2B Task 9:**

- **A Postgres 16 service plus `prisma generate` and `prisma migrate deploy` steps** in the `verify`
  job, so the database tests actually run in CI — **demonstrated red** against an unreachable
  host:port (see "a gate-proof is itself a gate" above; a same-host nonexistent-database target
  does not fail, since the image's superuser silently creates it). `prisma generate` runs
  **before** the tracked-output porcelain check — the check is whole-repo and unfiltered, so
  generating after it would leave the Prisma client permanently unexamined. That ordering was
  corrected during review; the plan's original instruction had it backwards.
- **A CI skip guard** (`apps/api/test/helpers/require-db.ts`) that turns a missing `DATABASE_URL`
  into a hard failure when `CI` is set, closing the `skipIf` false-green. Both database suites
  import `dbUrl` from it.

If you add a gate, prove it fails when it should. Two of the original four looked correct and did
nothing — and in Plan 2B a *gate-proof* turned out to be the thing that could not fail, so apply
the same skepticism one level up.

---

## 4. Things not to re-litigate

- The stack is fixed by the programme (Fastify / Postgres 16 / Prisma / Azure Container Apps / Bicep / GitHub Actions). **One row has moved:** the frontend is Next.js **16**, not the pinned 15 — [ADR-0004](docs/adr/0004-nextjs-16-over-pinned-15.md), mentor sign-off pending as O-12. Exact version pins live in `CLAUDE.md`.
- There is **no reject state** in review, no configurable rubric, no file uploads, no student-visible scores or ranks, no mobile layout, no data migration, no admin date-correction. Full list in `CLAUDE.md` under "Hard boundaries".
- Grading and rubric language was deliberately kept out of `docs/stakeholder-interview.md` — that document is requirements input, not a graded exercise. Don't re-add it.
- The five-whys chain did **not** land on fairness or dispute-resolution; the stakeholder rejected that framing outright. The driver is evaluation cost and handover legibility. Don't design for dispute-proofing.
