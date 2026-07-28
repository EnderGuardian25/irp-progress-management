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

**Last updated:** 2026-07-28, mid Plan 2B — 9 of 10 tasks done, unmerged on
`feat/plan-2b-service-and-persistence`. The ledger is the precise record; this section is the summary.

### Done

**Documentation**
- **Stakeholder interview** — `docs/stakeholder-interview.md`.
- **Deliverable 1 — Interview Record + Problem Statement + PRD + Team Contract** — `docs/interview-and-prd.md`. 33 numbered FRs, 15 NFRs, 12 non-goals, traceability table. Open points now run O-1 to O-13.
- **`docs/design-system.md`** — visual system. Palette verified by script: 35 pairs across light and dark pass WCAG AA, all tokens in sRGB gamut.
- **Eight ADRs** — `docs/adr/0001`–`0008`. Each names at least two rejected alternatives.
  **0007** hand-written tracing plugin over auto-instrumentation (Plan 2B Task 3);
  **0008** Prisma driver adapter (`@prisma/adapter-pg`) over Accelerate (Plan 2B Task 5) —
  Accelerate was rejected partly because student submissions are personal data and it is a
  third-party proxy they would transit, the same concern class as O-5.
- **`docs/manual-setup-steps.md`** — everything needing a human. **Start here if you are Damian.**

**Code — merged to `main`**

| PR | Plan | What |
|---|---|---|
| #1 | — | Design direction, ADRs 0001–0003, slice 1 spec |
| #2 | 1 · Foundation + cycle engine | `@irp/core`, 112 tests, green under three timezones in CI |
| #3 | 2A · Contract + generation | `spec/openapi.yaml`, `@irp/types`, `@irp/client`, spec-lint and determinism gates |

**Code — on `feat/plan-2b-service-and-persistence`, not yet merged**

Plan 2B tasks 1–8 complete and reviewed clean; task 9 in a review fix round; task 10 not started.
A running Fastify service exists: `GET /health` and `GET /api/v1/me`, Azure-AD-shaped JWT auth,
Prisma-backed user lookup with soft delete, RFC 7807 errors carrying a real span's traceId.
**34 tests across 9 files, zero skipped**, against real Postgres.

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

`apps/web`, `infra/`, `tests/load/`. After Plan 2B merges, the next slices (**3 · auth + web shell**
and **4 · infra, deploy, observability**) are both **blocked on the Azure account**.

### Blocked / needs the stakeholder
| # | Item | Blocks |
|---|---|---|
| **—** | **An Azure free account.** Not created; `az` is not installed | **Plan 4 entirely**, and the Entra half of Plan 3. Blocks nothing before that. `docs/manual-setup-steps.md` §1 |
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
| | 2B · Service + persistence | T-05 (User only), T-10 (thin) | D2 | **9/10 tasks done, unmerged** — branch `feat/plan-2b-service-and-persistence` |
| | 3 · Auth + web shell | T-11 | D3 | Blocked on the Azure account |
| | 4 · Infra, deploy, observability | T-19 – T-23 | D3 | Blocked on the Azure account |
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

**Branch:** `feat/plan-2b-service-and-persistence` · **Next:** **Plan 2B Task 10** (docs, ADR index, spec reconciliation), then the whole-branch review and the PR · **Ledger:** `.superpowers/sdd/2026-07-28-plan-2b-service-and-persistence/progress.md`

> **Ledger path convention changed.** The `subagent-driven-development` skill now resolves a
> **per-plan** workspace via `scripts/sdd-workspace <plan-file>` — `.superpowers/sdd/<plan-basename>/`
> — so plans no longer overwrite each other's records and the old manual archiving step is
> obsolete. The flat `.superpowers/sdd/progress.md` path referenced by older notes is dead.

**Plan 2B status: 9 of 10 tasks complete, all reviewed clean.** Tasks 1–9 are done on the branch;
Task 9 took one fix round (the CI step-ordering finding) and its re-review confirmed every finding
addressed with no new breakage. **Task 10 has not started.**

Remaining before the PR: **Task 10**, then the whole-branch review (on the most capable model, per
the skill's Model Selection), then `finishing-a-development-branch`. The ledger's closing block
lists exactly what Task 10 and the PR must carry — including that the PR cites **FR-5 as
implemented and FR-3 only as groundwork**, and records that both CI gate directions were
demonstrated red.

### Starting a fresh session

1. Read `CLAUDE.md`, then this file, then the **ledger** (path above) — it is the authoritative
   resume map and records every defect, ruling, and deferred minor from Plan 2B. Then
   `docs/superpowers/specs/2026-07-28-plan-2-api-contract-design.md` for the requirements
   themselves: §5 (layout), §7 (the 403 rule), §8 (data model), §9 (error handling), §10 (testing).
2. Run `pnpm install && pnpm generate && pnpm --filter @irp/core build`, **and now also
   `pnpm --filter @irp/api exec prisma generate`** — the Prisma client is a third git-ignored
   generated package, so a fresh clone will not typecheck until it exists.
3. Continue Plan 2B with `subagent-driven-development` (the skill's own scripts: `sdd-workspace`,
   `task-brief`, `review-package`). One plan, one branch, one PR, merged before the next starts.
4. For new plans, the skill creates the workspace itself — no manual archiving.

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
  job, so the database tests actually run in CI. `prisma generate` runs **before** the
  tracked-output porcelain check — the check is whole-repo and unfiltered, so generating after it
  would leave the Prisma client permanently unexamined. That ordering was corrected during review;
  the plan's original instruction had it backwards.
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
