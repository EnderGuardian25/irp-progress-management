# End-to-end suite

Three spec files, one Playwright config, one seeded database:

| Spec | Proves |
|---|---|
| `signin.spec.ts` | The chain this slice exists to prove: browser → Auth.js → encrypted cookie → decrypt → `@irp/client` → `apps/api` → Postgres → rendered user. Every dev-identity-picker branch, including the unregistered-user 403 and the never-a-token-in-the-browser assertion. |
| `student-flows.spec.ts` | The Plan 6 student surface — on-time submission, the legal submission window (never older than the previous weekday), the absence round-trip, FR-20's lock from the student's own view, the mentor-page redirect, and sign-out. Signed in as `dev-student-1` ("Dev Student") only — see "Personas" below for why. |
| `mentor-flows.spec.ts` | The Plan 6 mentor surface — Roster (row-per-student, the weekend persona's Extra badge), Roster → Review → attendance/tasks record → Submitted → In Review → Evaluated → locked, the Students directory's archive flow, and registering + archiving a throwaway student. Signed in as `dev-admin-1` ("Dev Mentor"). |

## Personas

`@irp/fixtures` (`packages/fixtures/src/index.ts`) is the one list the database seed and the
dev-identity picker both derive from — see its own docblock. The picker itself still only carries
three entries (`apps/web/lib/dev-identities.ts`: Mentor, Student, Unregistered user) — Plan 5 kept
it that way and Plan 6 did not extend it — so a **Student** flow can only ever be driven as
`dev-student-1` ("Dev Student", compliant, Batch Aurora). Every other persona is reached from the
**mentor's** side instead, since Roster/Review/Students read every batch's students, not just the
signed-in identity:

| externalId | Name | Batch | Kind | Exercised in |
|---|---|---|---|---|
| `dev-student-1` | Dev Student | Aurora (A) | compliant | `student-flows.spec.ts` (signed in as), `mentor-flows.spec.ts` (roster row count) |
| `seed-student-a2` | Nuwan Perera | Aurora (A) | late | `mentor-flows.spec.ts` (roster row count) |
| `seed-student-a3` | Sachini Silva | Aurora (A) | missed | `mentor-flows.spec.ts` (roster row count) |
| `seed-student-a4` | Kavindu Jayasuriya | Aurora (A) | absent | `mentor-flows.spec.ts` (roster row count) |
| `seed-student-a5` | Tharindu Weerasinghe | Aurora (A) | **archived** | `mentor-flows.spec.ts` (asserted ABSENT from the active roster) |
| `seed-student-b1` | Ishara Gunawardena | Basalt (B) | compliant | — |
| `seed-student-b2` | Dilini Rathnayake | Basalt (B) | **weekend** | `mentor-flows.spec.ts` (roster's `+N extra` badge) |
| `seed-student-b3` | Ramesh Kumar | Basalt (B) | joiner | — |
| `seed-student-b4` | Amaya Wickramasinghe | Basalt (B) | transfer | — |
| `seed-student-b5` | Chamodi Herath | Basalt (B) | **mixed** | `mentor-flows.spec.ts` (review's Submitted → In Review → Evaluated walk, and the archive flow) |
| `dev-admin-1` | Dev Mentor | — | mentor | `mentor-flows.spec.ts` (signed in as) |
| `seed-mentor-2` | Priya Fernando | — | mentor | — |

## Relative-date honesty

Several assertions depend on which weekday the suite happens to run on (the submission window's
size, whether the current cycle contains a Saturday yet, whether the compliant persona's own
on-time seed entry for today has already landed). Rather than forcing a fixed answer, those tests
compute today's actual state via `@irp/core` and either assert against the derived expectation or
call `test.skip(true, "...")` with a description explaining exactly which condition wasn't met.
Skips here are not a suite that gave up — they're recorded evidence of which branch a given run
took. Check the HTML report's annotations (or the `list` reporter's output locally) if a run
skipped more than expected.

## Prerequisites

1. Postgres running and migrated:

   ```powershell
   $env:IRP_DB_PORT = "5433"
   docker compose -f apps/api/docker-compose.yml up -d
   $env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
   pnpm --filter @irp/api exec prisma migrate deploy
   ```

2. The seeded demo data. `dev-unknown-1` is deliberately absent —
   the test asserts it produces a 403.

   **Re-seed before every Playwright run.** `apps/api`'s own test suites
   `TRUNCATE` the database, so a `pnpm --filter @irp/api test` run wipes
   the demo rows even if you seeded earlier in the session.

   ```powershell
   $env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
   pnpm --filter @irp/api run db:seed
   ```

   The seed is idempotent and covers far more than the two users the old
   manual INSERT created — see `docs/superpowers/specs/2026-08-02-slice-2-product-design.md` §6.

   `mentor-flows.spec.ts`'s archive test reseeds again itself, mid-suite (a
   synchronous `execSync` of the same command), to restore Chamodi Herath
   after archiving her — see that test's comment for why reseeding was
   chosen over leaving her archived. You do not need to reseed by hand
   between `student-flows.spec.ts` and `mentor-flows.spec.ts` on a single
   `pnpm --filter @irp/web e2e` run; only re-seed by hand when re-running the
   suite in a fresh session.

3. `apps/api/.env` and `apps/web/.env.local` from their `.env.example` files,
   with `AUTH_DEV_BYPASS=true` and the API pointed at the dev JWKS:

   ```bash
   # apps/api/.env
   JWKS_URI=http://localhost:3000/api/dev-jwks
   JWT_ISSUER=http://localhost:3000/api/dev-jwks
   JWT_AUDIENCE=api://irp-progress-management
   ```

   `apps/web/.env.local` needs `AUTH_SECRET` set (any 32+ random bytes,
   `openssl rand -base64 32`) so the session cookie can be encrypted and
   decrypted, and `AUTH_DEV_BYPASS=true` so the dev identity picker renders
   on `/signin` instead of the Microsoft Entra button.

## Run

```powershell
pnpm --filter @irp/web exec playwright install chromium
pnpm --filter @irp/web e2e
```

If the JWKS fetch fails, `apps/api` returns **503** rather than 401 (Task
11's behaviour). Check `JWKS_URI` in `apps/api/.env` points at
`http://localhost:3000/api/dev-jwks` and that `apps/web` is up.

## `dashboard-flows.spec.ts` (Plan 7)

Seven tests over the same seeded personas, covering FR-28's mentor dashboard,
the Cycles view, and FR-29/FR-30's student My month.

| Test | Personas it touches | What it proves |
|---|---|---|
| N of M submitted, per batch | Both mentors' view of Batch Aurora and Batch Basalt | The must-ship figure renders for every batch, and N never exceeds M |
| M matches the Roster's row count | Batch Aurora's active students | The dashboard's denominator and the Roster agree for the *same day* |
| Ribbon length matches the cycle it names | Batch Aurora | The figcaption's "Day x of y" and the ribbon's rendered day count agree — see the caveat below |
| Cycles lists every active Aurora student, never a score | All Batch A personas; the archived one (Tharindu) | FR-5 — an archived student leaves active views; and no score exists to leak |
| Month N of 6, own pills, empty S&W | `dev-student-1` (fully compliant) | FR-29's three elements render together |
| No score, rank, or peer name | `dev-student-1` vs every other persona | FR-30, asserted against the whole `<main>` text |
| Student blocked from mentor dashboards | `dev-student-1` | `/cycles` redirects home, and the link is never offered |

### Re-seed before running

```bash
export DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'
pnpm --filter @irp/api db:seed
```

### Every assertion here is relational — and it has to be

The seed is a **function of the run date**: `run-seed.ts` computes every
persona's history backwards from "now" via `@irp/core`, so which days are
late, missed or absent — and which cycle each batch is on — shifts with the
calendar. A hard-coded count, date or percentage would pass on the day it was
written and fail on the 10th.

So these tests never assert a literal figure. They read what the page reports
and check it against something that must agree: N against M, the ribbon's
declared cycle length against its own rendered day count, the dashboard's
denominator against the Roster's row count for the same day.

**One trap worth knowing.** The Roster defaults to *today*; mentor Today falls
back to the *last required day* when today is a weekend. Comparing the two
against the Roster's default would pass Monday to Friday and fail every
Saturday. The row-count test therefore addresses the Roster explicitly by the
ISO date the dashboard exposes on `data-date`, alongside the batch id in its
`data-testid` — neither value hard-coded, and no weekday assumption.

### What the ribbon-length check does and does not prove

Both figures it compares — the figcaption's "Day x of **y**" and the ribbon's
`required-day-count` — derive from the **same** `cycleWorkingDays(bounds)`
array, computed once per request. So the check catches a rendering bug (the UI
reading the wrong field, or the two elements falling out of step), but it
cannot catch a backend miscalculation of `requiredDayCount` itself: both
numbers would then be wrong identically and still agree. The unit tests in
`apps/api/test/dashboard-service.test.ts` are what cover that.

### A note for whoever ships the evaluation UI

The FR-30 leak test asserts the rendered text matches none of
`/rank|leaderboard|performance index/i`. Today no code path on `/my-month`
renders a score at all — the evaluation UI is blocked on O-5 — so that
assertion cannot currently fail. When scores land, revisit the forbidden-word
list: a leak worded differently would pass this test unchanged.
