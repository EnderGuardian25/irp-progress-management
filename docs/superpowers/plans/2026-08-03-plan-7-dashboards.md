# Plan 7 — Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship FR-28's mentor dashboard (must-ship, SC-4) and FR-29/FR-30's student dashboard, backed by three new read-only API endpoints, with the cycle ribbon finally carrying real data.

**Architecture:** Three `GET` endpoints (`/batches/{id}/dashboard/today`, `/batches/{id}/dashboard/summary`, `/me/dashboard`) sit on one new `dashboard-service`, which derives every figure from `packages/core`'s `classifyDay` by way of a new **batched** day-service read — one pass over the whole batch-cycle instead of the roster's per-student fan-out. Nothing is materialised: compliance rates and "N of M" are computed per request, as spec §3 requires. On the web, four pages (mentor Today, mentor Cycles, student My month, plus a typography sweep of the existing five) consume the generated SDK only.

**Tech Stack:** Fastify 5 + Prisma 7 + `@irp/core` on the API; Next.js 16 App Router server components + `@irp/client` on the web; Vitest for unit/integration, Playwright for e2e; OpenAPI 3.1 hand-written first, types and SDK generated.

**Spec:** `docs/superpowers/specs/2026-08-02-slice-2-product-design.md` — §4 "Dashboard endpoints (Plan 7)", §5 "Pages and UX", §7 "Testing and verification", §8 "Plan decomposition".

**Branch:** `feat/plan-7-dashboards` — one branch, one PR, merged before Plan 8 starts.

**FRs:** FR-28 (mentor dashboard, must-ship, SC-4), FR-29 (student dashboard), FR-30 (no student-visible score/rank/peer data), FR-9 (cycle boundaries), FR-12/FR-33 (weekday-only denominators, weekend Extra), FR-27 (mid-cycle joiner not evaluated). **T-numbers:** T-14, T-15.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Spec-first.** `spec/openapi.yaml` is hand-written and changes *before* any handler. Never hand-edit `packages/types/` or `packages/client/` — regenerate with `pnpm generate`.
- **A partial OpenAPI document cannot lint clean.** `no-unused-components` flags anything unreferenced, so a schema and the operation using it land in the **same task**.
- **Every operation defines `200`, `400`, `401`, `500`** — enforced by the custom Redocly assertion `rule/every-operation-defines-the-four-contract-responses`. Mentor-only operations add `403`; path-parameterised ones add `404`. Every schema carries `examples:`; every parameter carries a `description:`.
- **`pnpm spec:lint` must pass with zero warnings** (`recommended-strict` promotes warnings to errors).
- **No hand-written `fetch` in `apps/web`.** Import from `@irp/client` only.
- **Store UTC, evaluate Asia/Colombo.** Never read the server's local zone; `toProgrammeDate(now)` is the only route to "today". Cycles run the 10th → the 9th.
- **Weekdays are required; weekends are optional Extra.** Any arithmetic over *required* days skips weekends; arithmetic over *recorded activity* does not. A weekend is never late, never missed, never in a denominator.
- **FR-30 is absolute.** No endpoint reachable by a `STUDENT` token may return another student's data, a numeric score, or a rank. `GET /me/dashboard` reads `req.user!.id` and nothing else.
- **No AI, no scores.** O-5 blocks every AI call; `Evaluation` rows do not exist. The strengths-and-weaknesses panel renders the designed empty state (spec D6).
- **`pnpm typecheck` is not sufficient for `apps/web`.** `AUTH_DEV_BYPASS=false pnpm --filter @irp/web build` is part of the required verification set for any change touching `apps/web`.
- **Vitest orders test files by cached duration, not filename.** Every database test creates the rows it needs in-file; the `apps/api` suites `TRUNCATE`.
- **Conventional commits**, one per task. Any decision with a plausible rejected alternative gets an ADR naming at least two rejected alternatives.

### Environment

```bash
# Postgres (host port 5433 on this machine — Docker Desktop must be started manually)
docker compose -f apps/api/docker-compose.yml up -d          # IRP_DB_PORT=5433
export DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'

# A fresh clone needs all three generated directories before typecheck passes
pnpm install
pnpm generate                                   # packages/types + packages/client SOURCE
pnpm --filter @irp/api exec prisma generate     # apps/api/src/generated/prisma
pnpm --filter @irp/core build                   # packages/core/dist
pnpm --filter @irp/client build                 # packages/client/DIST — see below
```

**`pnpm generate` is not enough on its own, and neither `pnpm typecheck` nor Vitest
will tell you.** `packages/client/package.json` points `types` at `./dist/index.d.ts`
while `default` resolves to `./src` — so bundler-based consumers (Vitest, the dev
server) see freshly generated source, and only `next build` type-checks against
`dist`. Add an operation to the spec, regenerate, and every local gate passes green
while `dist` still lacks the new SDK function; the real build then fails with
`Module '"@irp/client"' has no exported member '…'`. **CI is unaffected** — it runs
`pnpm --filter @irp/client build` before `next build` (`.github/workflows/ci.yml`).
This bit Task 6 locally after three spec-changing tasks had already landed.

`apps/api` is addressed as `127.0.0.1`; the browser is driven at `localhost` (Next canonicalises loopback hostnames — see CLAUDE.md).

### Before Task 1 — housekeeping

```bash
git checkout main && git pull
git checkout -b feat/plan-7-dashboards
mkdir -p .superpowers/sdd/plan-6
# Archive Plan 6's SDD record; the filenames repeat every plan and the directory is gitignored.
find .superpowers/sdd -maxdepth 1 -type f ! -name progress.md ! -name .gitignore -exec mv {} .superpowers/sdd/plan-6/ \;
cp .superpowers/sdd/progress.md .superpowers/sdd/plan-6/progress.md
# Then reset .superpowers/sdd/progress.md for Plan 7.
```

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `docs/adr/0018-batched-cycle-read-for-dashboards.md` | Why the dashboard reads a whole batch-cycle in five queries rather than reusing the roster's per-student fan-out |
| `docs/adr/0019-dashboard-cycles-addressed-by-engine-sequence.md` | Why `?cycle=` is an engine-computed 1-based sequence, not a `Cycle` row id or a date range |
| `apps/api/src/services/dashboard-service.ts` | All three dashboard aggregations. Consumes the batched day service; owns no date arithmetic of its own beyond calling `@irp/core` |
| `apps/api/src/routes/dashboards.ts` | The three `GET` handlers, role gates, query resolution, domain→API mapping |
| `apps/api/test/helpers/fake-dashboard-service.ts` | `unusedDashboardService()` for the DB-less `buildServer` suites |
| `apps/api/test/dashboard-service.test.ts` | Service-level aggregation truth, against real Postgres |
| `apps/api/test/dashboards-endpoint.test.ts` | Per-endpoint: happy path, role gating, validation rejection, 404 |
| `apps/web/lib/ribbon.ts` | Pure `DayStatus`/day-compliance → `DayMark` mappers. No I/O, no React |
| `apps/web/app/(app)/mentor-today.tsx` | The mentor branch of `/` — FR-28's warm zone, one ribbon per batch |
| `apps/web/app/(app)/cycles/page.tsx` | Mentor Cycles — batch + cycle picker, per-student summary table |
| `apps/web/app/(app)/my-month/page.tsx` | Student My month — own ribbon, "Month N of 6", day history, S&W empty state |
| `apps/web/components/ui/field-label.tsx` | `FieldLabel` — the `<label>` typography three pages hand-roll today |
| `apps/web/components/ui/table.tsx` | `Table` / `Th` / `Td` — the table chrome three pages hand-roll today |
| `apps/web/test/ribbon.test.ts` | The mappers, exhaustively |
| `apps/web/test/mentor-today.test.tsx` | Mentor Today branches |
| `apps/web/test/cycles-page.test.tsx` | Cycles page branches |
| `apps/web/test/my-month-page.test.tsx` | My month branches |
| `apps/web/e2e/dashboard-flows.spec.ts` | Mentor Today "N of M", Cycles, student My month, over the seeded personas |
| `docs/walkthrough.md` | Persona-by-persona demo script (spec §7, doubles as the SC-3 legibility check) |

**Modified**

| Path | Change |
|---|---|
| `spec/openapi.yaml` | +3 operations, +1 tag, +7 schemas (Tasks 2, 3, 4) |
| `packages/core/src/cycle.ts` · `index.ts` | `PROGRAMME_MONTHS` constant (Task 4) |
| `apps/api/src/db/entry-repo.ts` | `listEntriesForStudents`, `listReportsForStudents` |
| `apps/api/src/db/absence-repo.ts` | `listForStudents` |
| `apps/api/src/db/batch-repo.ts` | `listEnrolmentsForStudents`, `enrolmentsInRange` |
| `apps/api/src/services/day-service.ts` | `listDaysForStudents`; `listDays` delegates to it |
| `apps/api/src/routes/schemas.ts` | `CYCLE_QUERY` |
| `apps/api/src/domain/errors.ts` | `InvalidCycleError` |
| `apps/api/src/server.ts` · `index.ts` | Wire `dashboardService` |
| `apps/api/test/helpers/build-test-server.ts`, `fake-entry-repo.ts`, `fake-absence-repo.ts`, `fake-batch-repo.ts` | New interface members |
| `apps/api/test/auth-jwks-failure.test.ts`, `server.test.ts` | New `buildServer` dep |
| `apps/web/app/(app)/page.tsx` | Mentor branch delegates to `MentorToday` |
| `apps/web/components/app-frame/sidebar.tsx` | `Cycles` and `My month` become real links |
| `apps/web/app/(app)/roster/page.tsx`, `students/*`, `review/*`, `student-today.tsx` | Typography migration (Task 9) |
| `apps/web/e2e/README.md` | Dashboard persona-to-flow map |
| `docs/design-system.md` §7 | The batch day-mark precedence rule |
| `handoff.md` §1, §2a, §3 | Plan 6 merged, Plan 7 status, what exists now |

---

## Task 1: Batched cycle read

The roster fans out two queries per student and says so in a comment: *"no premature batching until a real roster size demands it."* A dashboard over a whole cycle is that demand — 10 students × 22 days is 40 queries under the current shape, on the page FR-28 makes must-ship and Plan 11 will load-test. This task adds the batched path and makes `listDays` delegate to it, so there stays exactly one classification code path.

**Files:**
- Create: `docs/adr/0018-batched-cycle-read-for-dashboards.md`
- Modify: `apps/api/src/db/entry-repo.ts`, `apps/api/src/db/absence-repo.ts`, `apps/api/src/db/batch-repo.ts`, `apps/api/src/services/day-service.ts`
- Modify: `apps/api/test/helpers/fake-entry-repo.ts`, `fake-absence-repo.ts`, `fake-batch-repo.ts`
- Test: `apps/api/test/day-service.test.ts` (extend), `apps/api/test/batch-repo.test.ts` (extend)

**Interfaces:**
- Consumes: `classifyDay`, `compareDates`, `addDays`, `CivilDate`, `DayStatus` from `@irp/core`; `fromDbDate`/`toDbDate` from `../db/civil-date-map.js`.
- Produces:
  - `EntryRepo.listEntriesForStudents(studentIds: string[], from: CivilDate, to: CivilDate): Promise<EntryRecord[]>`
  - `EntryRepo.listReportsForStudents(studentIds: string[], from: CivilDate, to: CivilDate): Promise<DailyReportRecord[]>`
  - `AbsenceRepo.listForStudents(studentIds: string[], from: CivilDate, to: CivilDate): Promise<AbsenceRecordShape[]>`
  - `BatchRepo.listEnrolmentsForStudents(studentIds: string[]): Promise<EnrolmentRecord[]>`
  - `BatchRepo.enrolmentsInRange(batchId: string, from: CivilDate, to: CivilDate): Promise<RosterEnrolment[]>` where `RosterEnrolment = { studentId: string; displayName: string; email: string; startDate: CivilDate; endDate: CivilDate | null }`
  - `DayService.listDaysForStudents(studentIds: string[], from: CivilDate, to: CivilDate, now: Date): Promise<Map<string, DayView[]>>`

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0018-batched-cycle-read-for-dashboards.md`:

```markdown
# ADR-0018 — Dashboard aggregates read a batch-cycle in one batched pass

**Status:** Accepted · **Date:** 2026-08-03 · **Plan:** 7, Task 1

## Context

FR-28's mentor dashboard renders the cycle ribbon: every required day in the
current cycle, filled by that day's batch compliance. That is ~22 required days
× ~10 students of classification, per batch, per page load — and the page is
must-ship (SC-4), the one a mentor keeps open, and the one Plan 11's k6 run will
hammer against NFR-1 (p95 < 250 ms at 50 RPS).

`RosterService` already reads days for a batch, but per student: `listDays`
issues four queries (entries, absences, reports, enrolments) and the roster
calls it once per member via `Promise.all`. Its own comment records this as
"accepted for now… no premature batching until a real roster size demands it."
A whole-cycle read is that demand: 10 × 4 = 40 queries for one ribbon, 80 for a
two-batch dashboard.

## Decision

`DayService` gains `listDaysForStudents(studentIds, from, to, now)`, backed by
four `WHERE studentId IN (...)` repository reads, returning a
`Map<studentId, DayView[]>`. `listDays` becomes a one-student call through it,
so **classification stays on a single code path** — `classifyDay` remains the
only thing that decides late/missed/extra, and no aggregate re-derives a status.
`BatchRepo.enrolmentsInRange` supplies per-day membership in one further query,
replacing a `rosterMembers` call per date. Five queries per batch-cycle, flat in
roster size.

## Rejected alternatives

**Reuse the per-student fan-out.** Zero new code, and correct. Rejected on the
numbers above: it is 8× the queries on the project's most-loaded page, and
retrofitting it during Plan 11 — after the load test has already produced the
figures that go in the report — is strictly more work than doing it here.

**SQL `GROUP BY` aggregates.** One query returning counts per day. Rejected
because it would compute compliance *in SQL*, duplicating `classifyDay`'s grace
window, weekday rule and enrolment clipping in a second dialect. Spec §3 makes
the engine the source of the arithmetic; two implementations of "missed" is
exactly the drift that rule exists to prevent.

**Materialised per-day counters.** A table updated on write. Rejected: spec §3
says `Missed` is "computed, never stored" precisely because the grace rule is
still only mentor-assumed (O-10), and stored counters would strand stale rows
the day it moves.

## Consequences

Four repository interfaces grow a batched sibling, and the DB-less test fakes
grow with them. `listDays`'s single-student behaviour is unchanged and its
existing tests are the regression guard for the delegation.
```

- [ ] **Step 2: Write the failing repo tests**

Append to `apps/api/test/batch-repo.test.ts`, inside its existing `describe.skipIf(!dbUrl)` block (match the file's own helper names for creating users — read the top of the file first):

```ts
  it("enrolmentsInRange returns overlapping enrolments with student identity, excluding archived students", async () => {
    const batch = await repo.create({
      name: "Batch Range", startDate: civilDate("2026-05-10"), endDate: civilDate("2026-11-09"),
    });
    const inside = await prisma.user.create({
      data: { externalId: "range-inside", email: "range-inside@dev.local", displayName: "Bea", role: "STUDENT" },
    });
    const archived = await prisma.user.create({
      data: {
        externalId: "range-archived", email: "range-archived@dev.local",
        displayName: "Ada", role: "STUDENT", deletedAt: new Date(),
      },
    });
    const before = await prisma.user.create({
      data: { externalId: "range-before", email: "range-before@dev.local", displayName: "Cal", role: "STUDENT" },
    });
    await repo.enrol(inside.id, batch.id, civilDate("2026-06-01"));
    await repo.enrol(archived.id, batch.id, civilDate("2026-06-01"));
    // Enrolled and gone before the window opens: closed 2026-05-31, window starts 06-10.
    await repo.enrol(before.id, batch.id, civilDate("2026-05-10"));
    await prisma.enrolment.updateMany({
      where: { studentId: before.id },
      data: { endDate: new Date(Date.UTC(2026, 4, 31)) },
    });

    const rows = await repo.enrolmentsInRange(batch.id, civilDate("2026-06-10"), civilDate("2026-07-09"));

    expect(rows.map((r) => r.studentId)).toEqual([inside.id]);
    expect(rows[0]!.displayName).toBe("Bea");
    expect(rows[0]!.startDate).toBe("2026-06-01");
    expect(rows[0]!.endDate).toBeNull();
  });

  it("listEnrolmentsForStudents returns every interval for every id asked for", async () => {
    const a = await repo.create({
      name: "Batch Multi A", startDate: civilDate("2026-05-10"), endDate: civilDate("2026-11-09"),
    });
    const b = await repo.create({
      name: "Batch Multi B", startDate: civilDate("2026-05-10"), endDate: civilDate("2026-11-09"),
    });
    const mover = await prisma.user.create({
      data: { externalId: "multi-mover", email: "multi-mover@dev.local", displayName: "Mover", role: "STUDENT" },
    });
    const stayer = await prisma.user.create({
      data: { externalId: "multi-stayer", email: "multi-stayer@dev.local", displayName: "Stayer", role: "STUDENT" },
    });
    await repo.enrol(mover.id, a.id, civilDate("2026-05-10"));
    await repo.transfer(mover.id, b.id, civilDate("2026-06-10"));
    await repo.enrol(stayer.id, a.id, civilDate("2026-05-10"));

    const rows = await repo.listEnrolmentsForStudents([mover.id, stayer.id]);

    expect(rows.filter((r) => r.studentId === mover.id)).toHaveLength(2);
    expect(rows.filter((r) => r.studentId === stayer.id)).toHaveLength(1);
  });
```

- [ ] **Step 3: Run them to verify they fail**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api exec vitest run test/batch-repo.test.ts
```

Expected: FAIL — `repo.enrolmentsInRange is not a function`.

- [ ] **Step 4: Add the batch-repo methods**

In `apps/api/src/db/batch-repo.ts`, add the exported record type above `BatchRepo`:

```ts
/** One enrolment interval plus the student's identity — the batch-dashboard membership read. */
export interface RosterEnrolment {
  studentId: string;
  displayName: string;
  email: string;
  startDate: CivilDate;
  endDate: CivilDate | null;
}
```

Add to the `BatchRepo` interface:

```ts
  /** Every interval belonging to any of `studentIds`, start date ascending. The batched sibling of listEnrolments (ADR-0018). */
  listEnrolmentsForStudents(studentIds: string[]): Promise<EnrolmentRecord[]>;
  /**
   * Enrolments in `batchId` overlapping [from, to] — startDate <= to AND
   * (endDate IS NULL OR endDate >= from) — excluding soft-deleted users,
   * ordered by displayName. One query in place of a rosterMembers call per
   * date (ADR-0018); per-day membership is then decided in memory.
   */
  enrolmentsInRange(batchId: string, from: CivilDate, to: CivilDate): Promise<RosterEnrolment[]>;
```

And in `createBatchRepo`'s returned object:

```ts
    async listEnrolmentsForStudents(studentIds) {
      if (studentIds.length === 0) return [];
      const rows = await prisma.enrolment.findMany({
        where: { studentId: { in: studentIds } },
        orderBy: { startDate: "asc" },
      });
      return rows.map(mapEnrolment);
    },

    async enrolmentsInRange(batchId, from, to) {
      const rows = await prisma.enrolment.findMany({
        where: {
          batchId,
          startDate: { lte: toDbDate(to) },
          OR: [{ endDate: null }, { endDate: { gte: toDbDate(from) } }],
          student: { deletedAt: null },
        },
        include: { student: { select: { id: true, displayName: true, email: true } } },
        orderBy: { student: { displayName: "asc" } },
      });
      return rows.map((r) => ({
        studentId: r.student.id,
        displayName: r.student.displayName,
        email: r.student.email,
        startDate: fromDbDate(r.startDate),
        endDate: r.endDate === null ? null : fromDbDate(r.endDate),
      }));
    },
```

- [ ] **Step 5: Run the repo tests to verify they pass**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api exec vitest run test/batch-repo.test.ts
```

Expected: PASS, including the file's pre-existing tests.

- [ ] **Step 6: Add the batched entry and absence reads**

In `apps/api/src/db/entry-repo.ts`, add to the `EntryRepo` interface:

```ts
  /** Batched sibling of listEntries — same ordering, one query for many students (ADR-0018). */
  listEntriesForStudents(studentIds: string[], from: CivilDate, to: CivilDate): Promise<EntryRecord[]>;
  /** Batched sibling of listReports (ADR-0018). */
  listReportsForStudents(studentIds: string[], from: CivilDate, to: CivilDate): Promise<DailyReportRecord[]>;
```

and to the returned object:

```ts
    async listEntriesForStudents(studentIds, from, to) {
      if (studentIds.length === 0) return [];
      const rows = await prisma.entry.findMany({
        where: { studentId: { in: studentIds }, entryDate: { gte: toDbDate(from), lte: toDbDate(to) } },
        orderBy: [{ entryDate: "asc" }, { submittedAt: "asc" }],
      });
      return rows.map(mapEntry);
    },

    async listReportsForStudents(studentIds, from, to) {
      if (studentIds.length === 0) return [];
      const rows = await prisma.dailyReport.findMany({
        where: { studentId: { in: studentIds }, reportDate: { gte: toDbDate(from), lte: toDbDate(to) } },
        orderBy: { reportDate: "asc" },
      });
      return rows.map((r) => ({
        id: r.id, studentId: r.studentId, reportDate: fromDbDate(r.reportDate), status: r.status,
      }));
    },
```

In `apps/api/src/db/absence-repo.ts`, add to the `AbsenceRepo` interface:

```ts
  /** Batched sibling of listForStudent (ADR-0018). */
  listForStudents(studentIds: string[], from: CivilDate, to: CivilDate): Promise<AbsenceRecordShape[]>;
```

and to the returned object:

```ts
    async listForStudents(studentIds, from, to) {
      if (studentIds.length === 0) return [];
      const rows = await prisma.absenceRecord.findMany({
        where: { studentId: { in: studentIds }, date: { gte: toDbDate(from), lte: toDbDate(to) } },
        orderBy: { date: "asc" },
      });
      return rows.map((r) => ({ id: r.id, studentId: r.studentId, date: fromDbDate(r.date), reason: r.reason }));
    },
```

Add the matching `unused` lines to the three fakes — `listEntriesForStudents: unused, listReportsForStudents: unused` in `apps/api/test/helpers/fake-entry-repo.ts`, `listForStudents: unused` in `fake-absence-repo.ts`, `listEnrolmentsForStudents: unused, enrolmentsInRange: unused` in `fake-batch-repo.ts`.

- [ ] **Step 7: Write the failing day-service test**

Append to `apps/api/test/day-service.test.ts`, inside its existing `describe.skipIf(!dbUrl)` block (reuse the file's own `MON_ON_TIME`/`NOW` style constants — read them first and follow the names actually there):

```ts
  it("listDaysForStudents classifies every requested student in one pass, and agrees with listDays student-by-student", async () => {
    const batch = await batchRepo.create({
      name: "Batch Batched", startDate: civilDate("2026-05-10"), endDate: civilDate("2026-11-09"),
    });
    const one = await prisma.user.create({
      data: { externalId: "batched-1", email: "batched-1@dev.local", displayName: "One", role: "STUDENT" },
    });
    const two = await prisma.user.create({
      data: { externalId: "batched-2", email: "batched-2@dev.local", displayName: "Two", role: "STUDENT" },
    });
    await batchRepo.enrol(one.id, batch.id, civilDate("2026-05-10"));
    await batchRepo.enrol(two.id, batch.id, civilDate("2026-05-10"));
    // 2026-06-01 is a Monday. One submits on time; Two submits nothing.
    await entryRepo.addEntry({
      studentId: one.id,
      entryDate: civilDate("2026-06-01"),
      body: "Batched read fixture entry.",
      submittedAt: colomboInstant(civilDate("2026-06-01"), "10:00"),
    });
    const now = colomboInstant(civilDate("2026-06-15"), "10:00");

    const batched = await service.listDaysForStudents(
      [one.id, two.id], civilDate("2026-06-01"), civilDate("2026-06-05"), now,
    );

    expect([...batched.keys()].sort()).toEqual([one.id, two.id].sort());
    expect(batched.get(one.id)).toHaveLength(5);
    expect(batched.get(one.id)![0]!.status).toBe("onTime");
    expect(batched.get(two.id)![0]!.status).toBe("missed");

    for (const id of [one.id, two.id]) {
      const single = await service.listDays(id, civilDate("2026-06-01"), civilDate("2026-06-05"), now);
      expect(batched.get(id)).toEqual(single);
    }
  });

  it("listDaysForStudents returns an empty map for an empty id list, without querying", async () => {
    const now = colomboInstant(civilDate("2026-06-15"), "10:00");
    const batched = await service.listDaysForStudents([], civilDate("2026-06-01"), civilDate("2026-06-05"), now);
    expect(batched.size).toBe(0);
  });
```

- [ ] **Step 8: Run it to verify it fails**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api exec vitest run test/day-service.test.ts
```

Expected: FAIL — `service.listDaysForStudents is not a function`.

- [ ] **Step 9: Implement `listDaysForStudents` and make `listDays` delegate**

Replace the body of `apps/api/src/services/day-service.ts` below the imports. Keep the existing `DayView`, `isEnrolledOn` and the file's doc comment; extend the interface and the factory:

```ts
export interface DayService {
  listDays(studentId: string, from: CivilDate, to: CivilDate, now: Date): Promise<DayView[]>;
  /**
   * The same classification for many students in one pass — four
   * `WHERE studentId IN (...)` reads instead of four per student (ADR-0018).
   * Every requested id gets a key, even one with no rows at all, so a caller
   * never has to distinguish "absent from the map" from "no activity".
   */
  listDaysForStudents(
    studentIds: string[], from: CivilDate, to: CivilDate, now: Date,
  ): Promise<Map<string, DayView[]>>;
}

export function createDayService(deps: {
  entryRepo: Pick<EntryRepo, "listEntries" | "listReports" | "listEntriesForStudents" | "listReportsForStudents">;
  absenceRepo: Pick<AbsenceRepo, "listForStudent" | "listForStudents">;
  batchRepo: Pick<BatchRepo, "listEnrolments" | "listEnrolmentsForStudents">;
}): DayService {
  /** Group rows by studentId, seeding every requested id so no key is missing. */
  function groupBy<T extends { studentId: string }>(rows: T[], ids: string[]): Map<string, T[]> {
    const out = new Map<string, T[]>(ids.map((id) => [id, []]));
    for (const row of rows) out.get(row.studentId)?.push(row);
    return out;
  }

  /** The per-student assembly both entry points share. Pure — no I/O. */
  function assemble(
    entries: EntryRecord[],
    absences: { date: CivilDate; reason: string }[],
    reports: { id: string; reportDate: CivilDate; status: DailyReportStatus }[],
    enrolments: EnrolmentRecord[],
    from: CivilDate,
    to: CivilDate,
    now: Date,
  ): DayView[] {
    const entriesByDate = new Map<CivilDate, EntryRecord[]>();
    for (const e of entries) {
      // An entry whose submittedAt is still in the future relative to `now`
      // has not happened yet as of this view. Only reachable when a caller
      // evaluates an instant earlier than a stored submission — production
      // always passes `now = new Date()`, so a real submission is never
      // ahead of it. Without the guard a not-yet-submitted entry reads as
      // onTime/late, which is exactly what `future` protects against
      // further up. (Corrected 2026-08-03: the original Step 9 text omitted
      // this and Task 2's own service test caught it.)
      if (e.submittedAt.getTime() > now.getTime()) continue;
      const bucket = entriesByDate.get(e.entryDate) ?? [];
      bucket.push(e);
      entriesByDate.set(e.entryDate, bucket);
    }
    const absenceByDate = new Map(absences.map((a) => [a.date, a.reason]));
    const reportByDate = new Map(reports.map((r) => [r.reportDate, r]));

    const days: DayView[] = [];
    for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) {
      const dayEntries = entriesByDate.get(d) ?? [];
      const first = dayEntries[0]; // ordered submittedAt asc within a date
      const report = reportByDate.get(d) ?? null;
      const hasAbsence = absenceByDate.has(d);

      const status: DayStatus =
        dayEntries.length === 0 && !isEnrolledOn(enrolments, d)
          ? "none"
          : classifyDay(
              d,
              first !== undefined
                ? { hasEntry: true, firstEntryAt: first.submittedAt, hasAbsence }
                : { hasEntry: false, firstEntryAt: null, hasAbsence },
              now,
            );

      days.push({
        date: d,
        status,
        reportId: report?.id ?? null,
        reportStatus: report?.status ?? null,
        absenceReason: absenceByDate.get(d) ?? null,
        entries: dayEntries,
      });
    }
    return days;
  }

  return {
    async listDays(studentId, from, to, now) {
      const byStudent = await this.listDaysForStudents([studentId], from, to, now);
      return byStudent.get(studentId) ?? [];
    },

    async listDaysForStudents(studentIds, from, to, now) {
      const ids = [...new Set(studentIds)];
      if (ids.length === 0) return new Map();

      const [entries, absences, reports, enrolments] = await Promise.all([
        deps.entryRepo.listEntriesForStudents(ids, from, to),
        deps.absenceRepo.listForStudents(ids, from, to),
        deps.entryRepo.listReportsForStudents(ids, from, to),
        deps.batchRepo.listEnrolmentsForStudents(ids),
      ]);

      const entriesBy = groupBy(entries, ids);
      const absencesBy = groupBy(absences, ids);
      const reportsBy = groupBy(reports, ids);
      const enrolmentsBy = groupBy(enrolments, ids);

      return new Map(
        ids.map((id) => [
          id,
          assemble(
            entriesBy.get(id) ?? [], absencesBy.get(id) ?? [], reportsBy.get(id) ?? [],
            enrolmentsBy.get(id) ?? [], from, to, now,
          ),
        ]),
      );
    },
  };
}
```

Note `listDays` now calls `this.listDaysForStudents` — an object-literal method, so `this` is the returned service; do not convert it to an arrow function.

The `Pick<...>` dependency types widened, so `AbsenceRecordShape` and `DailyReportStatus` must both be imported. Adjust the imports at the top of the file to whatever the implementation actually references and let `pnpm typecheck` arbitrate.

- [ ] **Step 10: Run the whole API suite**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api test
```

Expected: PASS, all files. The pre-existing `day-service`, `roster-service`, `me-days-endpoint` and `reviews-endpoint` suites are the regression guard for the delegation — if any of them moved, the refactor changed behaviour and must be fixed, not the test.

- [ ] **Step 11: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: clean.

- [ ] **Step 12: Commit**

```bash
git add docs/adr/0018-batched-cycle-read-for-dashboards.md apps/api/src apps/api/test
git commit -m "perf(api): batched cycle read for dashboard aggregates (ADR-0018)"
```

---

## Task 2: `GET /batches/{id}/dashboard/today` — FR-28's figures

The must-ship endpoint. It answers FR-28 completely: "N of M submitted" for the batch's current required day, late and absent counts, and the per-day series the cycle ribbon renders. Spec and handler land together — a partial OpenAPI document cannot lint clean.

**Files:**
- Create: `docs/adr/0019-dashboard-cycles-addressed-by-engine-sequence.md`
- Create: `apps/api/src/services/dashboard-service.ts`
- Create: `apps/api/src/routes/dashboards.ts`
- Create: `apps/api/test/helpers/fake-dashboard-service.ts`
- Create: `apps/api/test/dashboard-service.test.ts`
- Create: `apps/api/test/dashboards-endpoint.test.ts`
- Modify: `spec/openapi.yaml`, `apps/api/src/server.ts`, `apps/api/src/index.ts`, `apps/api/test/helpers/build-test-server.ts`, `apps/api/test/auth-jwks-failure.test.ts`, `apps/api/test/server.test.ts`

**Interfaces:**
- Consumes: `DayService.listDaysForStudents`, `BatchRepo.enrolmentsInRange`, `BatchRepo.getBatch` (Task 1); `cycleContaining`, `cycleFor`, `cycleWorkingDays`, `isWeekday`, `previousWeekday`, `toProgrammeDate`, `compareDates` from `@irp/core`; `BatchNotFoundError` from `../domain/errors.js`.
- Produces:
  - `CycleView = { seq: number | null; startDate: CivilDate; endDate: CivilDate; requiredDayCount: number }`
  - `DayCompliance = { date: CivilDate; enrolled: number; submitted: number; late: number; absent: number; missed: number; pending: number }`
  - `BatchTodayView = { batch: BatchRecord; date: CivilDate; isFallbackDay: boolean; dayNumber: number; cycle: CycleView; counts: DayCompliance; extraCount: number; days: DayCompliance[]; extraAfter: CivilDate[] }`
  - `DashboardService.batchToday(batchId: string, now: Date): Promise<BatchTodayView>`
  - SDK: `getBatchDashboardToday({ client, path: { id } })`

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0019-dashboard-cycles-addressed-by-engine-sequence.md`:

```markdown
# ADR-0019 — Dashboard cycles are addressed by engine-computed sequence

**Status:** Accepted · **Date:** 2026-08-03 · **Plan:** 7, Task 2

## Context

Two dashboard endpoints have to name a cycle: `GET /batches/{id}/dashboard/summary`
takes `?cycle=`, and both responses report which cycle they describe. Three
addressing schemes were available, and the `Cycle` table already exists
(materialised by `CycleRepo.ensureCycles`, so `Evaluation` has a stable FK).

## Decision

A cycle is addressed by its **1-based sequence within the batch**, computed by
`@irp/core` (`cycleFor(date, batch.startDate).index`, anchored on
`firstEvaluatedCycleStart`). Bounds come from `cycleContaining`/`shiftCycle`.
The dashboards never read or write the `Cycle` table.

`seq` is nullable in every response: a batch whose first evaluated cycle has not
opened yet has no sequence for today, and FR-27 says a student who joins partway
through a cycle is not evaluated for it. `null` is the honest answer, and the UI
renders a "starts on the 10th" state rather than a fabricated "Cycle 0".

## Rejected alternatives

**`?cycleId=<uuid>` against the materialised `Cycle` row.** Referentially tidy,
and it is what `Evaluation` will use. Rejected because the rows are a *cache* of
the engine's output (spec §3), populated by `ensureCycles` — so a `GET` would
either 404 on a batch nobody had seeded yet, or have to materialise rows as a
side effect. A read endpoint that writes is a worse trade than a derived integer.

**`?from=&to=` date range.** Reuses the shape `/me/days` already has. Rejected
because it lets a caller invent a window that is not a cycle, and every figure
downstream — "Month N of 6", cycle compliance, the ribbon's day count — is only
meaningful on a real 10th-to-9th boundary. Accepting arbitrary ranges would make
a wrong denominator a caller error instead of an impossibility.

## Consequences

Dashboards and evaluations will address cycles differently — sequence here, row
id in Plan 9. That is deliberate: the sequence is a coordinate, the row is a
foreign key, and `(batchId, seq)` is unique, so the two are convertible in one
lookup whenever Plan 9 needs it.
```

- [ ] **Step 2: Add the spec — tag, schemas, operation**

In `spec/openapi.yaml`, append to the `tags:` list (after the `Reviews` entry):

```yaml
  - name: Dashboards
    description: Derived, read-only summaries — the mentor's batch view (FR-28) and the student's own month (FR-29). Every figure is computed per request; nothing here is stored.
```

Add these four schemas to `components.schemas` (4-space indent, alongside `RosterRow`):

```yaml
    CycleView:
      type: object
      title: CycleView
      description: |
        Which evaluation cycle a dashboard describes. Bounds are the fixed
        10th-to-9th calendar window (FR-9); `seq` is the batch's own 1-based
        numbering, anchored on its first evaluated cycle (ADR-0019).
      required: [seq, startDate, endDate, requiredDayCount]
      additionalProperties: false
      properties:
        seq:
          oneOf:
            - type: integer
              minimum: 1
            - type: 'null'
          description: The cycle's 1-based position in the batch's programme, or null when the batch's first evaluated cycle has not opened yet (FR-27).
          examples:
            - 3
        startDate:
          type: string
          format: date
          description: First day of the cycle, inclusive — always a 10th.
          examples:
            - '2026-07-10'
        endDate:
          type: string
          format: date
          description: Last day of the cycle, inclusive — always a 9th.
          examples:
            - '2026-08-09'
        requiredDayCount:
          type: integer
          minimum: 0
          description: Weekdays in the cycle. Weekends are excluded — they carry no obligation and never enter a denominator (FR-12).
          examples:
            - 22

    DayCompliance:
      type: object
      title: DayCompliance
      description: |
        One required day, counted across a batch. `submitted` includes late
        submissions — a late entry is still submitted — and `late` reports how
        many of them were. Extra (weekend) work never appears here (FR-12/FR-33).
        Days nobody has reached yet report `enrolled` with every other count at
        zero.
      required: [date, enrolled, submitted, late, absent, missed, pending]
      additionalProperties: false
      properties:
        date:
          type: string
          format: date
          description: The required day (Asia/Colombo).
          examples:
            - '2026-08-03'
        enrolled:
          type: integer
          minimum: 0
          description: Students enrolled in the batch on this day — the "M" in "N of M".
          examples:
            - 10
        submitted:
          type: integer
          minimum: 0
          description: Students with at least one entry for this day, late included — the "N" in "N of M".
          examples:
            - 8
        late:
          type: integer
          minimum: 0
          description: How many of the submissions landed after the day ended but inside grace (FR-13).
          examples:
            - 2
        absent:
          type: integer
          minimum: 0
          description: Students who explicitly recorded an absence with a reason (FR-16).
          examples:
            - 1
        missed:
          type: integer
          minimum: 0
          description: Students with no entry and no absence, past the grace window (FR-14). Final.
          examples:
            - 0
        pending:
          type: integer
          minimum: 0
          description: Students with nothing recorded whose grace window is still open. Not yet a miss.
          examples:
            - 1

    BatchTodayDashboard:
      type: object
      title: BatchTodayDashboard
      description: |
        FR-28's answer for one batch: today's "N of M submitted" with late and
        absent counts, plus the whole cycle's per-day series that the cycle
        ribbon renders. `counts` is `days` entry for `date` — repeated at the
        top level so the required figures are first-class rather than something
        the client has to find.
      required: [batchId, batchName, date, isFallbackDay, dayNumber, cycle, counts, extraCount, days, extraAfter]
      additionalProperties: false
      properties:
        batchId:
          type: string
          format: uuid
          description: The batch this dashboard describes.
          examples:
            - 9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b
        batchName:
          type: string
          description: The batch's display name.
          examples:
            - Batch Aurora
        date:
          type: string
          format: date
          description: The required day being reported — today when today is a weekday, otherwise the most recent required day in this cycle.
          examples:
            - '2026-08-03'
        isFallbackDay:
          type: boolean
          description: True when `date` is not today — a weekend, or a cycle that opened on one. The interface must label the figures as belonging to an earlier day rather than presenting them as today's.
          examples:
            - false
        dayNumber:
          type: integer
          minimum: 1
          description: Position of `date` among the cycle's required days, 1-based — the "Day 12 of 22" figure.
          examples:
            - 17
        cycle:
          $ref: '#/components/schemas/CycleView'
        counts:
          $ref: '#/components/schemas/DayCompliance'
        extraCount:
          type: integer
          minimum: 0
          description: Weekend Extra entries recorded anywhere in this cycle by this batch (FR-33). A count, never a compliance state.
          examples:
            - 3
        days:
          type: array
          description: Every required day in the cycle, earliest first. Weekends are absent by construction.
          items:
            $ref: '#/components/schemas/DayCompliance'
        extraAfter:
          type: array
          description: Required days immediately preceding a weekend somebody actually worked. The ribbon draws a half-width Extra slot after each (FR-33).
          items:
            type: string
            format: date
          examples:
            - ['2026-07-31']
```

Add the operation to `paths` (2-space indent), directly after `/api/v1/batches/{id}/roster`:

```yaml
  /api/v1/batches/{id}/dashboard/today:
    get:
      operationId: getBatchDashboardToday
      summary: Today's submission figures for a batch
      description: |
        FR-28, the must-ship mentor figure: "N of M submitted" for the batch's
        current required day, with late, absent and missed counts, plus the
        per-day series the cycle ribbon renders over the whole current cycle.

        Weekends carry no obligation, so on a Saturday or Sunday the endpoint
        reports the most recent required day in the cycle and sets
        `isFallbackDay`. Every figure is derived per request from the same
        classification the student's own day view uses; nothing is stored.
        Mentor only.
      tags: [Dashboards]
      parameters:
        - name: id
          in: path
          required: true
          description: The batch id.
          schema:
            type: string
            format: uuid
            examples:
              - 9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b
      responses:
        '200':
          description: The batch's current-cycle dashboard.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BatchTodayDashboard'
              examples:
                midCycle:
                  summary: Day 17 of a 22-day cycle, one weekend worked
                  value:
                    batchId: 9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b
                    batchName: Batch Aurora
                    date: '2026-08-03'
                    isFallbackDay: false
                    dayNumber: 17
                    cycle:
                      seq: 3
                      startDate: '2026-07-10'
                      endDate: '2026-08-09'
                      requiredDayCount: 22
                    counts:
                      date: '2026-08-03'
                      enrolled: 10
                      submitted: 8
                      late: 2
                      absent: 1
                      missed: 0
                      pending: 1
                    extraCount: 3
                    days:
                      - date: '2026-08-03'
                        enrolled: 10
                        submitted: 8
                        late: 2
                        absent: 1
                        missed: 0
                        pending: 1
                    extraAfter:
                      - '2026-07-31'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/InternalServerError'
```

- [ ] **Step 3: Lint the spec and regenerate**

```bash
pnpm spec:lint && pnpm generate
```

Expected: `redocly` reports zero errors and zero warnings; `packages/types` and `packages/client` regenerate. `getBatchDashboardToday` must now appear in `packages/client/src/sdk.gen.ts`.

- [ ] **Step 4: Write the failing service test**

Create `apps/api/test/dashboard-service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createEntryRepo } from "../src/db/entry-repo.js";
import { createAbsenceRepo } from "../src/db/absence-repo.js";
import { createBatchRepo } from "../src/db/batch-repo.js";
import { colomboInstant } from "../src/db/civil-date-map.js";
import { createDayService } from "../src/services/day-service.js";
import { createDashboardService } from "../src/services/dashboard-service.js";
import { BatchNotFoundError } from "../src/domain/errors.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

// A fixed cycle with no dependence on the machine clock. 2026-07-10 is a
// Friday, so this cycle's required days start 07-10, 07-13 (Mon) ... and
// 2026-08-03 is the Monday three weeks in. 2026-08-05 (Wednesday) is "now".
const CYCLE_START = civilDate("2026-07-10");
const MON = civilDate("2026-08-03");
const SAT = civilDate("2026-08-01");
const NOW = colomboInstant(civilDate("2026-08-05"), "10:00");

describe.skipIf(!dbUrl)("createDashboardService — batchToday", () => {
  const prisma = createPrismaClient(dbUrl!);
  const entryRepo = createEntryRepo(prisma);
  const absenceRepo = createAbsenceRepo(prisma);
  const batchRepo = createBatchRepo(prisma);
  const dayService = createDayService({ entryRepo, absenceRepo, batchRepo });
  const dashboards = createDashboardService({ batchRepo, dayService });

  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function student(externalId: string, displayName: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName, role: "STUDENT" },
    });
  }

  it("counts N of M for the reported day, with late, absent, missed and pending split out", async () => {
    const batch = await batchRepo.create({
      name: "Batch Today", startDate: CYCLE_START, endDate: civilDate("2027-01-09"),
    });
    const onTime = await student("dash-ontime", "A OnTime");
    const late = await student("dash-late", "B Late");
    const absent = await student("dash-absent", "C Absent");
    const missed = await student("dash-missed", "D Missed");
    for (const s of [onTime, late, absent, missed]) {
      await batchRepo.enrol(s.id, batch.id, CYCLE_START);
    }

    await entryRepo.addEntry({
      studentId: onTime.id, entryDate: MON, body: "On time on the Monday.",
      submittedAt: colomboInstant(MON, "17:00"),
    });
    // Next weekday 09:40 — inside grace, flagged late by the engine.
    await entryRepo.addEntry({
      studentId: late.id, entryDate: MON, body: "Late but inside grace.",
      submittedAt: colomboInstant(civilDate("2026-08-04"), "09:40"),
    });
    await absenceRepo.create({ studentId: absent.id, date: MON, reason: "Medical appointment" });

    const view = await dashboards.batchToday(batch.id, colomboInstant(MON, "23:00"));

    expect(view.date).toBe(MON);
    expect(view.isFallbackDay).toBe(false);
    expect(view.counts.enrolled).toBe(4);
    // The late entry was written for 09:40 the NEXT day, so at 23:00 on the
    // Monday it does not exist yet: one submitted, one absent, two still open.
    expect(view.counts.submitted).toBe(1);
    expect(view.counts.absent).toBe(1);
    expect(view.counts.pending).toBe(2);
    expect(view.counts.missed).toBe(0);

    const settled = await dashboards.batchToday(batch.id, NOW);
    const monday = settled.days.find((d) => d.date === MON)!;
    expect(monday.submitted).toBe(2);
    expect(monday.late).toBe(1);
    expect(monday.absent).toBe(1);
    expect(monday.missed).toBe(1);
    expect(monday.pending).toBe(0);
  });

  it("top-level counts are exactly the days entry for the reported date", async () => {
    const batch = await batchRepo.create({
      name: "Batch Agree", startDate: CYCLE_START, endDate: civilDate("2027-01-09"),
    });
    const s = await student("dash-agree", "Agree");
    await batchRepo.enrol(s.id, batch.id, CYCLE_START);

    const view = await dashboards.batchToday(batch.id, NOW);

    expect(view.counts).toEqual(view.days.find((d) => d.date === view.date));
    expect(view.days.every((d) => d.date >= view.cycle.startDate && d.date <= view.cycle.endDate)).toBe(true);
    expect(view.days).toHaveLength(view.cycle.requiredDayCount);
    expect(view.dayNumber).toBe(view.days.findIndex((d) => d.date === view.date) + 1);
  });

  it("reports the previous required day with isFallbackDay on a weekend", async () => {
    const batch = await batchRepo.create({
      name: "Batch Weekend", startDate: CYCLE_START, endDate: civilDate("2027-01-09"),
    });
    const s = await student("dash-weekend", "Weekend");
    await batchRepo.enrol(s.id, batch.id, CYCLE_START);

    // 2026-08-01 is a Saturday.
    const view = await dashboards.batchToday(batch.id, colomboInstant(SAT, "12:00"));

    expect(view.isFallbackDay).toBe(true);
    expect(view.date).toBe(civilDate("2026-07-31")); // the Friday
  });

  it("surfaces a worked weekend as an extraAfter slot and an extraCount, never as compliance", async () => {
    const batch = await batchRepo.create({
      name: "Batch Extra", startDate: CYCLE_START, endDate: civilDate("2027-01-09"),
    });
    const s = await student("dash-extra", "Extra");
    await batchRepo.enrol(s.id, batch.id, CYCLE_START);
    await entryRepo.addEntry({
      studentId: s.id, entryDate: SAT, body: "Weekend polish on the demo.",
      submittedAt: colomboInstant(SAT, "11:00"),
    });

    const view = await dashboards.batchToday(batch.id, NOW);

    expect(view.extraCount).toBe(1);
    expect(view.extraAfter).toEqual([civilDate("2026-07-31")]);
    expect(view.days.some((d) => d.date === SAT)).toBe(false);
  });

  it("numbers the cycle from the batch's first evaluated cycle, and nulls seq before it opens", async () => {
    const current = await batchRepo.create({
      name: "Batch Seq", startDate: civilDate("2026-05-10"), endDate: civilDate("2027-01-09"),
    });
    const future = await batchRepo.create({
      name: "Batch Future", startDate: civilDate("2026-11-10"), endDate: civilDate("2027-05-09"),
    });

    // 2026-05-10 -> 2026-07-10 is two cycles on, so the current cycle is its 3rd.
    expect((await dashboards.batchToday(current.id, NOW)).cycle.seq).toBe(3);
    expect((await dashboards.batchToday(future.id, NOW)).cycle.seq).toBeNull();
  });

  it("throws BatchNotFoundError for an unknown batch id", async () => {
    await expect(dashboards.batchToday("00000000-0000-0000-0000-000000000000", NOW))
      .rejects.toBeInstanceOf(BatchNotFoundError);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api exec vitest run test/dashboard-service.test.ts
```

Expected: FAIL — cannot resolve `../src/services/dashboard-service.js`.

- [ ] **Step 6: Write the service**

Create `apps/api/src/services/dashboard-service.ts`:

```ts
import {
  compareDates, cycleContaining, cycleFor, cycleWorkingDays,
  isWeekday, previousWeekday, toProgrammeDate,
  type CivilDate, type CycleBounds, type DayStatus,
} from "@irp/core";
import type { BatchRecord, BatchRepo, RosterEnrolment } from "../db/batch-repo.js";
import type { DayService, DayView } from "./day-service.js";
import { BatchNotFoundError } from "../domain/errors.js";

export interface CycleView {
  seq: number | null;
  startDate: CivilDate;
  endDate: CivilDate;
  requiredDayCount: number;
}

export interface DayCompliance {
  date: CivilDate;
  enrolled: number;
  submitted: number;
  late: number;
  absent: number;
  missed: number;
  pending: number;
}

export interface BatchTodayView {
  batch: BatchRecord;
  date: CivilDate;
  isFallbackDay: boolean;
  dayNumber: number;
  cycle: CycleView;
  counts: DayCompliance;
  extraCount: number;
  days: DayCompliance[];
  extraAfter: CivilDate[];
}

export interface DashboardService {
  batchToday(batchId: string, now: Date): Promise<BatchTodayView>;
}

/** Whether an enrolment interval covers `d` (open-ended when endDate is null). */
function covers(e: RosterEnrolment, d: CivilDate): boolean {
  return compareDates(e.startDate, d) <= 0 && (e.endDate === null || compareDates(e.endDate, d) >= 0);
}

/**
 * The required day a batch dashboard reports on.
 *
 * Today when today is a weekday inside the cycle; otherwise the most recent
 * required day at or before today, CLAMPED to the cycle. The clamp matters at a
 * boundary: a cycle opening on a Saturday has no earlier required day of its
 * own, and reaching into last month's Friday would report figures the ribbon
 * does not contain. In that one case the cycle's FIRST required day is
 * reported instead, with every count zero — honest, and flagged by
 * `isFallbackDay` either way.
 */
export function reportedDay(requiredDays: CivilDate[], today: CivilDate): CivilDate {
  const first = requiredDays[0];
  if (first === undefined) throw new Error("dashboard: a cycle with no required days is impossible");
  let chosen = first;
  for (const d of requiredDays) {
    if (compareDates(d, today) <= 0) chosen = d;
  }
  return chosen;
}

export function createDashboardService(deps: {
  batchRepo: Pick<BatchRepo, "getBatch" | "enrolmentsInRange">;
  dayService: Pick<DayService, "listDaysForStudents">;
}): DashboardService {
  /** The engine's cycle numbering for a batch (ADR-0019). Null before its first evaluated cycle. */
  function cycleView(bounds: CycleBounds, batch: BatchRecord): CycleView {
    return {
      seq: cycleFor(bounds.start, batch.startDate)?.index ?? null,
      startDate: bounds.start,
      endDate: bounds.end,
      requiredDayCount: cycleWorkingDays(bounds).length,
    };
  }

  return {
    async batchToday(batchId, now) {
      const batch = await deps.batchRepo.getBatch(batchId);
      if (!batch) throw new BatchNotFoundError(batchId);

      const today = toProgrammeDate(now);
      const bounds = cycleContaining(today);
      const requiredDays = cycleWorkingDays(bounds);
      const enrolments = await deps.batchRepo.enrolmentsInRange(batchId, bounds.start, bounds.end);
      const studentIds = [...new Set(enrolments.map((e) => e.studentId))];
      const byStudent = await deps.dayService.listDaysForStudents(
        studentIds, bounds.start, bounds.end, now,
      );

      // Index every student's cycle once; each per-day count is then a lookup.
      const dayIndex = new Map<string, Map<CivilDate, DayView>>();
      for (const [id, days] of byStudent) {
        dayIndex.set(id, new Map(days.map((d) => [d.date, d])));
      }

      const complianceFor = (date: CivilDate): DayCompliance => {
        const counts: DayCompliance = {
          date, enrolled: 0, submitted: 0, late: 0, absent: 0, missed: 0, pending: 0,
        };
        for (const e of enrolments) {
          if (!covers(e, date)) continue;
          counts.enrolled += 1;
          const status: DayStatus | undefined = dayIndex.get(e.studentId)?.get(date)?.status;
          // A late entry IS submitted — `late` reports how many of the
          // submissions were, it is not a separate bucket (FR-13).
          if (status === "onTime" || status === "late") counts.submitted += 1;
          if (status === "late") counts.late += 1;
          if (status === "absent") counts.absent += 1;
          if (status === "missed") counts.missed += 1;
          if (status === "pending") counts.pending += 1;
        }
        return counts;
      };

      const days = requiredDays.map(complianceFor);
      const date = reportedDay(requiredDays, today);
      const counts = days.find((d) => d.date === date)!;

      // Weekend Extra (FR-33): counted from entries, never from a status, and
      // attributed to the required day it follows so the ribbon can draw a
      // half-width slot there. A weekend at the very start of a cycle maps
      // back into the previous one and is dropped rather than mis-attributed.
      let extraCount = 0;
      const extraAfter = new Set<CivilDate>();
      for (const days of byStudent.values()) {
        for (const day of days) {
          if (isWeekday(day.date)) continue;
          const extras = day.entries.filter((entry) => entry.isExtra).length;
          if (extras === 0) continue;
          extraCount += extras;
          const anchor = previousWeekday(day.date);
          if (compareDates(anchor, bounds.start) >= 0) extraAfter.add(anchor);
        }
      }

      return {
        batch,
        date,
        isFallbackDay: date !== today,
        dayNumber: days.findIndex((d) => d.date === date) + 1,
        cycle: cycleView(bounds, batch),
        counts,
        extraCount,
        days,
        extraAfter: [...extraAfter].sort(),
      };
    },
  };
}
```

- [ ] **Step 7: Run the service test to verify it passes**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api exec vitest run test/dashboard-service.test.ts
```

Expected: PASS, six tests.

- [ ] **Step 8: Write the failing endpoint test**

Create `apps/api/test/dashboards-endpoint.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { civilDate } from "@irp/core";
import { createBatchRepo } from "../src/db/batch-repo.js";
import { buildTestServer } from "./helpers/build-test-server.js";
import { resetDb } from "./helpers/db.js";
import { signToken } from "./helpers/keys.js";
import { dbUrl } from "./helpers/require-db.js";

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

interface ProblemLike { type: string; title: string; status: number; detail?: string }
interface TodayLike {
  batchId: string; batchName: string; date: string; isFallbackDay: boolean; dayNumber: number;
  cycle: { seq: number | null; startDate: string; endDate: string; requiredDayCount: number };
  counts: { enrolled: number; submitted: number; late: number; absent: number; missed: number; pending: number };
  extraCount: number; days: { date: string }[]; extraAfter: string[];
}

describe.skipIf(!dbUrl)("Dashboards: GET /api/v1/batches/{id}/dashboard/today", () => {
  let app: FastifyInstance;
  let prisma: Awaited<ReturnType<typeof buildTestServer>>["prisma"];

  beforeAll(async () => {
    ({ app, prisma } = await buildTestServer(dbUrl!));
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function mentor(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "ADMIN" },
    });
  }
  async function student(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "STUDENT" },
    });
  }
  async function batch(name: string) {
    return createBatchRepo(prisma).create({
      name, startDate: civilDate("2026-05-10"), endDate: civilDate("2027-01-09"),
    });
  }

  it("rejects a student token with 403 admin-only", async () => {
    await student("dash-ep-student");
    const b = await batch("Batch Dash 403");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/batches/${b.id}/dashboard/today`,
      headers: bearer(await signToken({ oid: "dash-ep-student" })),
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json<ProblemLike>().type).toBe("https://irp.bistec.example/problems/admin-only");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const b = await batch("Batch Dash 401");
    const res = await app.inject({ method: "GET", url: `/api/v1/batches/${b.id}/dashboard/today` });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a non-uuid batch id with 400 validation-failed", async () => {
    await mentor("dash-ep-mentor-400");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/batches/not-a-uuid/dashboard/today",
      headers: bearer(await signToken({ oid: "dash-ep-mentor-400" })),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ProblemLike>().type).toBe("https://irp.bistec.example/problems/validation-failed");
  });

  it("rejects an unknown batch id with 404 batch-not-found", async () => {
    await mentor("dash-ep-mentor-404");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/batches/00000000-0000-0000-0000-000000000000/dashboard/today",
      headers: bearer(await signToken({ oid: "dash-ep-mentor-404" })),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<ProblemLike>().type).toBe("https://irp.bistec.example/problems/batch-not-found");
  });

  it("returns the dashboard for a mentor token, with counts agreeing with the day series", async () => {
    await mentor("dash-ep-mentor-200");
    const b = await batch("Batch Dash 200");
    const s = await student("dash-ep-enrolled");
    await createBatchRepo(prisma).enrol(s.id, b.id, civilDate("2026-05-10"));

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/batches/${b.id}/dashboard/today`,
      headers: bearer(await signToken({ oid: "dash-ep-mentor-200" })),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<TodayLike>();
    expect(body.batchId).toBe(b.id);
    expect(body.batchName).toBe("Batch Dash 200");
    expect(body.days).toHaveLength(body.cycle.requiredDayCount);
    expect(body.counts.enrolled).toBe(1);
    expect(body.days[body.dayNumber - 1]!.date).toBe(body.date);
  });
});
```

- [ ] **Step 9: Run it to verify it fails**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api exec vitest run test/dashboards-endpoint.test.ts
```

Expected: FAIL — 404 from Fastify's own router (no such route), not the domain 404.

- [ ] **Step 10: Write the route**

Create `apps/api/src/routes/dashboards.ts`:

```ts
import type { FastifyPluginAsync } from "fastify";
import type { components } from "@irp/types";
import type {
  BatchTodayView, CycleView, DayCompliance, DashboardService,
} from "../services/dashboard-service.js";
import { requireAdmin } from "../plugins/roles.js";
import { UUID_PARAM } from "./schemas.js";

type ApiBatchToday = components["schemas"]["BatchTodayDashboard"];

/**
 * Domain views are already the wire shape field-for-field, so these mappers
 * are structural copies rather than translations. They exist anyway: the
 * explicit return type is what makes a spec change that the service has not
 * followed a compile error instead of a silently wrong payload.
 */
function toApiCycle(c: CycleView): components["schemas"]["CycleView"] {
  return { seq: c.seq, startDate: c.startDate, endDate: c.endDate, requiredDayCount: c.requiredDayCount };
}

function toApiDayCompliance(d: DayCompliance): components["schemas"]["DayCompliance"] {
  return {
    date: d.date, enrolled: d.enrolled, submitted: d.submitted,
    late: d.late, absent: d.absent, missed: d.missed, pending: d.pending,
  };
}

function toApiBatchToday(v: BatchTodayView): ApiBatchToday {
  return {
    batchId: v.batch.id,
    batchName: v.batch.name,
    date: v.date,
    isFallbackDay: v.isFallbackDay,
    dayNumber: v.dayNumber,
    cycle: toApiCycle(v.cycle),
    counts: toApiDayCompliance(v.counts),
    extraCount: v.extraCount,
    days: v.days.map(toApiDayCompliance),
    extraAfter: [...v.extraAfter],
  };
}

export const dashboardRoutes: FastifyPluginAsync<{
  dashboardService: DashboardService;
  // eslint-disable-next-line @typescript-eslint/require-await
}> = async (app, opts) => {
  app.get<{ Params: { id: string } }>(
    "/api/v1/batches/:id/dashboard/today",
    { schema: { params: UUID_PARAM }, preHandler: [app.authenticate] },
    async (req): Promise<ApiBatchToday> => {
      requireAdmin(req);
      return toApiBatchToday(await opts.dashboardService.batchToday(req.params.id, new Date()));
    },
  );
};
```

- [ ] **Step 11: Wire it into the server**

In `apps/api/src/server.ts`: add `import { dashboardRoutes } from "./routes/dashboards.js";` and `import type { DashboardService } from "./services/dashboard-service.js";`, add `dashboardService: DashboardService;` to `ServerDeps`, and register it after `batchRoutes`:

```ts
  await app.register(dashboardRoutes, { dashboardService: deps.dashboardService });
```

In `apps/api/src/index.ts`: `import { createDashboardService } from "./services/dashboard-service.js";`, then inside `start`:

```ts
    const dashboardService = createDashboardService({ batchRepo, dayService });
```

and add `dashboardService` to the `buildServer({ ... })` argument object.

Create `apps/api/test/helpers/fake-dashboard-service.ts`:

```ts
import type { DashboardService } from "../../src/services/dashboard-service.js";

/**
 * A stub for suites that construct `buildServer` without a database
 * connection (auth/plumbing tests). No dashboard route is exercised in those
 * files, so every method throws if it is ever reached — that is a test bug,
 * not a legitimate call path. Same pattern as `unusedRosterService`.
 */
export function unusedDashboardService(): DashboardService {
  const unused = () => {
    throw new Error("unused: dashboardService was not expected to be called in this suite");
  };
  return { batchToday: unused };
}
```

In `apps/api/test/helpers/build-test-server.ts`, build the real one alongside the roster service and pass it:

```ts
  const dashboardService = createDashboardService({ batchRepo, dayService });
```

In `apps/api/test/auth-jwks-failure.test.ts` (both `buildServer` calls) and `apps/api/test/server.test.ts`, add `dashboardService: unusedDashboardService(),`.

- [ ] **Step 12: Run the endpoint test, then the whole suite**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api exec vitest run test/dashboards-endpoint.test.ts
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api test
```

Expected: PASS both. `fail-closed.test.ts`'s route-discovery guard must still pass — it asserts every `/api/` route sits behind the auth preHandler, and the new route does.

- [ ] **Step 13: Verify and commit**

```bash
pnpm spec:lint && pnpm typecheck && pnpm lint
git add spec/openapi.yaml docs/adr/0019-dashboard-cycles-addressed-by-engine-sequence.md apps/api
git commit -m "feat(api): batch today dashboard — FR-28 figures and the ribbon series (ADR-0019)"
```

---

## Task 3: `GET /batches/{id}/dashboard/summary` — per-student cycle compliance

The Cycles page's data: one row per enrolled student for one cycle, with compliance, the late/missed/absent/extra split, and review progress. No scores — none exist (spec D2), and the "awaiting evaluation" state is rendered by the UI without an API field, so the contract stays honest about what this slice has.

**Files:**
- Modify: `spec/openapi.yaml`, `apps/api/src/services/dashboard-service.ts`, `apps/api/src/routes/dashboards.ts`, `apps/api/src/routes/schemas.ts`, `apps/api/src/domain/errors.ts`, `apps/api/test/helpers/fake-dashboard-service.ts`
- Test: `apps/api/test/dashboard-service.test.ts`, `apps/api/test/dashboards-endpoint.test.ts`, `apps/api/test/problem-details-domain.test.ts`

**Interfaces:**
- Consumes: everything Task 2 produced, plus `firstEvaluatedCycleStart`, `shiftCycle` from `@irp/core`.
- Produces:
  - `CycleCounts = { requiredDays: number; settledDays: number; onTime: number; late: number; absent: number; missed: number; pending: number; extra: number; complianceRate: number | null }`
  - `ReviewProgress = { submitted: number; inReview: number; evaluated: number }`
  - `StudentSummaryView = { student: { id: string; displayName: string; email: string }; counts: CycleCounts; reviewProgress: ReviewProgress }`
  - `BatchSummaryView = { batch: BatchRecord; cycle: CycleView; students: StudentSummaryView[] }`
  - `DashboardService.batchSummary(batchId: string, cycleSeq: number | undefined, now: Date): Promise<BatchSummaryView>`
  - `InvalidCycleError` (400, `invalid-cycle`)
  - SDK: `getBatchDashboardSummary({ client, path: { id }, query: { cycle } })`

**Compliance definition — decide once, here.** `complianceRate = (onTime + late + absent) / settledDays`, where `settledDays` counts only required days whose outcome is final (`onTime`/`late`/`absent`/`missed`). Days still inside grace (`pending`) and days not yet reached (`future`) are excluded from both sides, so today's rate never dips just because the afternoon is young. Absence counts as compliant — `// ASSUMPTION: O-7`, which currently reads "absence carries no automatic score penalty". `null` when `settledDays === 0`; a brand-new batch renders "—", not "0%".

- [ ] **Step 1: Add the domain error**

Append to `apps/api/src/domain/errors.ts`:

```ts
export class InvalidCycleError extends DomainError {
  readonly code = "invalid-cycle";
  readonly status = 400;
  readonly title = "Invalid cycle";
  constructor(detail: string) {
    super(detail);
  }
}
```

Add a case to `apps/api/test/problem-details-domain.test.ts` mirroring how that file already asserts one domain error maps to its status/type — read the file and follow its existing table or per-error shape exactly.

- [ ] **Step 2: Add the spec schemas and operation**

Add to `components.schemas`:

```yaml
    CycleCounts:
      type: object
      title: CycleCounts
      description: |
        One student's required-day outcomes over one cycle. Denominators count
        required days only (FR-12); `extra` is weekend entries and is reported
        beside them, never inside them (FR-33).

        `complianceRate` divides accounted-for days (on time + late + absent)
        by SETTLED days — those whose outcome is final. Days still inside the
        grace window and days not yet reached are in neither side, so the rate
        does not dip merely because the afternoon is young. Absence counts as
        accounted-for: it is recorded with a reason and carries no penalty
        (assumption O-7).
      required: [requiredDays, settledDays, onTime, late, absent, missed, pending, extra, complianceRate]
      additionalProperties: false
      properties:
        requiredDays:
          type: integer
          minimum: 0
          description: Weekdays in the cycle the student was enrolled for. Fewer than the cycle's total for a mid-cycle joiner or a transfer (FR-27).
          examples:
            - 22
        settledDays:
          type: integer
          minimum: 0
          description: Required days whose outcome is final — on time, late, absent or missed.
          examples:
            - 17
        onTime:
          type: integer
          minimum: 0
          description: Required days submitted before the day ended.
          examples:
            - 13
        late:
          type: integer
          minimum: 0
          description: Required days submitted after the day ended but inside grace (FR-13).
          examples:
            - 2
        absent:
          type: integer
          minimum: 0
          description: Weekdays explicitly marked absent with a reason (FR-16).
          examples:
            - 1
        missed:
          type: integer
          minimum: 0
          description: Weekdays with no entry and no absence, past grace (FR-14).
          examples:
            - 1
        pending:
          type: integer
          minimum: 0
          description: Required days with nothing recorded whose grace window is still open.
          examples:
            - 1
        extra:
          type: integer
          minimum: 0
          description: Weekend entries in the cycle (FR-33). Never required, never penalised by its absence, never in a denominator.
          examples:
            - 2
        complianceRate:
          oneOf:
            - type: number
              minimum: 0
              maximum: 1
            - type: 'null'
          description: Accounted-for settled days as a fraction, rounded to four decimals. Null when no day has settled yet — render a dash, not a zero.
          examples:
            - 0.9412

    ReviewProgress:
      type: object
      title: ReviewProgress
      description: The student's daily reports in this cycle by review state (FR-18). Forward-only; there is no Rejected state.
      required: [submitted, inReview, evaluated]
      additionalProperties: false
      properties:
        submitted:
          type: integer
          minimum: 0
          description: Reports awaiting a mentor's first look.
          examples:
            - 4
        inReview:
          type: integer
          minimum: 0
          description: Reports a mentor has opened but not finished.
          examples:
            - 3
        evaluated:
          type: integer
          minimum: 0
          description: Reports finished and locked for the student (FR-20).
          examples:
            - 10

    StudentCycleSummary:
      type: object
      title: StudentCycleSummary
      description: |
        One enrolled student's cycle at a glance, for the mentor's Cycles view.
        Carries no score and no rank — no evaluation exists in this slice
        (O-5 blocks the AI provider decision), so the interface renders an
        "awaiting evaluation" state rather than the API returning an always-null
        field.
      required: [student, counts, reviewProgress]
      additionalProperties: false
      properties:
        student:
          type: object
          description: The enrolled student.
          required: [id, displayName, email]
          additionalProperties: false
          properties:
            id:
              type: string
              format: uuid
              description: User id.
              examples:
                - 3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8
            displayName:
              type: string
              description: Name as shown in the interface.
              examples:
                - Amaya Wickramasinghe
            email:
              type: string
              format: email
              description: Bistec account email.
              examples:
                - amaya@dev.local
        counts:
          $ref: '#/components/schemas/CycleCounts'
        reviewProgress:
          $ref: '#/components/schemas/ReviewProgress'

    BatchCycleSummary:
      type: object
      title: BatchCycleSummary
      description: Every student enrolled in a batch during one cycle, with that cycle's compliance figures.
      required: [batchId, batchName, cycle, students]
      additionalProperties: false
      properties:
        batchId:
          type: string
          format: uuid
          description: The batch summarised.
          examples:
            - 9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b
        batchName:
          type: string
          description: The batch's display name.
          examples:
            - Batch Aurora
        cycle:
          $ref: '#/components/schemas/CycleView'
        students:
          type: array
          description: One row per student enrolled at any point in the cycle, ordered by display name.
          items:
            $ref: '#/components/schemas/StudentCycleSummary'
```

Add the operation after `/api/v1/batches/{id}/dashboard/today`:

```yaml
  /api/v1/batches/{id}/dashboard/summary:
    get:
      operationId: getBatchDashboardSummary
      summary: Per-student compliance for one cycle
      description: |
        One row per student enrolled in the batch at any point during the
        cycle, with required-day outcomes, weekend Extra, and review progress.
        Defaults to the current cycle.

        Cycles are addressed by their 1-based sequence within the batch,
        computed by the domain engine rather than read from the materialised
        `Cycle` table (ADR-0019). A sequence beyond the current cycle is
        rejected — a cycle that has not happened has nothing to summarise.
        No scores: none exist in this slice. Mentor only.
      tags: [Dashboards]
      parameters:
        - name: id
          in: path
          required: true
          description: The batch id.
          schema:
            type: string
            format: uuid
            examples:
              - 9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b
        - name: cycle
          in: query
          required: false
          description: The cycle's 1-based sequence within the batch. Defaults to the current cycle.
          schema:
            type: integer
            minimum: 1
            examples:
              - 2
      responses:
        '200':
          description: The batch's per-student figures for the requested cycle.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/BatchCycleSummary'
              examples:
                oneStudent:
                  summary: A single student, mostly compliant
                  value:
                    batchId: 9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b
                    batchName: Batch Aurora
                    cycle:
                      seq: 2
                      startDate: '2026-06-10'
                      endDate: '2026-07-09'
                      requiredDayCount: 22
                    students:
                      - student:
                          id: 3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8
                          displayName: Amaya Wickramasinghe
                          email: amaya@dev.local
                        counts:
                          requiredDays: 22
                          settledDays: 17
                          onTime: 13
                          late: 2
                          absent: 1
                          missed: 1
                          pending: 1
                          extra: 2
                          complianceRate: 0.9412
                        reviewProgress:
                          submitted: 4
                          inReview: 3
                          evaluated: 10
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '500':
          $ref: '#/components/responses/InternalServerError'
```

Then:

```bash
pnpm spec:lint && pnpm generate
```

Expected: zero errors, zero warnings; `getBatchDashboardSummary` appears in the SDK.

- [ ] **Step 3: Write the failing service test**

Append to `apps/api/test/dashboard-service.test.ts`:

```ts
describe.skipIf(!dbUrl)("createDashboardService — batchSummary", () => {
  const prisma = createPrismaClient(dbUrl!);
  const entryRepo = createEntryRepo(prisma);
  const absenceRepo = createAbsenceRepo(prisma);
  const batchRepo = createBatchRepo(prisma);
  const dayService = createDayService({ entryRepo, absenceRepo, batchRepo });
  const dashboards = createDashboardService({ batchRepo, dayService });

  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("splits one student's cycle into settled outcomes and rates them, excluding pending and future", async () => {
    const batch = await batchRepo.create({
      name: "Batch Summary", startDate: CYCLE_START, endDate: civilDate("2027-01-09"),
    });
    const s = await prisma.user.create({
      data: { externalId: "sum-1", email: "sum-1@dev.local", displayName: "Sum One", role: "STUDENT" },
    });
    await batchRepo.enrol(s.id, batch.id, CYCLE_START);

    // 2026-07-13 Mon on time · 07-14 Tue late · 07-15 Wed absent · 07-16 Thu missed.
    await entryRepo.addEntry({
      studentId: s.id, entryDate: civilDate("2026-07-13"), body: "On time.",
      submittedAt: colomboInstant(civilDate("2026-07-13"), "17:00"),
    });
    await entryRepo.addEntry({
      studentId: s.id, entryDate: civilDate("2026-07-14"), body: "Late but inside grace.",
      submittedAt: colomboInstant(civilDate("2026-07-15"), "09:40"),
    });
    await absenceRepo.create({ studentId: s.id, date: civilDate("2026-07-15"), reason: "University exam" });
    await entryRepo.addEntry({
      studentId: s.id, entryDate: SAT, body: "Weekend polish.",
      submittedAt: colomboInstant(SAT, "11:00"),
    });

    const view = await dashboards.batchSummary(batch.id, undefined, NOW);
    const row = view.students.find((r) => r.student.id === s.id)!;

    expect(view.cycle.startDate).toBe(CYCLE_START);
    expect(row.counts.onTime).toBe(1);
    expect(row.counts.late).toBe(1);
    expect(row.counts.absent).toBe(1);
    expect(row.counts.extra).toBe(1);
    // Every required day up to and including 2026-08-04 has settled by NOW
    // (2026-08-05 10:00 Colombo); later days are future and in neither side.
    expect(row.counts.settledDays).toBe(row.counts.onTime + row.counts.late + row.counts.absent + row.counts.missed);
    expect(row.counts.requiredDays).toBeGreaterThan(row.counts.settledDays);
    expect(row.counts.complianceRate).toBeCloseTo(
      (row.counts.onTime + row.counts.late + row.counts.absent) / row.counts.settledDays, 4,
    );
  });

  it("reports complianceRate null, not zero, when no day has settled", async () => {
    // A batch whose cycle has not started: every required day is future.
    const batch = await batchRepo.create({
      name: "Batch Fresh", startDate: civilDate("2026-11-10"), endDate: civilDate("2027-05-09"),
    });
    const s = await prisma.user.create({
      data: { externalId: "sum-fresh", email: "sum-fresh@dev.local", displayName: "Fresh", role: "STUDENT" },
    });
    await batchRepo.enrol(s.id, batch.id, civilDate("2026-11-10"));

    const view = await dashboards.batchSummary(batch.id, undefined, colomboInstant(civilDate("2026-11-10"), "09:00"));

    expect(view.students[0]!.counts.settledDays).toBe(0);
    expect(view.students[0]!.counts.complianceRate).toBeNull();
  });

  it("counts review progress by daily-report state", async () => {
    const batch = await batchRepo.create({
      name: "Batch Review", startDate: CYCLE_START, endDate: civilDate("2027-01-09"),
    });
    const s = await prisma.user.create({
      data: { externalId: "sum-review", email: "sum-review@dev.local", displayName: "Review", role: "STUDENT" },
    });
    await batchRepo.enrol(s.id, batch.id, CYCLE_START);
    await entryRepo.addEntry({
      studentId: s.id, entryDate: civilDate("2026-07-13"), body: "Report one.",
      submittedAt: colomboInstant(civilDate("2026-07-13"), "17:00"),
    });
    await entryRepo.addEntry({
      studentId: s.id, entryDate: civilDate("2026-07-14"), body: "Report two.",
      submittedAt: colomboInstant(civilDate("2026-07-14"), "17:00"),
    });
    const first = await entryRepo.getReport(s.id, civilDate("2026-07-13"));
    await entryRepo.transition(first!.id, "IN_REVIEW", s.id, NOW);

    const view = await dashboards.batchSummary(batch.id, undefined, NOW);
    const row = view.students.find((r) => r.student.id === s.id)!;

    expect(row.reviewProgress.inReview).toBe(1);
    expect(row.reviewProgress.submitted).toBe(1);
    expect(row.reviewProgress.evaluated).toBe(0);
  });

  it("resolves an explicit cycle sequence to that cycle's bounds", async () => {
    const batch = await batchRepo.create({
      name: "Batch Seq Pick", startDate: civilDate("2026-05-10"), endDate: civilDate("2027-01-09"),
    });
    const view = await dashboards.batchSummary(batch.id, 1, NOW);
    expect(view.cycle.seq).toBe(1);
    expect(view.cycle.startDate).toBe(civilDate("2026-05-10"));
    expect(view.cycle.endDate).toBe(civilDate("2026-06-09"));
  });

  it("rejects a cycle beyond the current one with InvalidCycleError", async () => {
    const batch = await batchRepo.create({
      name: "Batch Seq Future", startDate: civilDate("2026-05-10"), endDate: civilDate("2027-01-09"),
    });
    // The current cycle for NOW (2026-08-05) is the batch's 4th; 5 has not happened.
    await expect(dashboards.batchSummary(batch.id, 99, NOW)).rejects.toBeInstanceOf(InvalidCycleError);
  });

  it("throws BatchNotFoundError for an unknown batch id", async () => {
    await expect(dashboards.batchSummary("00000000-0000-0000-0000-000000000000", undefined, NOW))
      .rejects.toBeInstanceOf(BatchNotFoundError);
  });
});
```

Add `InvalidCycleError` to the file's import from `../src/domain/errors.js`.

- [ ] **Step 4: Run it to verify it fails**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api exec vitest run test/dashboard-service.test.ts
```

Expected: FAIL — `dashboards.batchSummary is not a function`.

- [ ] **Step 5: Implement `batchSummary`**

In `apps/api/src/services/dashboard-service.ts`, add the imports `firstEvaluatedCycleStart`, `shiftCycle` and `InvalidCycleError`, then the types:

```ts
export interface CycleCounts {
  requiredDays: number;
  settledDays: number;
  onTime: number;
  late: number;
  absent: number;
  missed: number;
  pending: number;
  extra: number;
  complianceRate: number | null;
}

export interface ReviewProgress {
  submitted: number;
  inReview: number;
  evaluated: number;
}

export interface StudentSummaryView {
  student: { id: string; displayName: string; email: string };
  counts: CycleCounts;
  reviewProgress: ReviewProgress;
}

export interface BatchSummaryView {
  batch: BatchRecord;
  cycle: CycleView;
  students: StudentSummaryView[];
}
```

Add `batchSummary(batchId: string, cycleSeq: number | undefined, now: Date): Promise<BatchSummaryView>;` to the `DashboardService` interface, and these two module-level helpers (exported, so the pure arithmetic is directly testable):

```ts
/** Four decimals — enough to distinguish 21/22 from 20/21, short enough to compare exactly in a test. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * One student's cycle, counted from their already-classified days.
 *
 * `requiredDays` is enrolment-clipped: a weekday the student was not enrolled
 * for classifies as `none` and is not their obligation (FR-27). `extra` counts
 * weekend ENTRIES, matching RosterRow.extraCountThisCycle, not weekend days.
 *
 * // ASSUMPTION: O-7 — absence counts as accounted-for. O-7 is still open on
 * whether lateness or absence carries an automatic penalty; the PRD's stated
 * assumption is that it does not, and this is the one place that shows.
 */
export function countCycle(days: DayView[]): CycleCounts {
  const counts: CycleCounts = {
    requiredDays: 0, settledDays: 0, onTime: 0, late: 0,
    absent: 0, missed: 0, pending: 0, extra: 0, complianceRate: null,
  };
  for (const day of days) {
    if (!isWeekday(day.date)) {
      counts.extra += day.entries.filter((e) => e.isExtra).length;
      continue;
    }
    if (day.status === "none") continue; // not enrolled: no obligation
    counts.requiredDays += 1;
    switch (day.status) {
      case "onTime": counts.onTime += 1; counts.settledDays += 1; break;
      case "late": counts.late += 1; counts.settledDays += 1; break;
      case "absent": counts.absent += 1; counts.settledDays += 1; break;
      case "missed": counts.missed += 1; counts.settledDays += 1; break;
      case "pending": counts.pending += 1; break;
      default: break; // future — reached by nobody yet
    }
  }
  if (counts.settledDays > 0) {
    counts.complianceRate = round4(
      (counts.onTime + counts.late + counts.absent) / counts.settledDays,
    );
  }
  return counts;
}

/** Daily reports in the window, by review state. A weekend entry creates a report too, so this is not weekday-clipped. */
export function countReviewProgress(days: DayView[]): ReviewProgress {
  const progress: ReviewProgress = { submitted: 0, inReview: 0, evaluated: 0 };
  for (const day of days) {
    if (day.reportStatus === "SUBMITTED") progress.submitted += 1;
    if (day.reportStatus === "IN_REVIEW") progress.inReview += 1;
    if (day.reportStatus === "EVALUATED") progress.evaluated += 1;
  }
  return progress;
}
```

And the method itself, inside the returned object:

```ts
    async batchSummary(batchId, cycleSeq, now) {
      const batch = await deps.batchRepo.getBatch(batchId);
      if (!batch) throw new BatchNotFoundError(batchId);

      const today = toProgrammeDate(now);
      const first = firstEvaluatedCycleStart(batch.startDate);
      // The batch's own numbering for today. Null before its first evaluated
      // cycle opens, in which case cycle 1 is the only one worth naming and
      // it is still in the future — reported, with everything future.
      const currentSeq = cycleFor(today, batch.startDate)?.index ?? null;
      const seq = cycleSeq ?? currentSeq ?? 1;
      if (!Number.isInteger(seq) || seq < 1) {
        throw new InvalidCycleError(`Cycle ${String(seq)} is not a valid 1-based cycle sequence.`);
      }
      if (currentSeq !== null && seq > currentSeq) {
        throw new InvalidCycleError(
          `Cycle ${String(seq)} has not started — this batch is on cycle ${String(currentSeq)}.`,
        );
      }
      if (currentSeq === null && seq > 1) {
        throw new InvalidCycleError(`Cycle ${String(seq)} has not started — this batch has no evaluated cycle yet.`);
      }

      const bounds = cycleContaining(shiftCycle(first, seq - 1));
      const enrolments = await deps.batchRepo.enrolmentsInRange(batchId, bounds.start, bounds.end);
      const studentIds = [...new Set(enrolments.map((e) => e.studentId))];
      const byStudent = await deps.dayService.listDaysForStudents(
        studentIds, bounds.start, bounds.end, now,
      );

      // enrolmentsInRange is ordered by displayName, so first-seen order is
      // already the response order; the Map dedupes a student holding two
      // intervals in this cycle (a transfer into and out of the same batch).
      const seen = new Map<string, RosterEnrolment>();
      for (const e of enrolments) if (!seen.has(e.studentId)) seen.set(e.studentId, e);

      return {
        batch,
        cycle: { ...cycleView(bounds, batch), seq },
        students: [...seen.values()].map((e) => {
          const days = byStudent.get(e.studentId) ?? [];
          return {
            student: { id: e.studentId, displayName: e.displayName, email: e.email },
            counts: countCycle(days),
            reviewProgress: countReviewProgress(days),
          };
        }),
      };
    },
```

`cycleView(bounds, batch)` recomputes `seq` from the bounds, which agrees with the requested `seq` by construction; the spread makes the requested value authoritative and keeps the two from drifting if `firstEvaluatedCycleStart` ever changes shape.

- [ ] **Step 6: Run the service test**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api exec vitest run test/dashboard-service.test.ts
```

Expected: PASS — every test in the file, the pre-existing ones included. (Do not treat a specific count here as authoritative: earlier tasks' fix waves add tests to this same file, so the total drifts.)

- [ ] **Step 7: Add the route, its query schema and its tests**

In `apps/api/src/routes/schemas.ts`:

```ts
export const CYCLE_QUERY = {
  type: "object",
  additionalProperties: false,
  // The wire (coercing) ajv instance turns the querystring's "2" into a
  // number here — see validation.ts, and the note in CLAUDE.md about why a
  // coercing compiler exists for querystrings at all.
  properties: { cycle: { type: "integer", minimum: 1 } },
} as const;
```

In `apps/api/src/routes/dashboards.ts`, add the mappers and the route:

```ts
function toApiCycleCounts(c: CycleCounts): components["schemas"]["CycleCounts"] {
  return {
    requiredDays: c.requiredDays, settledDays: c.settledDays, onTime: c.onTime,
    late: c.late, absent: c.absent, missed: c.missed, pending: c.pending,
    extra: c.extra, complianceRate: c.complianceRate,
  };
}

  app.get<{ Params: { id: string }; Querystring: { cycle?: number } }>(
    "/api/v1/batches/:id/dashboard/summary",
    { schema: { params: UUID_PARAM, querystring: CYCLE_QUERY }, preHandler: [app.authenticate] },
    async (req): Promise<components["schemas"]["BatchCycleSummary"]> => {
      requireAdmin(req);
      const view = await opts.dashboardService.batchSummary(req.params.id, req.query.cycle, new Date());
      return {
        batchId: view.batch.id,
        batchName: view.batch.name,
        cycle: toApiCycle(view.cycle),
        students: view.students.map((s) => ({
          student: s.student,
          counts: toApiCycleCounts(s.counts),
          reviewProgress: { ...s.reviewProgress },
        })),
      };
    },
  );
```

Add `batchSummary: unused,` to `unusedDashboardService()`.

Append to `apps/api/test/dashboards-endpoint.test.ts`, inside the same `describe`:

```ts
  it("rejects a student token on the summary endpoint with 403 admin-only", async () => {
    await student("dash-sum-student");
    const b = await batch("Batch Sum 403");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/batches/${b.id}/dashboard/summary`,
      headers: bearer(await signToken({ oid: "dash-sum-student" })),
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects cycle=0 with 400 validation-failed — the schema's minimum, before the service is reached", async () => {
    await mentor("dash-sum-mentor-0");
    const b = await batch("Batch Sum Zero");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/batches/${b.id}/dashboard/summary?cycle=0`,
      headers: bearer(await signToken({ oid: "dash-sum-mentor-0" })),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ProblemLike>().type).toBe("https://irp.bistec.example/problems/validation-failed");
  });

  it("rejects a future cycle with 400 invalid-cycle", async () => {
    await mentor("dash-sum-mentor-future");
    const b = await batch("Batch Sum Future");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/batches/${b.id}/dashboard/summary?cycle=99`,
      headers: bearer(await signToken({ oid: "dash-sum-mentor-future" })),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ProblemLike>().type).toBe("https://irp.bistec.example/problems/invalid-cycle");
  });

  it("coerces the cycle querystring to an integer and returns that cycle", async () => {
    await mentor("dash-sum-mentor-ok");
    const b = await batch("Batch Sum OK");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/batches/${b.id}/dashboard/summary?cycle=1`,
      headers: bearer(await signToken({ oid: "dash-sum-mentor-ok" })),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ cycle: { seq: number } }>().cycle.seq).toBe(1);
  });
```

- [ ] **Step 8: Run everything and commit**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' pnpm --filter @irp/api test
pnpm spec:lint && pnpm typecheck && pnpm lint
git add spec/openapi.yaml apps/api
git commit -m "feat(api): per-student cycle summary endpoint for the Cycles view"
```

Expected: all green.

---

## Task 4: `GET /me/dashboard` — FR-29 and FR-30

The student's own month, and the one endpoint where FR-30 has teeth: it reads `req.user!.id` and accepts no student identifier at all, so there is no student-reachable path to another student's data even by guessing a uuid.

**Files:**
- Modify: `packages/core/src/cycle.ts`, `packages/core/src/index.ts`
- Modify: `spec/openapi.yaml`, `apps/api/src/services/dashboard-service.ts`, `apps/api/src/routes/dashboards.ts`, `apps/api/src/server.ts`, `apps/api/src/index.ts`, `apps/api/test/helpers/build-test-server.ts`, `apps/api/test/helpers/fake-dashboard-service.ts`
- Test: `packages/core/src/cycle.test.ts`, `apps/api/test/dashboard-service.test.ts`, `apps/api/test/dashboards-endpoint.test.ts`

**Interfaces:**
- Consumes: `BatchRepo.firstEnrolmentStart` (already exists); `PROGRAMME_MONTHS`, `firstEvaluatedCycleStart`, `cycleFor` from `@irp/core`.
- Produces:
  - `PROGRAMME_MONTHS = 6` exported from `@irp/core`
  - `StudentDay = { date: CivilDate; status: DayStatus }`
  - `StudentDashboardView = { programmeMonths: number; firstEvaluatedCycleStart: CivilDate | null; cycle: CycleView; days: StudentDay[]; extraAfter: CivilDate[]; summary: CycleCounts; strengthsAndWeaknesses: null }`
  - `DashboardService.studentDashboard(studentId: string, now: Date): Promise<StudentDashboardView>`
  - SDK: `getMyDashboard({ client })`

- [ ] **Step 1: Add `PROGRAMME_MONTHS` to the engine**

In `packages/core/src/cycle.ts`, below the two existing day constants:

```ts
/**
 * The programme's length in evaluation cycles — the "of 6" in FR-29's
 * "Month N of 6". Lives with the cycle arithmetic because it is the same
 * domain fact, and both the API payload and any future evaluation code need
 * one source for it.
 */
export const PROGRAMME_MONTHS = 6;
```

Export it from `packages/core/src/index.ts` by adding `PROGRAMME_MONTHS,` to the existing `./cycle.js` export block.

Append to `packages/core/src/cycle.test.ts`:

```ts
describe("PROGRAMME_MONTHS", () => {
  it("is the six-cycle programme length FR-29 reports against", () => {
    expect(PROGRAMME_MONTHS).toBe(6);
  });
});
```

Import it in that test file, then:

```bash
pnpm --filter @irp/core test && pnpm --filter @irp/core build
```

Expected: PASS (113 tests), and `dist/` rebuilt so `apps/api` resolves the new export.

- [ ] **Step 2: Add the spec schemas and operation**

Add to `components.schemas`:

```yaml
    StudentDay:
      type: object
      title: StudentDay
      description: One required day in the student's own month view. Weekends never appear — worked weekends are reported through `extraAfter` instead (FR-33).
      required: [date, status]
      additionalProperties: false
      properties:
        date:
          type: string
          format: date
          description: The required day (Asia/Colombo).
          examples:
            - '2026-08-03'
        status:
          $ref: '#/components/schemas/DayStatus'

    StudentDashboard:
      type: object
      title: StudentDashboard
      description: |
        The caller's own month (FR-29). Carries no score, no rank, and no other
        student's data anywhere (FR-30) — and takes no student identifier, so
        there is no parameter to tamper with.

        `strengthsAndWeaknesses` is null until an evaluation exists for the
        student. None do in this release: O-5 blocks the AI provider decision,
        so the interface renders a designed empty state rather than an
        apologetic blank.
      required: [today, programmeMonths, firstEvaluatedCycleStart, cycle, days, extraAfter, summary, strengthsAndWeaknesses]
      additionalProperties: false
      properties:
        today:
          type: string
          format: date
          description: The server's current civil date in Asia/Colombo. Supplied so the interface can ring today on the ribbon without deriving a timezone-sensitive date in the browser — a browser in another zone would ring the wrong bar.
          examples:
            - '2026-08-03'
        programmeMonths:
          type: integer
          minimum: 1
          description: Programme length in evaluation cycles — the "of 6" in "Month N of 6".
          examples:
            - 6
        firstEvaluatedCycleStart:
          oneOf:
            - type: string
              format: date
            - type: 'null'
          description: The first cycle the student is evaluated for, from their earliest enrolment (FR-27). Null when the caller has never been enrolled.
          examples:
            - '2026-06-10'
        cycle:
          $ref: '#/components/schemas/CycleView'
        days:
          type: array
          description: Every required day in the current cycle, earliest first, with the student's own classification.
          items:
            $ref: '#/components/schemas/StudentDay'
        extraAfter:
          type: array
          description: Required days immediately preceding a weekend this student worked (FR-33).
          items:
            type: string
            format: date
          examples:
            - ['2026-07-31']
        summary:
          $ref: '#/components/schemas/CycleCounts'
        strengthsAndWeaknesses:
          oneOf:
            - type: string
            - type: 'null'
          description: The latest evaluation's prose summary. Null until the student's first cycle has been evaluated.
          examples:
            - null
```

Add the operation after `/api/v1/me/days`:

```yaml
  /api/v1/me/dashboard:
    get:
      operationId: getMyDashboard
      summary: The caller's own month
      description: |
        FR-29: the signed-in student's programme position ("Month N of 6"),
        their current cycle's day-by-day classification, and that cycle's
        compliance figures.

        FR-30 by construction: the endpoint takes no student identifier and
        reads only the caller's own id from the validated token, so no
        parameter exists that could name another student. It returns no score
        and no rank. A mentor calling it sees a cycle with no required days
        of their own — mentors hold no enrolment.
      tags: [Dashboards]
      responses:
        '200':
          description: The caller's current-cycle dashboard.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StudentDashboard'
              examples:
                monthThree:
                  summary: Month 3 of 6, one worked weekend, no evaluation yet
                  value:
                    today: '2026-08-11'
                    programmeMonths: 6
                    firstEvaluatedCycleStart: '2026-06-10'
                    cycle:
                      seq: 3
                      startDate: '2026-08-10'
                      endDate: '2026-09-09'
                      requiredDayCount: 22
                    days:
                      - date: '2026-08-10'
                        status: onTime
                      - date: '2026-08-11'
                        status: late
                    extraAfter:
                      - '2026-07-31'
                    summary:
                      requiredDays: 22
                      settledDays: 17
                      onTime: 13
                      late: 2
                      absent: 1
                      missed: 1
                      pending: 1
                      extra: 2
                      complianceRate: 0.9412
                    strengthsAndWeaknesses: null
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '500':
          $ref: '#/components/responses/InternalServerError'
```

Then `pnpm spec:lint && pnpm generate`. Expected: zero errors, zero warnings; `getMyDashboard` in the SDK.

- [ ] **Step 3: Write the failing service test**

Append to `apps/api/test/dashboard-service.test.ts`:

```ts
describe.skipIf(!dbUrl)("createDashboardService — studentDashboard", () => {
  const prisma = createPrismaClient(dbUrl!);
  const entryRepo = createEntryRepo(prisma);
  const absenceRepo = createAbsenceRepo(prisma);
  const batchRepo = createBatchRepo(prisma);
  const dayService = createDayService({ entryRepo, absenceRepo, batchRepo });
  const dashboards = createDashboardService({ batchRepo, dayService });

  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reports Month N of 6 from the student's FIRST enrolment, surviving a transfer", async () => {
    const a = await batchRepo.create({
      name: "Batch Own A", startDate: civilDate("2026-06-10"), endDate: civilDate("2026-12-09"),
    });
    const b = await batchRepo.create({
      name: "Batch Own B", startDate: civilDate("2026-07-10"), endDate: civilDate("2027-01-09"),
    });
    const s = await prisma.user.create({
      data: { externalId: "own-mover", email: "own-mover@dev.local", displayName: "Mover", role: "STUDENT" },
    });
    await batchRepo.enrol(s.id, a.id, civilDate("2026-06-10"));
    await batchRepo.transfer(s.id, b.id, civilDate("2026-07-10"));

    const view = await dashboards.studentDashboard(s.id, NOW);

    expect(view.programmeMonths).toBe(6);
    expect(view.firstEvaluatedCycleStart).toBe(civilDate("2026-06-10"));
    // NOW is 2026-08-05, in the 2026-07-10..2026-08-09 cycle — the 2nd since
    // the FIRST enrolment, not the 1st in the batch they moved to.
    expect(view.cycle.seq).toBe(2);
    expect(view.cycle.startDate).toBe(CYCLE_START);
  });

  it("nulls seq for a joiner whose first evaluated cycle has not opened", async () => {
    const batch = await batchRepo.create({
      name: "Batch Own Joiner", startDate: CYCLE_START, endDate: civilDate("2027-01-09"),
    });
    const s = await prisma.user.create({
      data: { externalId: "own-joiner", email: "own-joiner@dev.local", displayName: "Joiner", role: "STUDENT" },
    });
    // Joined mid-cycle: FR-27 says this cycle is not evaluated, so the first
    // evaluated cycle is the NEXT one and today has no sequence.
    await batchRepo.enrol(s.id, batch.id, civilDate("2026-07-15"));

    const view = await dashboards.studentDashboard(s.id, NOW);

    expect(view.cycle.seq).toBeNull();
    expect(view.firstEvaluatedCycleStart).toBe(civilDate("2026-08-10"));
  });

  it("returns required days only, with worked weekends surfaced through extraAfter", async () => {
    const batch = await batchRepo.create({
      name: "Batch Own Extra", startDate: CYCLE_START, endDate: civilDate("2027-01-09"),
    });
    const s = await prisma.user.create({
      data: { externalId: "own-extra", email: "own-extra@dev.local", displayName: "Extra", role: "STUDENT" },
    });
    await batchRepo.enrol(s.id, batch.id, CYCLE_START);
    await entryRepo.addEntry({
      studentId: s.id, entryDate: SAT, body: "Weekend polish.",
      submittedAt: colomboInstant(SAT, "11:00"),
    });

    const view = await dashboards.studentDashboard(s.id, NOW);

    expect(view.days).toHaveLength(view.cycle.requiredDayCount);
    expect(view.days.some((d) => d.date === SAT)).toBe(false);
    expect(view.extraAfter).toEqual([civilDate("2026-07-31")]);
    expect(view.summary.extra).toBe(1);
    expect(view.strengthsAndWeaknesses).toBeNull();
  });

  it("gives a caller with no enrolment a null first cycle and an empty obligation, not an error", async () => {
    const m = await prisma.user.create({
      data: { externalId: "own-mentor", email: "own-mentor@dev.local", displayName: "Mentor", role: "ADMIN" },
    });

    const view = await dashboards.studentDashboard(m.id, NOW);

    expect(view.firstEvaluatedCycleStart).toBeNull();
    expect(view.cycle.seq).toBeNull();
    expect(view.summary.requiredDays).toBe(0);
    expect(view.summary.complianceRate).toBeNull();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api exec vitest run test/dashboard-service.test.ts
```

Expected: FAIL — `dashboards.studentDashboard is not a function`.

- [ ] **Step 5: Implement `studentDashboard`**

The extra-slot derivation is now needed by two methods, so lift it out of `batchToday` into a shared module-level helper first:

```ts
/**
 * Weekend Extra (FR-33), attributed to the required day it follows so the
 * ribbon can draw a half-width slot there. A weekend at the very start of a
 * cycle anchors back into the previous one and is dropped rather than
 * mis-attributed. Counts ENTRIES, not days — a Saturday worked twice is two.
 */
export function extraSlots(
  dayLists: Iterable<DayView[]>,
  cycleStart: CivilDate,
): { extraCount: number; extraAfter: CivilDate[] } {
  let extraCount = 0;
  const anchors = new Set<CivilDate>();
  for (const days of dayLists) {
    for (const day of days) {
      if (isWeekday(day.date)) continue;
      const extras = day.entries.filter((e) => e.isExtra).length;
      if (extras === 0) continue;
      extraCount += extras;
      const anchor = previousWeekday(day.date);
      if (compareDates(anchor, cycleStart) >= 0) anchors.add(anchor);
    }
  }
  return { extraCount, extraAfter: [...anchors].sort() };
}
```

Replace `batchToday`'s inline loop with `const { extraCount, extraAfter } = extraSlots(byStudent.values(), bounds.start);`.

Then add the types and the method:

```ts
export interface StudentDay {
  date: CivilDate;
  status: DayStatus;
}

export interface StudentDashboardView {
  /** The server's civil date in Asia/Colombo — the ribbon's ring must not be derived from the browser's clock. */
  today: CivilDate;
  programmeMonths: number;
  firstEvaluatedCycleStart: CivilDate | null;
  cycle: CycleView;
  days: StudentDay[];
  extraAfter: CivilDate[];
  summary: CycleCounts;
  /** Always null in this release — O-5 blocks the AI provider, so no Evaluation row exists (spec D2/D6). */
  strengthsAndWeaknesses: null;
}
```

`DashboardService` gains `studentDashboard(studentId: string, now: Date): Promise<StudentDashboardView>;`, and the factory's deps widen to `batchRepo: Pick<BatchRepo, "getBatch" | "enrolmentsInRange" | "firstEnrolmentStart" | "listEnrolments">`. The method:

```ts
    async studentDashboard(studentId, now) {
      const today = toProgrammeDate(now);
      const bounds = cycleContaining(today);
      const admission = await deps.batchRepo.firstEnrolmentStart(studentId);
      const byStudent = await deps.dayService.listDaysForStudents(
        [studentId], bounds.start, bounds.end, now,
      );
      const days = byStudent.get(studentId) ?? [];
      const { extraAfter } = extraSlots([days], bounds.start);

      return {
        today,
        programmeMonths: PROGRAMME_MONTHS,
        firstEvaluatedCycleStart: admission === null ? null : firstEvaluatedCycleStart(admission),
        cycle: {
          // The programme clock runs from the student's FIRST enrolment, so a
          // transfer never resets "Month N of 6" (spec §3, Enrolment).
          seq: admission === null ? null : (cycleFor(today, admission)?.index ?? null),
          startDate: bounds.start,
          endDate: bounds.end,
          requiredDayCount: cycleWorkingDays(bounds).length,
        },
        days: days
          .filter((d) => isWeekday(d.date))
          .map((d) => ({ date: d.date, status: d.status })),
        extraAfter,
        // Corrected 2026-08-03: countCycle's signature changed in Task 3's fix
        // wave to `countCycle(days, enrolments)`, because a batch summary must
        // clip each student's obligation to THAT batch's intervals. A
        // student's own month is the opposite case — the obligation follows
        // the student, not a batch — so pass their full enrolment list. Widen
        // `countCycle`/`covers` to accept a structural
        // `{ startDate: CivilDate; endDate: CivilDate | null }` so both
        // `RosterEnrolment` and `EnrolmentRecord` satisfy it; do not duplicate
        // the counter.
        summary: countCycle(days, await deps.batchRepo.listEnrolments(studentId)),
        strengthsAndWeaknesses: null,
      };
    },
```

Note `cycleView` is not reused here: a student's `seq` is anchored on their own first enrolment, not on a batch's start date, and passing a batch through would be the wrong number for a transferred student.

- [ ] **Step 6: Run the service test**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' \
  pnpm --filter @irp/api exec vitest run test/dashboard-service.test.ts
```

Expected: PASS — every test in the file, the pre-existing ones included; the exact total drifts as earlier fix waves add to it.

- [ ] **Step 7: Add the route and its tests**

In `apps/api/src/routes/dashboards.ts`:

```ts
  app.get(
    "/api/v1/me/dashboard",
    { preHandler: [app.authenticate] },
    async (req): Promise<components["schemas"]["StudentDashboard"]> => {
      // No role gate and no id parameter: the caller's own id is the only
      // input, so FR-30 holds by construction rather than by a check.
      const view = await opts.dashboardService.studentDashboard(req.user!.id, new Date());
      return {
        today: view.today,
        programmeMonths: view.programmeMonths,
        firstEvaluatedCycleStart: view.firstEvaluatedCycleStart,
        cycle: toApiCycle(view.cycle),
        days: view.days.map((d) => ({ date: d.date, status: d.status })),
        extraAfter: [...view.extraAfter],
        summary: toApiCycleCounts(view.summary),
        strengthsAndWeaknesses: view.strengthsAndWeaknesses,
      };
    },
  );
```

Add `studentDashboard: unused,` to `unusedDashboardService()`, and widen `createDashboardService`'s call in both `apps/api/src/index.ts` and `apps/api/test/helpers/build-test-server.ts` if the dependency object changed shape (it does not — `batchRepo` is passed whole).

Append to `apps/api/test/dashboards-endpoint.test.ts`:

```ts
  it("returns the caller's own dashboard for a student token", async () => {
    const s = await student("dash-me-student");
    const b = await batch("Batch Me");
    await createBatchRepo(prisma).enrol(s.id, b.id, civilDate("2026-05-10"));

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/dashboard",
      headers: bearer(await signToken({ oid: "dash-me-student" })),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      programmeMonths: number;
      days: { date: string; status: string }[];
      summary: { requiredDays: number };
      strengthsAndWeaknesses: string | null;
    }>();
    expect(body.programmeMonths).toBe(6);
    expect(body.strengthsAndWeaknesses).toBeNull();
    expect(body.summary.requiredDays).toBeGreaterThan(0);
    // FR-30: the payload names no other student and carries no score.
    expect(JSON.stringify(body)).not.toContain("performanceIndex");
  });

  it("accepts a mentor token too, reporting no obligation of their own", async () => {
    await mentor("dash-me-mentor");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/dashboard",
      headers: bearer(await signToken({ oid: "dash-me-mentor" })),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ summary: { requiredDays: number } }>().summary.requiredDays).toBe(0);
  });

  it("rejects an unauthenticated request to the student dashboard with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me/dashboard" });
    expect(res.statusCode).toBe(401);
  });
```

- [ ] **Step 8: Run everything and commit**

```bash
DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public' pnpm --filter @irp/api test
pnpm --filter @irp/core test
pnpm spec:lint && pnpm typecheck && pnpm lint
git add spec/openapi.yaml packages/core apps/api
git commit -m "feat(api): student's own month dashboard — FR-29, FR-30 by construction"
```

Expected: all green. The API surface is now complete; every remaining task is web, tests or docs.

---

## Task 5: Ribbon mappers

`CycleRibbon` takes `DayMark`, a presentation vocabulary its own doc comment says is "deliberately distinct" from the domain `DayStatus` — and leaves the relation for Plan 7 to decide. This task decides it, in one pure module with no React and no I/O, so the rule is testable in isolation rather than buried in a page.

**Files:**
- Create: `apps/web/lib/ribbon.ts`
- Test: `apps/web/test/ribbon.test.ts`
- Modify: `docs/design-system.md` §7 (record the precedence)

**Interfaces:**
- Consumes: `DayMark`, `RibbonDay` from `@/components/cycle-ribbon/cycle-ribbon`; `DayStatus`, `DayCompliance` from `@irp/client`'s generated types.
- Produces:
  - `studentDayMark(status: DayStatus): DayMark`
  - `batchDayMark(day: { enrolled: number; submitted: number; late: number; absent: number; missed: number; pending: number }): { mark: DayMark; fill?: number }`
  - `toStudentRibbonDays(days: { date: string; status: DayStatus }[], today: string): RibbonDay[]`
  - `toBatchRibbonDays(days: DayComplianceLike[], today: string): RibbonDay[]`

**The precedence rule, decided here.** A batch day holds a mix of outcomes and the ribbon draws one mark. Worst-unresolved-first: **missed → late → absent → partial → ok**, with `future` for a day nobody has reached. A mentor scanning the strip should see the failure before the warning and the warning before the excused absence; `partial` (some still pending, nothing wrong yet) sits below all three because it is not yet a problem. `fill` is `submitted / enrolled` and is set on `partial` only — the one mark the ribbon renders proportionally.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/ribbon.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { batchDayMark, studentDayMark, toBatchRibbonDays, toStudentRibbonDays } from "@/lib/ribbon";

const day = (over: Partial<Parameters<typeof batchDayMark>[0]> = {}) => ({
  enrolled: 10, submitted: 10, late: 0, absent: 0, missed: 0, pending: 0, ...over,
});

describe("studentDayMark", () => {
  it("maps each settled status onto its own mark", () => {
    expect(studentDayMark("onTime")).toBe("ok");
    expect(studentDayMark("late")).toBe("late");
    expect(studentDayMark("absent")).toBe("absent");
    expect(studentDayMark("missed")).toBe("missed");
  });

  it("draws pending as an outline, not a failure — the grace window is still open", () => {
    expect(studentDayMark("pending")).toBe("future");
  });

  it("draws future and none as outlines", () => {
    expect(studentDayMark("future")).toBe("future");
    expect(studentDayMark("none")).toBe("future");
  });

  it("never returns a mark for extra — weekend work is a slot, not a day bar (FR-33)", () => {
    // `extra` can only reach here through a caller that failed to filter
    // weekends out. An outline is the safe rendering: it claims nothing.
    expect(studentDayMark("extra")).toBe("future");
  });
});

describe("batchDayMark", () => {
  it("is ok only when everyone submitted and nobody was late", () => {
    expect(batchDayMark(day())).toEqual({ mark: "ok" });
  });

  it("ranks missed above late, late above absent, and absent above partial", () => {
    expect(batchDayMark(day({ submitted: 8, late: 1, absent: 1, missed: 1 })).mark).toBe("missed");
    expect(batchDayMark(day({ submitted: 9, late: 1, absent: 1 })).mark).toBe("late");
    expect(batchDayMark(day({ submitted: 9, absent: 1 })).mark).toBe("absent");
    expect(batchDayMark(day({ submitted: 6, pending: 4 })).mark).toBe("partial");
  });

  it("fills partial proportionally, and only partial", () => {
    expect(batchDayMark(day({ submitted: 6, pending: 4 }))).toEqual({ mark: "partial", fill: 0.6 });
    expect(batchDayMark(day({ submitted: 9, absent: 1 })).fill).toBeUndefined();
  });

  it("draws a day nobody has reached, and a day with nobody enrolled, as an outline", () => {
    expect(batchDayMark(day({ submitted: 0, pending: 0 }))).toEqual({ mark: "future" });
    expect(batchDayMark(day({ enrolled: 0, submitted: 0 }))).toEqual({ mark: "future" });
  });
});

describe("toStudentRibbonDays / toBatchRibbonDays", () => {
  it("rings today without replacing its real mark", () => {
    const days = toStudentRibbonDays(
      [{ date: "2026-08-03", status: "missed" }, { date: "2026-08-04", status: "onTime" }],
      "2026-08-03",
    );
    expect(days[0]).toEqual({ date: "2026-08-03", mark: "missed", isToday: true });
    expect(days[1]!.isToday).toBeUndefined();
  });

  it("carries fill through for a partial batch day and rings today there too", () => {
    const days = toBatchRibbonDays(
      [{ date: "2026-08-03", enrolled: 10, submitted: 5, late: 0, absent: 0, missed: 0, pending: 5 }],
      "2026-08-03",
    );
    expect(days[0]).toEqual({ date: "2026-08-03", mark: "partial", fill: 0.5, isToday: true });
  });

  it("leaves isToday off entirely when today falls outside the series — a weekend", () => {
    const days = toBatchRibbonDays(
      [{ date: "2026-07-31", enrolled: 1, submitted: 1, late: 0, absent: 0, missed: 0, pending: 0 }],
      "2026-08-01",
    );
    expect(days.every((d) => d.isToday === undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @irp/web exec vitest run test/ribbon.test.ts
```

Expected: FAIL — cannot resolve `@/lib/ribbon`.

- [ ] **Step 3: Write the module**

Create `apps/web/lib/ribbon.ts`:

```ts
import type { DayMark, RibbonDay } from "@/components/cycle-ribbon/cycle-ribbon";
import type { DayStatus } from "@irp/client";

/** The subset of DayCompliance the mark rule reads. Structural, so either the SDK type or a literal satisfies it. */
export interface DayComplianceLike {
  date: string;
  enrolled: number;
  submitted: number;
  late: number;
  absent: number;
  missed: number;
  pending: number;
}

/**
 * Domain status to visual mark, for ONE student's day.
 *
 * `pending` becomes an outline rather than a mark of its own: the grace window
 * is still open, so nothing has gone wrong and drawing a filled bar would
 * claim work that has not been recorded. The design system has no pending
 * mark (§7 lists six), and inventing a seventh colour was rejected there for
 * the same reason it was rejected for Extra.
 *
 * `extra` and `none` also fall through to the outline. Neither should reach
 * here — callers pass required days only — but a total function that claims
 * nothing is a better failure than a crash on a screen a mentor is reading.
 */
export function studentDayMark(status: DayStatus): DayMark {
  switch (status) {
    case "onTime": return "ok";
    case "late": return "late";
    case "absent": return "absent";
    case "missed": return "missed";
    default: return "future";
  }
}

/**
 * Batch compliance for one day to a single mark, worst unresolved outcome
 * first: missed, then late, then absent, then partial, then ok.
 *
 * A mentor scanning the strip needs the failure before the warning and the
 * warning before the excused absence. `partial` ranks below all three because
 * pending work is not yet a problem — it is simply an afternoon that has not
 * finished. `fill` is set on `partial` alone; it is the only mark CycleRibbon
 * renders proportionally (see its MARK_COLOR comment).
 */
export function batchDayMark(day: Omit<DayComplianceLike, "date">): { mark: DayMark; fill?: number } {
  const reached = day.submitted + day.absent + day.missed + day.pending;
  if (day.enrolled === 0 || reached === 0) return { mark: "future" };
  if (day.missed > 0) return { mark: "missed" };
  if (day.late > 0) return { mark: "late" };
  if (day.absent > 0) return { mark: "absent" };
  if (day.submitted >= day.enrolled) return { mark: "ok" };
  return { mark: "partial", fill: day.submitted / day.enrolled };
}

/**
 * `isToday` is set only when today is actually in the series — a weekend, or
 * a date outside the cycle, leaves every bar unringed. The ring is a
 * decoration drawn OVER the real mark, never a substitute for it.
 */
export function toStudentRibbonDays(
  days: { date: string; status: DayStatus }[],
  today: string,
): RibbonDay[] {
  return days.map((d) => ({
    date: d.date,
    mark: studentDayMark(d.status),
    ...(d.date === today && { isToday: true }),
  }));
}

export function toBatchRibbonDays(days: DayComplianceLike[], today: string): RibbonDay[] {
  return days.map((d) => ({
    date: d.date,
    ...batchDayMark(d),
    ...(d.date === today && { isToday: true }),
  }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @irp/web exec vitest run test/ribbon.test.ts
```

Expected: PASS — all eleven tests.

- [ ] **Step 5: Record the precedence in the design system**

In `docs/design-system.md` §7, after the "**Day mark states:**" line, add:

```markdown
**Batch aggregation (Plan 7).** A batch day holds a mix of outcomes and the ribbon draws one
mark, so precedence is fixed: **missed → late → absent → partial → ok**, with an outline for a
day nobody has reached. The failure outranks the warning, the warning outranks the excused
absence, and `partial` sits below all three because pending work is an unfinished afternoon,
not a problem. Only `partial` is filled proportionally (`submitted / enrolled`). Implemented
once, in `apps/web/lib/ribbon.ts`; a page that re-derives a mark is a bug.
```

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @irp/web test && pnpm typecheck && pnpm lint
git add apps/web/lib/ribbon.ts apps/web/test/ribbon.test.ts docs/design-system.md
git commit -m "feat(web): domain status to ribbon mark mappers, with the batch precedence rule"
```

---

## Task 6: Mentor Today — FR-28, must-ship

The stakeholder's must-have (SC-4). `(app)/page.tsx`'s mentor branch currently says "The batch dashboard arrives with Plan 7"; this replaces it with the warm zone — one ribbon per batch, FR-28's figures above the fold at 1280×800.

**Files:**
- Create: `apps/web/app/(app)/mentor-today.tsx`
- Modify: `apps/web/app/(app)/page.tsx`
- Test: `apps/web/test/mentor-today.test.tsx`, `apps/web/test/today-page.test.tsx` (the mentor branch's existing assertions)

**Interfaces:**
- Consumes: `listBatches`, `getBatchDashboardToday` from `@irp/client`; `apiClient` from `@/lib/api-client`; `toBatchRibbonDays` from `@/lib/ribbon`; `CycleRibbon`; `PageTitle`, `Panel`, `SectionLabel`, `EmptyState` from `@/components/ui/*`; `formatCivilDateLabel` from `./format-civil-date`.
- Produces: `MentorToday({ displayName, role }: { displayName: string; role: Role })` — an async server component.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/mentor-today.test.tsx`, following `roster-page.test.tsx`'s hoisted-mock idiom exactly:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MentorToday } from "@/app/(app)/mentor-today";

const { apiClient } = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiClient }));

const { listBatches, getBatchDashboardToday } = vi.hoisted(() => ({
  listBatches: vi.fn(),
  getBatchDashboardToday: vi.fn(),
}));
vi.mock("@irp/client", () => ({ listBatches, getBatchDashboardToday }));

const BATCH = { id: "b1", name: "Batch Aurora", startDate: "2026-05-10", endDate: "2026-11-09" };

const dashboard = (over: Record<string, unknown> = {}) => ({
  batchId: "b1",
  batchName: "Batch Aurora",
  date: "2026-08-03",
  isFallbackDay: false,
  dayNumber: 17,
  cycle: { seq: 3, startDate: "2026-07-10", endDate: "2026-08-09", requiredDayCount: 22 },
  counts: { date: "2026-08-03", enrolled: 10, submitted: 8, late: 2, absent: 1, missed: 0, pending: 1 },
  extraCount: 3,
  days: [
    { date: "2026-07-31", enrolled: 10, submitted: 10, late: 0, absent: 0, missed: 0, pending: 0 },
    { date: "2026-08-03", enrolled: 10, submitted: 8, late: 2, absent: 1, missed: 0, pending: 1 },
  ],
  extraAfter: ["2026-07-31"],
  ...over,
});

describe("MentorToday", () => {
  it("renders FR-28's figures — N of M, late, absent — for each batch", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardToday.mockResolvedValue({ data: dashboard(), error: undefined });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByText("Batch Aurora")).toBeInTheDocument();
    expect(screen.getByTestId("submitted-count-b1")).toHaveTextContent("8 of 10 submitted");
    expect(screen.getByTestId("late-count-b1")).toHaveTextContent("2 late");
    expect(screen.getByTestId("absent-count-b1")).toHaveTextContent("1 absent");
    expect(screen.getByTestId("missed-count-b1")).toHaveTextContent("0 missed");
  });

  it("labels the day as an earlier one when isFallbackDay is set — a weekend must not read as today", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardToday.mockResolvedValue({
      data: dashboard({ isFallbackDay: true, date: "2026-07-31" }),
      error: undefined,
    });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByTestId("day-label-b1")).toHaveTextContent(/Friday, 31 July/);
    expect(screen.getByTestId("day-label-b1")).toHaveTextContent(/last required day/i);
  });

  it("renders one ribbon per batch, with the cycle label and the required-day count", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH, { ...BATCH, id: "b2", name: "Batch Basalt" }] });
    getBatchDashboardToday.mockResolvedValue({ data: dashboard(), error: undefined });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getAllByRole("figure")).toHaveLength(2);
    expect(screen.getAllByText(/Cycle 3 · Day 17 of 22/).length).toBeGreaterThan(0);
  });

  it("says the cycle has not opened when seq is null, rather than printing Cycle null", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardToday.mockResolvedValue({
      data: dashboard({ cycle: { seq: null, startDate: "2026-11-10", endDate: "2026-12-09", requiredDayCount: 22 } }),
      error: undefined,
    });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByText(/first evaluated cycle/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cycle null/)).not.toBeInTheDocument();
  });

  it("shows an empty state pointing at Students when there are no batches", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [] });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByText("No batches yet.")).toBeInTheDocument();
    expect(getBatchDashboardToday).not.toHaveBeenCalled();
  });

  it("renders a problem detail per failing batch, without losing the batches that loaded", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH, { ...BATCH, id: "b2", name: "Batch Basalt" }] });
    getBatchDashboardToday
      .mockResolvedValueOnce({ data: dashboard(), error: undefined })
      .mockResolvedValueOnce({
        data: undefined,
        error: { type: "about:blank", title: "Internal Server Error", status: 500, detail: "Aggregation failed." },
      });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByTestId("submitted-count-b1")).toHaveTextContent("8 of 10 submitted");
    expect(screen.getByRole("alert")).toHaveTextContent("Aggregation failed.");
  });

  it("keeps the sign-in chain's identity testids on the mentor branch", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [] });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByTestId("user-name")).toHaveTextContent("Dev Mentor");
    expect(screen.getByTestId("user-role")).toHaveTextContent("Admin");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @irp/web exec vitest run test/mentor-today.test.tsx
```

Expected: FAIL — cannot resolve `@/app/(app)/mentor-today`.

- [ ] **Step 3: Write the component**

Create `apps/web/app/(app)/mentor-today.tsx`:

```tsx
import { listBatches, getBatchDashboardToday, type Role } from "@irp/client";
import { apiClient } from "@/lib/api-client";
import { CycleRibbon } from "@/components/cycle-ribbon/cycle-ribbon";
import { toBatchRibbonDays } from "@/lib/ribbon";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCivilDateLabel } from "./format-civil-date";

/**
 * FR-28, must-ship (SC-4). The warm zone: one cycle ribbon per batch, with
 * "N of M submitted" and the late/absent/missed counts beside it — all of it
 * above the fold at 1280x800 (docs/design-system.md §8.1). The roster is a
 * separate page and is allowed to scroll; these figures are not.
 *
 * One dashboard call per batch, issued concurrently. A batch whose call fails
 * renders its own alert and the others still render — a single 500 must not
 * blank the mentor's home screen.
 */
export async function MentorToday({ displayName, role }: { displayName: string; role: Role }) {
  const client = await apiClient();
  const { data: batches, error: batchesError } = await listBatches({ client });

  const identity = (
    <>
      {/* e2e/signin.spec.ts asserts both on every role. Visually hidden — the
          Topbar already shows the name, and a mentor knows they are a mentor. */}
      <span className="sr-only" data-testid="user-name">{displayName}</span>
      <span className="sr-only" data-testid="user-role">{role}</span>
    </>
  );

  if (batchesError !== undefined) {
    return (
      <div>
        <PageTitle>Today</PageTitle>
        {identity}
        <Panel>
          <p role="alert" style={{ color: "var(--st-missed)" }}>
            {batchesError.detail ?? batchesError.title}
          </p>
        </Panel>
      </div>
    );
  }

  if (batches === undefined || batches.length === 0) {
    return (
      <div>
        <PageTitle>Today</PageTitle>
        {identity}
        <Panel>
          <EmptyState title="No batches yet." hint="Create one from the Students page." />
        </Panel>
      </div>
    );
  }

  const dashboards = await Promise.all(
    batches.map(async (b) => ({
      batch: b,
      result: await getBatchDashboardToday({ client, path: { id: b.id } }),
    })),
  );

  return (
    <div>
      <PageTitle>Today</PageTitle>
      {identity}

      <div className="flex flex-col gap-6">
        {dashboards.map(({ batch, result }) => {
          if (result.data === undefined) {
            return (
              <Panel key={batch.id}>
                <SectionLabel>{batch.name}</SectionLabel>
                <p role="alert" className="mt-2" style={{ color: "var(--st-missed)" }}>
                  {result.error?.detail ?? result.error?.title ?? "This batch's figures could not be loaded."}
                </p>
              </Panel>
            );
          }

          const d = result.data;
          const label =
            d.cycle.seq === null
              ? `${batch.name} · first evaluated cycle opens ${formatCivilDateLabel(d.cycle.startDate)}`
              : `${batch.name} · Cycle ${String(d.cycle.seq)} · Day ${String(d.dayNumber)} of ${String(d.cycle.requiredDayCount)}`;

          return (
            <section key={batch.id} aria-label={batch.name}>
              <CycleRibbon
                days={toBatchRibbonDays(d.days, d.date)}
                extraAfter={[...d.extraAfter]}
                label={label}
              />

              <div className="mt-3 flex flex-wrap items-baseline gap-6 text-sm">
                <span className="tabular font-semibold" data-testid={`submitted-count-${batch.id}`} style={{ color: "var(--ink)" }}>
                  {d.counts.submitted} of {d.counts.enrolled} submitted
                </span>
                <span className="tabular" data-testid={`late-count-${batch.id}`} style={{ color: "var(--st-late)" }}>
                  {d.counts.late} late
                </span>
                <span className="tabular" data-testid={`absent-count-${batch.id}`} style={{ color: "var(--st-absent)" }}>
                  {d.counts.absent} absent
                </span>
                <span className="tabular" data-testid={`missed-count-${batch.id}`} style={{ color: "var(--st-missed)" }}>
                  {d.counts.missed} missed
                </span>
                {d.extraCount > 0 && (
                  <span className="tabular" style={{ color: "var(--ink-muted)" }}>
                    +{d.extraCount} extra this cycle
                  </span>
                )}
              </div>

              <div className="mt-1" data-testid={`day-label-${batch.id}`}>
                <SectionLabel>
                  {formatCivilDateLabel(d.date)}
                  {d.isFallbackDay && " · the last required day, not today"}
                </SectionLabel>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
```

`d.days` and `d.extraAfter` come off a `readonly`-shaped generated type; `toBatchRibbonDays` takes a mutable array, hence the spread on `extraAfter`. If `days` also needs one, spread it the same way rather than widening the mapper.

- [ ] **Step 4: Delegate from the page**

Replace the mentor branch of `apps/web/app/(app)/page.tsx` so the whole file becomes:

```tsx
import { getCurrentUserOrRedirect } from "@/lib/api-client";
import { StudentToday } from "./student-today";
import { MentorToday } from "./mentor-today";

export default async function TodayPage() {
  const user = await getCurrentUserOrRedirect();
  return user.role === "Student" ? (
    <StudentToday displayName={user.displayName} role={user.role} />
  ) : (
    <MentorToday displayName={user.displayName} role={user.role} />
  );
}
```

Update `apps/web/test/today-page.test.tsx`'s mentor-branch assertions: the placeholder copy ("The batch dashboard arrives with Plan 7") is gone, so that file must now mock `@irp/client`'s `listBatches`/`getBatchDashboardToday` as well, or assert only on the delegation. Prefer the latter — the branch's own behaviour is covered by `mentor-today.test.tsx`.

- [ ] **Step 5: Run the tests, the real build, and commit**

```bash
pnpm --filter @irp/web test
pnpm typecheck && pnpm lint
AUTH_DEV_BYPASS=false pnpm --filter @irp/web build
git add apps/web
git commit -m "feat(web): mentor Today dashboard — FR-28's figures on the cycle ribbon"
```

Expected: all green. `pnpm typecheck` alone is not sufficient here — the real `next build` is what catches `typedRoutes` and export-shape errors.

---

## Task 7: Mentor Cycles page

Per batch: the cycle list with its boundaries, and per student per cycle the compliance summary. The evaluation column carries the designed "awaiting evaluation" state (spec D2/D6) — the API returns no such field precisely because no evaluation exists.

**Files:**
- Create: `apps/web/app/(app)/cycles/page.tsx`
- Modify: `apps/web/components/app-frame/sidebar.tsx`
- Test: `apps/web/test/cycles-page.test.tsx`, `apps/web/test/app-frame.test.tsx`

**Interfaces:**
- Consumes: `listBatches`, `getBatchDashboardSummary` from `@irp/client`; `getCurrentUserOrRedirect`, `apiClient`; the UI primitives; `formatCivilDateLabel`.
- Produces: the `/cycles` route, and `Cycles` as a real `<Link>` in `MENTOR_DESTINATIONS`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/cycles-page.test.tsx`, mirroring `roster-page.test.tsx`'s mock setup (`getCurrentUserOrRedirect`, `apiClient`, `next/navigation`'s `redirect` with the `REDIRECT_SENTINEL`):

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CyclesPage from "@/app/(app)/cycles/page";

const { getCurrentUserOrRedirect, apiClient } = vi.hoisted(() => ({
  getCurrentUserOrRedirect: vi.fn(),
  apiClient: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ getCurrentUserOrRedirect, apiClient }));

const { listBatches, getBatchDashboardSummary } = vi.hoisted(() => ({
  listBatches: vi.fn(),
  getBatchDashboardSummary: vi.fn(),
}));
vi.mock("@irp/client", () => ({ listBatches, getBatchDashboardSummary }));

const { redirect, REDIRECT_SENTINEL } = vi.hoisted(() => {
  const REDIRECT_SENTINEL = new Error("REDIRECT_SENTINEL");
  return { REDIRECT_SENTINEL, redirect: vi.fn(() => { throw REDIRECT_SENTINEL; }) };
});
vi.mock("next/navigation", () => ({ redirect }));

const ADMIN = { id: "1", email: "m@bistec.test", displayName: "Dev Mentor", role: "Admin" as const };
const STUDENT = { id: "2", email: "s@bistec.test", displayName: "Dev Student", role: "Student" as const };
const BATCH = { id: "b1", name: "Batch Aurora", startDate: "2026-05-10", endDate: "2026-11-09" };

const summary = (over: Record<string, unknown> = {}) => ({
  batchId: "b1",
  batchName: "Batch Aurora",
  cycle: { seq: 3, startDate: "2026-07-10", endDate: "2026-08-09", requiredDayCount: 22 },
  students: [
    {
      student: { id: "s1", displayName: "Amaya Wickramasinghe", email: "amaya@dev.local" },
      counts: {
        requiredDays: 22, settledDays: 17, onTime: 13, late: 2, absent: 1,
        missed: 1, pending: 1, extra: 2, complianceRate: 0.9412,
      },
      reviewProgress: { submitted: 4, inReview: 3, evaluated: 10 },
    },
  ],
  ...over,
});

describe("CyclesPage", () => {
  it("redirects a Student caller to / rather than rendering another student's figures", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT);
    await expect(CyclesPage({ searchParams: Promise.resolve({}) })).rejects.toBe(REDIRECT_SENTINEL);
    expect(redirect).toHaveBeenCalledWith("/");
    expect(listBatches).not.toHaveBeenCalled();
  });

  it("renders one row per student with the compliance percentage and the outcome split", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({ data: summary(), error: undefined });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1" }) }));

    expect(screen.getByText("Amaya Wickramasinghe")).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();
    expect(screen.getByTestId("counts-s1")).toHaveTextContent("13 on time");
    expect(screen.getByTestId("counts-s1")).toHaveTextContent("1 missed");
    expect(screen.getByTestId("extra-s1")).toHaveTextContent("+2 extra");
  });

  it("renders a dash, not 0%, when no day has settled", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({
      data: summary({
        students: [{
          student: { id: "s2", displayName: "Fresh Start", email: "fresh@dev.local" },
          counts: {
            requiredDays: 22, settledDays: 0, onTime: 0, late: 0, absent: 0,
            missed: 0, pending: 0, extra: 0, complianceRate: null,
          },
          reviewProgress: { submitted: 0, inReview: 0, evaluated: 0 },
        }],
      }),
      error: undefined,
    });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1" }) }));

    expect(screen.getByTestId("compliance-s2")).toHaveTextContent("—");
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows the awaiting-evaluation state for every student — no scores exist in this release", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({ data: summary(), error: undefined });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1" }) }));

    expect(screen.getByTestId("evaluation-s1")).toHaveTextContent(/awaiting evaluation/i);
  });

  it("offers a cycle picker back to cycle 1 and carries the batch forward", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({ data: summary(), error: undefined });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1" }) }));

    expect(screen.getByRole("link", { name: "Cycle 1" })).toHaveAttribute("href", "/cycles?batchId=b1&cycle=1");
    expect(screen.getByRole("link", { name: "Cycle 3" })).toHaveAttribute("aria-current", "page");
  });

  it("requests the cycle named in the query string", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({
      data: summary({ cycle: { seq: 2, startDate: "2026-06-10", endDate: "2026-07-09", requiredDayCount: 22 } }),
      error: undefined,
    });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1", cycle: "2" }) }));

    expect(getBatchDashboardSummary).toHaveBeenCalledWith({
      client: {}, path: { id: "b1" }, query: { cycle: 2 },
    });
  });

  it("ignores a non-numeric cycle param rather than sending it to the API", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({ data: summary(), error: undefined });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1", cycle: "banana" }) }));

    expect(getBatchDashboardSummary).toHaveBeenCalledWith({ client: {}, path: { id: "b1" }, query: {} });
  });

  it("renders the problem detail when the summary call errors", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({
      data: undefined,
      error: { type: "about:blank", title: "Invalid cycle", status: 400, detail: "Cycle 9 has not started." },
    });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1", cycle: "9" }) }));

    expect(screen.getByRole("alert")).toHaveTextContent("Cycle 9 has not started.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @irp/web exec vitest run test/cycles-page.test.tsx
```

Expected: FAIL — cannot resolve `@/app/(app)/cycles/page`.

- [ ] **Step 3: Write the page**

Create `apps/web/app/(app)/cycles/page.tsx`. Follow `roster/page.tsx`'s structure exactly — same Admin guard, same batch-picker `<Link>` list, same error/empty panels — with these differences:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { listBatches, getBatchDashboardSummary } from "@irp/client";
import { getCurrentUserOrRedirect, apiClient } from "@/lib/api-client";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCivilDateLabel } from "../format-civil-date";

/**
 * The mentor's per-cycle view (spec §5). Admin-only; a Student is bounced to
 * "/" rather than shown a 403 page, matching Roster and Review.
 *
 * There is no evaluation column data to fetch: no Evaluation row exists in
 * this release (O-5 blocks the AI provider decision), so the column renders
 * the designed awaiting state for every student rather than the API
 * returning a field that is always null.
 */
export default async function CyclesPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string; cycle?: string }>;
}) {
  const user = await getCurrentUserOrRedirect();
  if (user.role !== "Admin") redirect("/");

  const { batchId, cycle: rawCycle } = await searchParams;
  // The picker submits a plain integer; anything else -- an empty string from
  // a cleared control, a hand-edited URL -- is treated as "not supplied" and
  // never forwarded, so the API's own 400 is reserved for cycles that are
  // well-formed but out of range.
  const parsed = Number(rawCycle);
  const cycle =
    rawCycle !== undefined && rawCycle !== "" && Number.isInteger(parsed) && parsed >= 1
      ? parsed
      : undefined;

  const client = await apiClient();
  const { data: batches, error: batchesError } = await listBatches({ client });

  if (batchesError !== undefined) {
    return (
      <div>
        <PageTitle>Cycles</PageTitle>
        <Panel>
          <p role="alert" style={{ color: "var(--st-missed)" }}>
            {batchesError.detail ?? batchesError.title}
          </p>
        </Panel>
      </div>
    );
  }

  if (batches === undefined || batches.length === 0) {
    return (
      <div>
        <PageTitle>Cycles</PageTitle>
        <Panel>
          <EmptyState title="No batches yet." hint="Create one from the Students page." />
        </Panel>
      </div>
    );
  }

  const selected = batches.find((b) => b.id === batchId) ?? batches[0]!;
  const { data, error } = await getBatchDashboardSummary({
    client,
    path: { id: selected.id },
    query: cycle === undefined ? {} : { cycle },
  });

  return (
    <div>
      <PageTitle>Cycles</PageTitle>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel>Batch</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {batches.map((b) => (
              <Link
                key={b.id}
                href={{ pathname: "/cycles", query: { batchId: b.id } }}
                aria-current={b.id === selected.id ? "page" : undefined}
                className="rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
                style={{
                  borderColor: "var(--line)",
                  color: b.id === selected.id ? "var(--ink)" : "var(--ink-muted)",
                  background: b.id === selected.id ? "var(--surface-sunk)" : "transparent",
                }}
              >
                {b.name}
              </Link>
            ))}
          </div>
        </div>

        {/* Switching batch drops the cycle number on purpose: cycle 3 of one
            batch is not cycle 3 of another, and carrying it forward would
            silently show a different month under the same label. */}
        {data !== undefined && data.cycle.seq !== null && (
          <div>
            <SectionLabel>Cycle</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from({ length: data.cycle.seq }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={{ pathname: "/cycles", query: { batchId: selected.id, cycle: n } }}
                  aria-current={n === data.cycle.seq ? "page" : undefined}
                  className="tabular rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
                  style={{
                    borderColor: "var(--line)",
                    color: n === data.cycle.seq ? "var(--ink)" : "var(--ink-muted)",
                    background: n === data.cycle.seq ? "var(--surface-sunk)" : "transparent",
                  }}
                >
                  Cycle {n}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {error !== undefined && (
        <Panel>
          <p role="alert" style={{ color: "var(--st-missed)" }}>
            {error.detail ?? error.title}
          </p>
        </Panel>
      )}

      {data !== undefined && (
        <Panel sunk>
          <div className="mb-3">
            <SectionLabel>
              {data.cycle.seq === null
                ? `First evaluated cycle opens ${formatCivilDateLabel(data.cycle.startDate)}`
                : `Cycle ${String(data.cycle.seq)} · ${formatCivilDateLabel(data.cycle.startDate)} – ${formatCivilDateLabel(data.cycle.endDate)}`}
            </SectionLabel>
          </div>
          {data.students.length === 0 ? (
            <EmptyState
              title="Nobody was enrolled in this cycle."
              hint="Enrol students from the Students page."
            />
          ) : (
            /* the table below */ null
          )}
        </Panel>
      )}
    </div>
  );
}
```

The table replacing `/* the table below */`. It uses the roster's hand-rolled chrome; Task 9 migrates both onto `Table`/`Th`/`Td` in one pass, so do not pre-empt it here:

```tsx
            <table className="w-full text-[13px]" style={{ color: "var(--ink)" }}>
              <thead>
                <tr style={{ color: "var(--ink-muted)" }}>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Student</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Required</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Outcomes</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Extra</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Compliance</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Review</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Evaluation</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map(({ student, counts, reviewProgress }) => (
                  <tr key={student.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="px-2 py-2">
                      <div>{student.displayName}</div>
                      <div className="text-xs" style={{ color: "var(--ink-muted)" }}>{student.email}</div>
                    </td>
                    <td className="tabular px-2 py-2">{counts.requiredDays}</td>
                    {/* One cell, four figures: the outcomes only mean anything
                        read together, and four columns of mostly-zero would
                        cost the width the Review and Evaluation columns need. */}
                    <td className="tabular px-2 py-2" data-testid={`counts-${student.id}`}>
                      <span style={{ color: "var(--st-ok)" }}>{counts.onTime} on time</span>
                      {" · "}
                      <span style={{ color: "var(--st-late)" }}>{counts.late} late</span>
                      {" · "}
                      <span style={{ color: "var(--st-absent)" }}>{counts.absent} absent</span>
                      {" · "}
                      <span style={{ color: "var(--st-missed)" }}>{counts.missed} missed</span>
                    </td>
                    {/* Extra is muted, never a status colour — design-system
                        §3.2, "distinguished by form, not colour". */}
                    <td className="tabular px-2 py-2" data-testid={`extra-${student.id}`} style={{ color: "var(--ink-muted)" }}>
                      {counts.extra > 0 ? `+${String(counts.extra)} extra` : "—"}
                    </td>
                    {/* A dash, not 0%: no settled day means no rate exists,
                        and a zero would read as total failure. */}
                    <td className="tabular px-2 py-2" data-testid={`compliance-${student.id}`}>
                      {counts.complianceRate === null
                        ? "—"
                        : `${String(Math.round(counts.complianceRate * 100))}%`}
                    </td>
                    <td className="tabular px-2 py-2" style={{ color: "var(--ink-muted)" }}>
                      {reviewProgress.evaluated} evaluated · {reviewProgress.inReview} in review ·{" "}
                      {reviewProgress.submitted} to do
                    </td>
                    <td className="px-2 py-2" data-testid={`evaluation-${student.id}`} style={{ color: "var(--ink-muted)" }}>
                      Awaiting evaluation
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
```

Above the table, a `SectionLabel` reading `Cycle {seq} · {formatCivilDateLabel(startDate)} – {formatCivilDateLabel(endDate)}`, and when `students.length === 0` an `EmptyState` with title `"Nobody was enrolled in this cycle."` and hint `"Enrol students from the Students page."`.

- [ ] **Step 4: Make `Cycles` a real link**

In `apps/web/components/app-frame/sidebar.tsx`, change `{ label: "Cycles" }` to `{ label: "Cycles", href: "/cycles" }` and update the doc comment: Task 7 added `apps/web/app/(app)/cycles/page.tsx`, so Cycles is now a real link; the only remaining label-only destination is `My month`, which Task 8 removes. Update `apps/web/test/app-frame.test.tsx`'s assertion about which mentor destinations are links.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @irp/web test && pnpm typecheck && pnpm lint
AUTH_DEV_BYPASS=false pnpm --filter @irp/web build
git add apps/web
git commit -m "feat(web): mentor Cycles page with per-student compliance"
```

---

## Task 8: Student My month — FR-29 and FR-30

The student's own history: the ribbon with personal marks, "Month N of 6", the day-by-day record, and the strengths-and-weaknesses panel in its designed empty state.

**Files:**
- Create: `apps/web/app/(app)/my-month/page.tsx`
- Modify: `apps/web/components/app-frame/sidebar.tsx`
- Test: `apps/web/test/my-month-page.test.tsx`, `apps/web/test/app-frame.test.tsx`

**Interfaces:**
- Consumes: `getMyDashboard`, `listMyDays` from `@irp/client`; `getCurrentUserOrRedirect`, `apiClient`; `toStudentRibbonDays`; `CycleRibbon`; `StatusPill`; `formatCivilDateLabel`.
- Produces: the `/my-month` route, and `My month` as a real `<Link>` in `STUDENT_DESTINATIONS`.

**Two calls, deliberately.** `getMyDashboard` gives the ribbon, the counts and the programme position; `listMyDays` gives the entry bodies for the history list. The dashboard endpoint does not carry entry text — it is an aggregate, and putting a cycle's worth of prose in it would make the mentor's identical aggregate path pay for text no mentor screen renders.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/my-month-page.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MyMonthPage from "@/app/(app)/my-month/page";

const { getCurrentUserOrRedirect, apiClient } = vi.hoisted(() => ({
  getCurrentUserOrRedirect: vi.fn(),
  apiClient: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ getCurrentUserOrRedirect, apiClient }));

const { getMyDashboard, listMyDays } = vi.hoisted(() => ({
  getMyDashboard: vi.fn(),
  listMyDays: vi.fn(),
}));
vi.mock("@irp/client", () => ({ getMyDashboard, listMyDays }));

const STUDENT = { id: "s1", email: "s@bistec.test", displayName: "Dev Student", role: "Student" as const };

const dash = (over: Record<string, unknown> = {}) => ({
  today: "2026-08-03",
  programmeMonths: 6,
  firstEvaluatedCycleStart: "2026-06-10",
  cycle: { seq: 3, startDate: "2026-07-10", endDate: "2026-08-09", requiredDayCount: 22 },
  days: [
    { date: "2026-07-31", status: "onTime" },
    { date: "2026-08-03", status: "late" },
  ],
  extraAfter: ["2026-07-31"],
  summary: {
    requiredDays: 22, settledDays: 17, onTime: 13, late: 2, absent: 1,
    missed: 1, pending: 1, extra: 2, complianceRate: 0.9412,
  },
  strengthsAndWeaknesses: null,
  ...over,
});

describe("MyMonthPage", () => {
  it("shows Month N of 6 and the student's own ribbon", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT);
    apiClient.mockResolvedValue({});
    getMyDashboard.mockResolvedValue({ data: dash(), error: undefined });
    listMyDays.mockResolvedValue({ data: [], error: undefined });

    render(await MyMonthPage());

    expect(screen.getByText(/Month 3 of 6/)).toBeInTheDocument();
    expect(screen.getByRole("figure")).toBeInTheDocument();
    expect(screen.getByTestId("required-day-count")).toHaveTextContent("2 required days in this cycle");
    // The ring comes from the server's Asia/Colombo date, not the browser's.
    expect(screen.getByLabelText("2026-08-03: late, today")).toBeInTheDocument();
  });

  it("renders the designed strengths-and-weaknesses empty state, never a blank panel", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT);
    apiClient.mockResolvedValue({});
    getMyDashboard.mockResolvedValue({ data: dash(), error: undefined });
    listMyDays.mockResolvedValue({ data: [], error: undefined });

    render(await MyMonthPage());

    expect(screen.getByText(/No evaluation yet/)).toBeInTheDocument();
    expect(screen.getByText(/after your cycle closes/)).toBeInTheDocument();
  });

  it("shows no score, no rank, and no other student anywhere (FR-30)", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT);
    apiClient.mockResolvedValue({});
    getMyDashboard.mockResolvedValue({ data: dash(), error: undefined });
    listMyDays.mockResolvedValue({ data: [], error: undefined });

    const { container } = render(await MyMonthPage());

    expect(container.textContent).not.toMatch(/rank|score|index|leaderboard/i);
  });

  it("tells a mid-cycle joiner when their first evaluated cycle opens, instead of Month null of 6", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT);
    apiClient.mockResolvedValue({});
    getMyDashboard.mockResolvedValue({
      data: dash({
        cycle: { seq: null, startDate: "2026-07-10", endDate: "2026-08-09", requiredDayCount: 22 },
        firstEvaluatedCycleStart: "2026-08-10",
      }),
      error: undefined,
    });
    listMyDays.mockResolvedValue({ data: [], error: undefined });

    render(await MyMonthPage());

    expect(screen.getByText(/first evaluated month starts/i)).toBeInTheDocument();
    expect(screen.queryByText(/Month null/)).not.toBeInTheDocument();
  });

  it("lists the cycle's days newest first, with a status pill and the entry text", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT);
    apiClient.mockResolvedValue({});
    getMyDashboard.mockResolvedValue({ data: dash(), error: undefined });
    listMyDays.mockResolvedValue({
      data: [
        {
          date: "2026-07-31", status: "onTime", reportStatus: "Evaluated", reportId: "r1",
          absenceReason: null,
          entries: [{
            id: "e1", entryDate: "2026-07-31", body: "Older entry.",
            submittedAt: "2026-07-31T11:30:00.000Z", isLate: false, isExtra: false,
          }],
        },
        {
          date: "2026-08-03", status: "late", reportStatus: "Submitted", reportId: "r2",
          absenceReason: null,
          entries: [{
            id: "e2", entryDate: "2026-08-03", body: "Newer entry.",
            submittedAt: "2026-08-04T04:10:00.000Z", isLate: true, isExtra: false,
          }],
        },
      ],
      error: undefined,
    });

    render(await MyMonthPage());

    const bodies = screen.getAllByTestId("day-entry-body").map((n) => n.textContent);
    expect(bodies).toEqual(["Newer entry.", "Older entry."]);
    expect(screen.getByText("Late")).toBeInTheDocument();
    expect(screen.getByText(/Evaluated \(locked\)/)).toBeInTheDocument();
  });

  it("shows the absence reason on an absent day", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT);
    apiClient.mockResolvedValue({});
    getMyDashboard.mockResolvedValue({ data: dash(), error: undefined });
    listMyDays.mockResolvedValue({
      data: [{
        date: "2026-08-03", status: "absent", reportStatus: null, reportId: null,
        absenceReason: "Medical appointment", entries: [],
      }],
      error: undefined,
    });

    render(await MyMonthPage());

    expect(screen.getByText("Medical appointment")).toBeInTheDocument();
  });

  it("renders the problem detail when the dashboard call errors", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT);
    apiClient.mockResolvedValue({});
    getMyDashboard.mockResolvedValue({
      data: undefined,
      error: { type: "about:blank", title: "Internal Server Error", status: 500, detail: "Your month could not be loaded." },
    });
    listMyDays.mockResolvedValue({ data: [], error: undefined });

    render(await MyMonthPage());

    expect(screen.getByRole("alert")).toHaveTextContent("Your month could not be loaded.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @irp/web exec vitest run test/my-month-page.test.tsx
```

Expected: FAIL — cannot resolve `@/app/(app)/my-month/page`.

- [ ] **Step 3: Write the page**

Create `apps/web/app/(app)/my-month/page.tsx`. Shape:

```tsx
import { redirect } from "next/navigation";
import { getMyDashboard, listMyDays } from "@irp/client";
import { getCurrentUserOrRedirect, apiClient } from "@/lib/api-client";
import { CycleRibbon } from "@/components/cycle-ribbon/cycle-ribbon";
import { toStudentRibbonDays } from "@/lib/ribbon";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCivilDateLabel } from "../format-civil-date";

/**
 * FR-29: the student's own month. FR-30 is structural here — this page calls
 * only /me endpoints, which take no student identifier, so there is no
 * parameter through which another student's data could arrive. It renders no
 * score, no rank and no peer.
 *
 * A mentor reaching this route is redirected home: it is not a security
 * boundary (the API is), just the wrong screen for them — a mentor holds no
 * enrolment and would see an empty month.
 */
export default async function MyMonthPage() {
  const user = await getCurrentUserOrRedirect();
  if (user.role !== "Student") redirect("/");

  const client = await apiClient();
  const [{ data: dashboard, error }, { data: dayRows }] = await Promise.all([
    getMyDashboard({ client }),
    listMyDays({ client }),
  ]);
  ...
}
```

Contents, top to bottom:

1. `PageTitle` — `My month`.
2. The error panel when `error !== undefined` (`role="alert"`, `--st-missed`), returning early exactly as `roster/page.tsx` does.
3. A heading line: when `dashboard.cycle.seq !== null`, `Month {seq} of {programmeMonths} · {formatCivilDateLabel(startDate)} – {formatCivilDateLabel(endDate)}`; when `null`, `Your first evaluated month starts {formatCivilDateLabel(firstEvaluatedCycleStart)}` — and when `firstEvaluatedCycleStart` is also null, `You are not enrolled in a batch yet.` Never print `Month null`.
4. `CycleRibbon` with `days={toStudentRibbonDays([...dashboard.days], dashboard.today)}`, `extraAfter={[...dashboard.extraAfter]}`, and `label` matching the heading line. `dashboard.today` is the server's Asia/Colombo date — never `new Date()` in the browser, which would ring the wrong bar for anyone outside Sri Lanka.
5. A counts line mirroring mentor Today's, from `dashboard.summary`: `{onTime} on time · {late} late · {absent} absent · {missed} missed`, plus `+{extra} extra` in `--ink-muted` when non-zero, and `{Math.round(rate*100)}% compliance` — or `—` when `complianceRate` is null.
6. `SectionLabel` `Strengths and areas to develop`, then a `Panel`: when `strengthsAndWeaknesses` is null, `<EmptyState title="No evaluation yet — your first summary appears after your cycle closes." />` (spec D6's exact copy); otherwise the prose.
7. `SectionLabel` `Your days`, then one `Panel` per day from `dayRows`, **newest first** (brief R5 — reverse the ascending array), each carrying: the date label, a `StatusPill` for `status`/`reportStatus` (suppressed when `status === "none"`, the convention Task 12 established), the absence reason when present, and each entry's body in `<p data-testid="day-entry-body">`. An `EmptyState` when `dayRows` is empty or undefined: title `"Nothing recorded this cycle yet."`, hint `"Your entries appear here as you submit them."`

- [ ] **Step 4: Make `My month` a real link**

In `apps/web/components/app-frame/sidebar.tsx`, change `{ label: "My month" }` to `{ label: "My month", href: "/my-month" }`, and rewrite the doc comment: every destination on both lists is now a real link, so the label-only branch exists for future destinations rather than for a specific pending page. Do **not** delete that branch — it is what keeps a future destination from needing an `as Route` cast. Update `apps/web/test/app-frame.test.tsx` accordingly, and add a test asserting a Student still never sees a mentor destination.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter @irp/web test && pnpm typecheck && pnpm lint
AUTH_DEV_BYPASS=false pnpm --filter @irp/web build
git add apps/web
git commit -m "feat(web): student My month — FR-29 history and the designed empty evaluation state"
```

---

## Task 9: Typography migration audit

Spec D8: "one shared component vocabulary across every page; no page-local font/size/colour styling survives", and "page-local `style={{...}}` typography does not survive review". Plan 6 built the six primitives but left three pages hand-rolling label and table typography. This task closes it across all eight pages and adds the two primitives the repetition proves are missing.

**Scope, precisely.** *Typography* means font family, size, weight, letter-spacing, line-height and text transform. Colour tokens applied through `style={{ color: "var(--…)" }}` are **in scope only where they travel with a repeated typographic pattern** (a section label, a table header) — a one-off `style={{ color: "var(--st-missed)" }}` on an alert stays, because it is semantic, not typographic, and hoisting it would invent a primitive per status.

**Files:**
- Create: `apps/web/components/ui/field-label.tsx`, `apps/web/components/ui/table.tsx`
- Modify: `apps/web/app/(app)/roster/page.tsx`, `cycles/page.tsx`, `students/page.tsx`, `students/forms.tsx`, `review/page.tsx`, `review/[studentId]/page.tsx`, `review/[studentId]/day-record-form.tsx`, `student-today.tsx`, `entry-composer.tsx`, `absence-toggle.tsx`, `my-month/page.tsx`, `mentor-today.tsx`
- Test: `apps/web/test/ui-primitives.test.tsx`

- [ ] **Step 1: Inventory what is actually there**

```bash
cd apps/web
# Typographic utilities used outside components/ui — the audit's work list.
rg -n 'text-\[|text-(xs|sm|base|lg|xl|2xl)|font-(light|normal|medium|semibold|bold)|tracking-|uppercase|leading-' app | rg -v 'components/ui'
# Inline typography through the style prop.
rg -n 'style=\{\{[^}]*(fontSize|fontWeight|fontFamily|letterSpacing|lineHeight|textTransform)' app components
```

Record the counts before and after in the task's report — "before: N sites in M files, after: K" is the evidence this task ran, and a reviewer can rerun both commands.

- [ ] **Step 2: Write the failing primitive tests**

Append to `apps/web/test/ui-primitives.test.tsx`:

```tsx
describe("FieldLabel", () => {
  it("renders a <label> bound to its control", () => {
    render(
      <>
        <FieldLabel htmlFor="roster-date">Date</FieldLabel>
        <input id="roster-date" />
      </>,
    );
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
  });

  it("carries the 12px uppercase tracked treatment, so no page has to restate it", () => {
    render(<FieldLabel htmlFor="x">Batch</FieldLabel>);
    const label = screen.getByText("Batch");
    expect(label.className).toContain("uppercase");
    expect(label.className).toContain("text-xs");
  });
});

describe("Table", () => {
  it("renders a real table with scoped column headers", () => {
    render(
      <Table>
        <thead>
          <tr><Th>Student</Th><Th>Status</Th></tr>
        </thead>
        <tbody>
          <tr><Td>Amaya</Td><Td>On time</Td></tr>
        </tbody>
      </Table>,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Student" })).toHaveAttribute("scope", "col");
    expect(screen.getAllByRole("cell")).toHaveLength(2);
  });

  it("right-aligns and tabular-figures a numeric cell on request", () => {
    render(<Table><tbody><tr><Td numeric>22</Td></tr></tbody></Table>);
    expect(screen.getByRole("cell").className).toContain("tabular");
  });
});
```

Import `FieldLabel`, `Table`, `Th`, `Td` at the top of the file.

- [ ] **Step 3: Run to verify they fail, then write the primitives**

```bash
pnpm --filter @irp/web exec vitest run test/ui-primitives.test.tsx
```

Expected: FAIL — modules not found.

`apps/web/components/ui/field-label.tsx`:

```tsx
/**
 * The form-field label — the same 12px uppercase tracked treatment
 * SectionLabel carries (docs/design-system.md §4), but as a real `<label>`
 * bound to a control. SectionLabel is a `<div>`: using it for a field label
 * loses the association, and using a bare `<label>` loses the typography.
 * Three pages hand-rolled this before Plan 7's audit; now nobody does.
 */
import type { LabelHTMLAttributes, ReactNode } from "react";

export function FieldLabel({
  children,
  ...rest
}: { children: ReactNode } & LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label {...rest} className="block text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
      {children}
    </label>
  );
}
```

`apps/web/components/ui/table.tsx`:

```tsx
/**
 * The one table vocabulary — docs/design-system.md §4 (13px body, tabular
 * figures for numbers) and §8.1's roster. Roster, Cycles and Students each
 * hand-rolled the identical `w-full text-[13px]` / muted `<th>` / `border-top
 * 1px var(--line)` chrome; this is that chrome, once.
 *
 * `numeric` on a cell selects right alignment and tabular figures — a column
 * of counts that does not line up is the specific thing §4's tabular-figures
 * rule exists to prevent.
 */
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <table className="w-full text-[13px]" style={{ color: "var(--ink)" }}>
      {children}
    </table>
  );
}

export function Th({
  children,
  numeric = false,
  ...rest
}: { children: ReactNode; numeric?: boolean } & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...rest}
      scope="col"
      className={`px-2 py-2 font-normal ${numeric ? "text-right" : "text-left"}`}
      style={{ color: "var(--ink-muted)" }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric = false,
  ...rest
}: { children: ReactNode; numeric?: boolean } & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td {...rest} className={`px-2 py-2 ${numeric ? "tabular text-right" : ""}`}>
      {children}
    </td>
  );
}
```

Rows keep their own `style={{ borderTop: "1px solid var(--line)" }}` — that is layout, not typography, and pushing a `<Tr>` in solely to carry one border would add a component with no vocabulary of its own.

- [ ] **Step 4: Migrate every page**

Work the Step 1 list. The mechanical substitutions:

| Found | Replace with |
|---|---|
| `<label className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>` | `<FieldLabel htmlFor="…">` |
| `<div className="text-xs uppercase tracking-[0.08em]" …>` used as a heading | `<SectionLabel>` |
| `<table className="w-full text-[13px]" …>` | `<Table>` |
| `<th scope="col" className="px-2 py-2 text-left font-normal" …>` | `<Th>` |
| `<td className="px-2 py-2">` / `<td className="tabular px-2 py-2">` | `<Td>` / `<Td numeric>` |
| an `<h2>`/`<h3>` with hand-set size and tracking | `<SectionLabel>`, or `<PageTitle>` if it is genuinely the page's h1 |

Each page's existing tests are the regression guard — they assert on rendered text and roles, so a correct migration leaves them green. If one breaks on a class name, the *test* was over-specified: rewrite it to assert behaviour, and say so in the task report.

- [ ] **Step 5: Verify the audit is complete**

Rerun both Step 1 commands. Expected: the only remaining hits outside `components/ui` are (a) `sr-only`, (b) semantic one-off colours on alerts and status text, and (c) `tabular` where it sits on a non-table element such as mentor Today's counts line. Anything else is unfinished — list it in the report with the reason it stays.

```bash
pnpm --filter @irp/web test && pnpm typecheck && pnpm lint
AUTH_DEV_BYPASS=false pnpm --filter @irp/web build
```

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "refactor(web): migrate every page onto the shared typography primitives (spec D8)"
```

---

## Task 10: Dashboard e2e

Spec §7's remaining Playwright rows: mentor Today shows the seeded "N of M", student My month shows pills and the empty S&W state. Runs against `next dev` with `AUTH_DEV_BYPASS=true` and a freshly seeded database — the bypass constraint stands, and so does the two-cold-compile budget in `playwright.config.ts`.

**Files:**
- Create: `apps/web/e2e/dashboard-flows.spec.ts`
- Modify: `apps/web/e2e/README.md`

- [ ] **Step 1: Re-seed, and read what the seed actually produced**

```bash
export DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'
pnpm --filter @irp/api db:seed
```

The seed computes everything backwards from the run date, so no test may hard-code a date, a count or a percentage. Assertions must be **relational**: derived from what the page itself reports, or from a second page that must agree with it.

- [ ] **Step 2: Write the spec**

Create `apps/web/e2e/dashboard-flows.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { SEED_BATCH_NAMES, SEED_STUDENTS } from "@irp/fixtures";
import { signInAsMentor, signInAsStudent } from "./helpers";

/**
 * Plan 7's dashboards over the seeded personas. Everything here is relational:
 * the seed is a function of the run date (spec §6), so a hard-coded count or
 * percentage would pass today and fail on the 10th.
 */
test.describe("mentor Today (FR-28)", () => {
  test("shows N of M submitted for each seeded batch, with N never exceeding M", async ({ page }) => {
    await signInAsMentor(page);

    for (const name of Object.values(SEED_BATCH_NAMES)) {
      const section = page.getByRole("region", { name });
      await expect(section).toBeVisible();
      const counts = await section.getByText(/\d+ of \d+ submitted/).textContent();
      const [submitted, enrolled] = counts!.match(/(\d+) of (\d+)/)!.slice(1).map(Number);
      expect(submitted).toBeLessThanOrEqual(enrolled!);
      expect(enrolled).toBeGreaterThan(0);
    }
  });

  test("M matches the number of rows the Roster shows for the same batch and date", async ({ page }) => {
    await signInAsMentor(page);
    const section = page.getByRole("region", { name: SEED_BATCH_NAMES.A });
    const counts = await section.getByText(/\d+ of \d+ submitted/).textContent();
    const enrolled = Number(counts!.match(/of (\d+)/)![1]);
    const dayLabel = await section.getByText(/,/).first().textContent();

    await page.getByRole("link", { name: "Roster" }).click();
    await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
    // The roster defaults to the same resolved day the dashboard reports.
    await expect(page.getByText(dayLabel!.split("·")[0]!.trim())).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(enrolled);
  });

  test("renders a ribbon whose required-day count matches the cycle length it names", async ({ page }) => {
    await signInAsMentor(page);
    const section = page.getByRole("region", { name: SEED_BATCH_NAMES.A });
    const label = await section.getByRole("figure").locator("figcaption").textContent();
    const declared = Number(label!.match(/of (\d+)/)![1]);
    await expect(section.getByTestId("required-day-count"))
      .toHaveText(`${String(declared)} required days in this cycle`);
  });

  test("the Cycles page lists a row per Batch Aurora student and never a score", async ({ page }) => {
    await signInAsMentor(page);
    await page.getByRole("link", { name: "Cycles" }).click();
    await expect(page.getByRole("heading", { name: "Cycles" })).toBeVisible();

    const activeAuroraStudents = SEED_STUDENTS.filter((s) => s.batch === "A" && s.kind !== "archived");
    for (const s of activeAuroraStudents) {
      await expect(page.getByText(s.name)).toBeVisible();
    }
    // The archived persona has left active rosters (FR-5).
    const archived = SEED_STUDENTS.find((s) => s.kind === "archived")!;
    await expect(page.getByText(archived.name)).toHaveCount(0);
    await expect(page.getByText(/awaiting evaluation/i).first()).toBeVisible();
  });
});

test.describe("student My month (FR-29, FR-30)", () => {
  test("shows Month N of 6, the student's own pills, and the designed empty evaluation state", async ({ page }) => {
    await signInAsStudent(page);
    await page.getByRole("link", { name: "My month" }).click();

    await expect(page.getByRole("heading", { name: "My month" })).toBeVisible();
    await expect(page.getByText(/Month \d of 6/)).toBeVisible();
    await expect(page.getByRole("figure")).toBeVisible();
    await expect(page.getByText(/No evaluation yet/)).toBeVisible();
    // dev-student-1 is the fully compliant persona, so at least one on-time day.
    await expect(page.locator('[data-status="onTime"]').first()).toBeVisible();
  });

  test("shows no score, rank or other student's name anywhere on the page (FR-30)", async ({ page }) => {
    await signInAsStudent(page);
    await page.getByRole("link", { name: "My month" }).click();
    await expect(page.getByRole("heading", { name: "My month" })).toBeVisible();

    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/rank|leaderboard|performance index/i);
    for (const other of SEED_STUDENTS.filter((s) => s.externalId !== "dev-student-1")) {
      expect(text).not.toContain(other.name);
    }
  });

  test("a student cannot reach the mentor dashboards, and is not offered them", async ({ page }) => {
    await signInAsStudent(page);
    await expect(page.getByRole("link", { name: "Cycles" })).toHaveCount(0);

    await page.goto("/cycles");
    // Redirected home, not shown a 403 page — the pattern Roster and Review set.
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  });
});
```

The `getByRole("region", { name })` locator requires the `<section aria-label={batch.name}>` Task 6 renders; if it is missing, fix Task 6's component rather than weakening the locator.

- [ ] **Step 3: Run the suite**

```bash
export AUTH_DEV_BYPASS=true
pnpm --filter @irp/web e2e
```

Expected: PASS — the three pre-existing spec files plus these seven. The first assertion absorbs two cold Turbopack compiles (~4.9s); `playwright.config.ts` already budgets `expect: { timeout: 20_000 }` for it. **Do not lower those timeouts.**

If a test is flaky on a client-side `<Link>` transition, use the `switchToBatch` pattern from `e2e/helpers.ts` — wait for a rendered consequence, never a bare click.

- [ ] **Step 4: Update the e2e README and commit**

Add the dashboard flows to `apps/web/e2e/README.md`'s persona-to-flow map: which personas each new test touches, that the suite requires a fresh `db:seed`, and that every dashboard assertion is relational because the seed moves with the calendar.

```bash
git add apps/web/e2e
git commit -m "test(e2e): dashboard flows over the seeded personas, relational assertions only"
```

---

## Task 11: `docs/walkthrough.md`

Spec §7's manual row: a persona-by-persona script saying what to click and exactly what should appear. It doubles as the SC-3 legibility check and is what the stakeholder demo is driven from.

**Files:** Create `docs/walkthrough.md`

- [ ] **Step 1: Re-seed and walk it yourself first**

```bash
export DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'
pnpm --filter @irp/api db:seed
AUTH_DEV_BYPASS=true pnpm --filter @irp/web dev   # and, in another shell, pnpm --filter @irp/api dev
```

Open `http://localhost:3000` — **`localhost`, never `127.0.0.1`** (Next canonicalises loopback hostnames; `127.0.0.1` breaks hydration and the auth callback). Sign in through the dev identity picker as each persona and write down what you actually see. A walkthrough written from the code rather than the screen is how the demo finds its own bugs live.

- [ ] **Step 2: Write the document**

Structure:

1. **Before you start** — the two commands above, the `localhost` rule, and the fact that the seed is relative to the run date so figures differ from any screenshot.
2. **The cast** — a table of the ten students and two mentors from `@irp/fixtures`: name, batch, persona kind, and *what makes them interesting on screen* (Nuwan carries late badges; Sachini has missed days; Kavindu has absence reasons; Dilini has weekend Extra slots; Ramesh joined mid-cycle so his early days read `—` not `missed`; Amaya transferred A→B; Tharindu is archived and must not appear on an active roster; Chamodi is the mixed record).
3. **Mentor walkthrough** — sign in as Dev Mentor, then Today → Roster → Review → Cycles → Students, each step naming the click and the expected observation. For Today: "two ribbons, one per batch; Batch Aurora reads Cycle 3, Batch Basalt Cycle 1 — the two batches were admitted two cycles apart and that is the visible difference (FR-6/FR-9)."
4. **Student walkthrough** — sign in as Dev Student, then Today → submit → My month. Then repeat as Nuwan (late), Kavindu (absent), Dilini (weekend Extra), Ramesh (joiner).
5. **The negative checks** — the archived persona lands on `/not-registered`; the unregistered identity 403s; a student has no Roster/Review/Cycles link and `/cycles` redirects home; nowhere in any student view is there a score, a rank or another student's name (FR-30).
6. **What is deliberately absent** — no evaluation, no score, no notifications, no winner, no PDF: Plans 8–10, and O-5 blocks the AI slice. Every empty state on screen is designed, not broken (spec D2/D3/D6). Say this plainly; a demo audience will otherwise read an intentional empty state as a defect.
7. **Known rough edges** — anything the walkthrough turned up that this plan did not fix, with a line each. An honest list here is worth more than a clean one.

- [ ] **Step 3: Commit**

```bash
git add docs/walkthrough.md
git commit -m "docs: persona-by-persona demo walkthrough (spec §7)"
```

---

## Task 12: Documentation sweep and PR

Every plan updates `handoff.md` §2a on merge, and Plan 6's row is still "In progress" despite PR #11 having landed. Fix the record, then open the PR.

**Files:** `handoff.md`, `docs/superpowers/specs/2026-08-02-slice-2-product-design.md`, `README.md` (only if it lists routes or endpoints)

- [ ] **Step 1: Correct Plan 6's status**

In `handoff.md` §2a, change the Plan 6 row from "⏳ **In progress**" to "✅ **Merged, PR #11**" with its plan and spec paths, matching how the Plan 5 row is written.

- [ ] **Step 2: Update §1 "What exists now"**

- `spec/openapi.yaml` — operation and path counts. Recount, do not estimate:
  ```bash
  rg -c '^      operationId:' spec/openapi.yaml
  rg -c '^  /' spec/openapi.yaml
  ```
- `apps/api/` — the dashboard service and routes; the batched day-service read (ADR-0018).
- `apps/web/` — the three new pages, `lib/ribbon.ts`, the two new primitives, and that every mentor and student destination is now a real link.
- `apps/web/e2e/` — `dashboard-flows.spec.ts`.
- Test totals — take them from the actual run, not from arithmetic on the old numbers:
  ```bash
  pnpm --filter @irp/core test && pnpm --filter @irp/api test && pnpm --filter @irp/web test
  ```
- ADR list — 0018 and 0019, one line each, in §1's "Done → Documentation" ADR paragraph.

- [ ] **Step 3: Update §2a and §3**

- §2a: Plan 7's row to "✅ **Merged, PR #N**" *after* the PR lands (leave it "⏳ In progress" in the branch commit and correct it in the merge, the same way Plan 6's row should have been).
- §3 "Current position": replace the Plan 5/6 narrative with Plan 7's. State plainly what slice 2 now contains and what it does not — no evaluation, no notifications, no winner. Repeat the apply-ready-vs-applied distinction for Deliverable 3; nothing in this plan changes it.
- The spec's §8 decomposition table: mark Plan 7 delivered, and note the two additions this plan made to §4's contract (`today` on `StudentDashboard`; no evaluation field on `StudentCycleSummary`, with the reason).

- [ ] **Step 4: Full verification set**

```bash
export DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'
pnpm install
pnpm generate
pnpm --filter @irp/api exec prisma generate
pnpm --filter @irp/core build
pnpm lint
pnpm typecheck
pnpm spec:lint
pnpm test
AUTH_DEV_BYPASS=false pnpm --filter @irp/web build
pnpm --filter @irp/api db:seed
AUTH_DEV_BYPASS=true pnpm --filter @irp/web e2e
git status --porcelain    # must be empty — no generated file left untracked-and-unignored
```

Every one must pass. `git status --porcelain` being empty is half of the generated-output gate; the other half is CI's `git ls-files` check over the three generated directories, which catches a force-committed copy that a clean tree cannot reveal.

- [ ] **Step 5: Push and open the PR**

```bash
git add handoff.md docs/superpowers/specs
git commit -m "docs: Plan 7 status, handoff refresh, Plan 6 marked merged"
git push -u origin feat/plan-7-dashboards
gh pr create --title "Plan 7 — Dashboards (FR-28, FR-29, FR-30)" --body "..."
```

The PR body names the FRs (FR-28, FR-29, FR-30, with FR-9/FR-12/FR-27/FR-33 exercised), the T-numbers (T-14, T-15), the two ADRs, and the three new endpoints. **CI runs on `pull_request` and pushes to `main` only** — a bare push to the feature branch triggers nothing, so push *and* open the PR or you are reading stale checks.

- [ ] **Step 6: Watch CI, then merge**

```bash
gh pr checks --watch
```

All three timezone legs green, including Playwright on each. Merge, then correct §2a's Plan 7 row to "Merged, PR #N" as Step 3 notes.

---

## Notes for the executing agent

- **One plan, one branch, one PR.** Do not start Plan 8 work here, even if something looks trivially adjacent.
- **If a task finds a defect in this plan's own code, fix the plan at source** and commit the correction alongside the code fix. A plan that has silently diverged from the codebase is worse than no plan.
- **Do not weaken the dev-bypass guards.** Nothing in this plan touches auth; if a task finds itself editing `auth.config.ts`, `proxy.ts`, `instrumentation.ts` or `lib/dev-identity.ts`, stop and re-read CLAUDE.md's four-entry-points section first.
- **O-5, O-6, O-7 stay open.** The only place O-7 shows is `countCycle`'s treatment of absence as accounted-for, and it is marked `// ASSUMPTION: O-7`. Do not resolve it here.
- **Every figure is derived.** If a task finds itself adding a column to store a count, it has taken a wrong turn — spec §3 and ADR-0018 both forbid it.
