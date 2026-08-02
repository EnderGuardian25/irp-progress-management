# Plan 6 — Submission + Review Flows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The full student submission flow (entries, absences, own history) and mentor review flow (batches, roster, transitions, day records, user administration) — spec-first API + services + the web pages that drive them (spec §4, §5, §8; FR-1..FR-21, T-08 full, T-12, T-13).

**Architecture:** Spec-first: every endpoint lands as one task carrying its `spec/openapi.yaml` fragment, its Fastify route, its service logic, and its tests together (a partial spec cannot lint — `no-unused-components`). Repositories keep owning state invariants; a thin service layer owns *time-based request* validation ("is this window open **now**") and cross-repo assembly. The web side stays on the generated `@irp/client` SDK only, with Server Actions for mutations. Three decisions deferred from Plan 5's pre-PR pass open the plan: the repo error contract (Task 1), entry-vs-absence serialisation (Task 2), transfer-day ownership (Task 3).

**Tech Stack:** Fastify 5.10.0 · Prisma 7.9.1 (driver adapter) · ajv 8.20.0 (`ajv/dist/2020`) · `@irp/core` date engine · Next.js 16.2.12 App Router + Server Actions · Tailwind 4.3.3 · Vitest 4.1.10 · Playwright 1.62.0.

**Spec:** `docs/superpowers/specs/2026-08-02-slice-2-product-design.md` §4, §5, §7, §8. Branch: `feat/plan-6-submission-and-review` (already exists).

## Global Constraints

- Pinned versions per CLAUDE.md — do not bump anything.
- `spec/openapi.yaml` is hand-written and changes **before** any handler. `pnpm spec:lint` must pass with zero warnings after every task that touches it. Every operation documents `200`, `400`, `401`, `500` (custom Redocly assertion); role-gated operations add `403`; parameterised paths add `404` where a lookup can miss; conflicting state adds `409`. Request bodies are `additionalProperties: false`; every schema carries `examples`; every parameter carries `description`. Errors are RFC 7807 (`Problem` schema, already in the spec).
- After any spec change: `pnpm generate` (regenerates `@irp/types` + `@irp/client`), then typecheck. Never hand-edit generated packages.
- `apps/web` imports only from `packages/client` for API access — a raw `fetch()` to our own API is a bug. (`@irp/core` for pure date arithmetic is fine and already precedented in `apps/api`.)
- Civil dates cross the API as `type: string, format: date` (`"2026-08-03"`) and cross the DB boundary via `toDbDate`/`fromDbDate`. Instants are UTC `date-time`. All window/deadline decisions go through `@irp/core` — never hand-rolled date math.
- Every DB test creates its own rows in-file (suites `TRUNCATE`; Vitest order is unstable). DB for tests/dev: `postgresql://irp:irp@127.0.0.1:5433/irp?schema=public` (container `apps/api/docker-compose.yml`, `IRP_DB_PORT=5433`); set `$env:DATABASE_URL` for prisma/vitest commands. Docker Desktop must be running.
- Any change touching `apps/web` must pass `pnpm --filter @irp/web build` with `$env:AUTH_DEV_BYPASS='false'` — plain `tsc` is not sufficient (CLAUDE.md, Plan 3).
- Weekdays are required; weekends are optional. A weekend is never late, never missed, never in a compliance denominator. `Submitted → In Review → Evaluated`; **no Rejected state**.
- Students never see scores, ranks, or other students (FR-30): no student-reachable endpoint accepts another student's id.
- Conventional commits ending with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (commit with `git commit -F <file>` when the message contains quotes).
- Windows dev machine: PowerShell 5.1 quirks per CLAUDE.md (no `&&`; `Select-String` is case-insensitive by default).

**Decisions this plan implements (carried from Plan 5's pre-PR pass, recorded in `.superpowers/sdd/progress.md`):**
1. **Repo error contract** (Task 1, ADR-0015): every repository failure a caller can act on is a `DomainError` with a stable `code`, an HTTP `status`, and a `title`; the problem-details plugin maps them centrally. Raw Prisma errors never reach a handler.
2. **Entry-vs-absence mutual exclusion** (Task 2, ADR-0016): a Postgres transaction-scoped advisory lock on `(studentId, date)` serialises the two write paths. Chosen over `SERIALIZABLE`-plus-retry (adds retry machinery for exactly one conflict pair) and over a DB exclusion constraint (would need a synthetic shared table; the invariant spans two tables).
3. **Transfer-day ownership** (Task 3, ADR-0017): **the new batch owns the effective date.** The old enrolment closes at `effectiveDate − 1 day`; enrolment intervals never overlap, so roster membership and (later) compliance denominators are unambiguous by construction.

**Working note for implementers:** run `pnpm generate` once after switching branches (generated packages are git-ignored), and `pnpm --filter @irp/api db:generate` before anything importing the Prisma client. `pnpm --filter @irp/api test` needs `$env:DATABASE_URL` set or DB suites skip.

---

### Task 1: The repo error contract (ADR-0015)

Every repository failure a caller can act on becomes a `DomainError` carrying `code` + `status` + `title`; the problem-details plugin maps any `DomainError` to RFC 7807 centrally. Closes Plan 5's four recorded gaps: batch-repo bare `Error`, `enrol()` raw P2002, `absence.create` raw P2002, `remove()` silent miss.

**Files:**
- Create: `docs/adr/0015-domain-errors-as-the-repo-contract.md`
- Modify: `apps/api/src/domain/errors.ts`
- Modify: `apps/api/src/db/batch-repo.ts`
- Modify: `apps/api/src/db/absence-repo.ts`
- Modify: `apps/api/src/plugins/problem-details.ts`
- Test: `apps/api/test/batch-repo.test.ts`, `apps/api/test/absence-repo.test.ts`, `apps/api/test/problem-details-domain.test.ts` (new)

**Interfaces:**
- Consumes: existing `DomainError` subclasses, `createBatchRepo`, `createAbsenceRepo`, `problemDetailsPlugin`, `Prisma.PrismaClientKnownRequestError` from `apps/api/src/generated/prisma/client.js`.
- Produces (later tasks rely on these exact names): `DomainError` gains `abstract readonly status: number` and `abstract readonly title: string`. New subclasses: `OpenEnrolmentExistsError(studentId: string)` (409), `NoOpenEnrolmentError(studentId: string)` (409), `AbsenceExistsError(date: string)` (409), `AbsenceNotFoundError(date: string)` (404). Existing subclasses gain: `SubmissionWindowClosedError` 400, `LockedDayError` 409, `AbsentDayConflictError` 409, `EntryConflictError` 409, `WeekendAbsenceError` 400. Problem `type` is always `https://irp.bistec.example/problems/<code>`.

- [ ] **Step 1: Write the ADR**

`docs/adr/0015-domain-errors-as-the-repo-contract.md`:

```markdown
# ADR-0015: DomainError subclasses are the repository error contract

## Status
Accepted (2026-08-02). Implements decision 1 of Plan 5's pre-PR pass.

## Context
Plan 5's review recorded four places a repository failure leaks something a
caller cannot act on: `batch-repo.transfer` throws a bare `Error`, `enrol()`
surfaces Prisma's P2002 directly, `absence.create` has the same raw P2002 on
a duplicate, and `absence.remove` succeeds silently when nothing exists.
Plan 6 adds fourteen endpoints that must turn these into RFC 7807 responses.

## Decision
Every repository failure a caller can act on is a `DomainError` subclass
carrying a stable machine-readable `code`, an HTTP `status`, and a human
`title`. The problem-details plugin maps any `DomainError` to
`application/problem+json` centrally: `type` is
`https://irp.bistec.example/problems/<code>`, `detail` is the message.
Handlers and services throw domain errors and never translate them.

## Rejected alternatives
1. **Per-route try/catch translation** — N routes × M errors of mapping code;
   the first forgotten catch leaks a Prisma error shape as a 500.
2. **Reusing the existing `HttpError` hierarchy directly in repos** — couples
   the persistence layer to HTTP vocabulary; the seed (a repo consumer with
   no HTTP context) treats domain errors as seed bugs, which `HttpError`
   would misrepresent as transport concerns.
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/api/test/batch-repo.test.ts` (it already builds its own users/batches in-file — follow the file's existing helpers):

```typescript
it("enrol() maps a second open enrolment to OpenEnrolmentExistsError", async () => {
  // create student + batch via the file's existing helpers, enrol once…
  await expect(repo.enrol(student.id, batch.id, civilDate("2026-06-10")))
    .rejects.toBeInstanceOf(OpenEnrolmentExistsError);
});

it("transfer() without an open enrolment throws NoOpenEnrolmentError", async () => {
  await expect(repo.transfer(freshStudent.id, batch.id, civilDate("2026-06-10")))
    .rejects.toBeInstanceOf(NoOpenEnrolmentError);
});
```

Append to `apps/api/test/absence-repo.test.ts`:

```typescript
it("create() maps a duplicate to AbsenceExistsError", async () => {
  await repo.create({ studentId: s.id, date: monday, reason: "sick" });
  await expect(repo.create({ studentId: s.id, date: monday, reason: "again" }))
    .rejects.toBeInstanceOf(AbsenceExistsError);
});

it("remove() of a nonexistent absence throws AbsenceNotFoundError", async () => {
  await expect(repo.remove(s.id, monday)).rejects.toBeInstanceOf(AbsenceNotFoundError);
});
```

New `apps/api/test/problem-details-domain.test.ts` — a Fastify instance with the tracing + problem-details plugins and one test route that throws a `LockedDayError`; assert the response is 409 `application/problem+json` with `type: "https://irp.bistec.example/problems/day-locked"`, `title: "Day is locked"`, and a `traceId`. Mirror the setup of the existing problem-details test file (find it with `Get-ChildItem apps/api/test` — it registers `tracingPlugin` with an in-memory exporter).

- [ ] **Step 3: Run tests to verify they fail**

Run: `$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'; pnpm --filter @irp/api test`
Expected: FAIL — the new error classes don't exist yet (import errors), the old code paths throw bare `Error`/P2002.

- [ ] **Step 4: Extend `apps/api/src/domain/errors.ts`**

```typescript
/**
 * Domain rule violations — the repository/service error contract (ADR-0015).
 * `code` is stable and machine-readable; `status` and `title` are what the
 * problem-details plugin serialises; the message is the RFC 7807 `detail`.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly status: number;
  abstract readonly title: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class SubmissionWindowClosedError extends DomainError {
  readonly code = "submission-window-closed";
  readonly status = 400;
  readonly title = "Submission window closed";
  constructor(target: string) {
    super(`The submission window for ${target} is closed (FR-14/FR-15).`);
  }
}

export class LockedDayError extends DomainError {
  readonly code = "day-locked";
  readonly status = 409;
  readonly title = "Day is locked";
  constructor(date: string) {
    super(`${date} is Evaluated and locked for the student (FR-20).`);
  }
}

export class AbsentDayConflictError extends DomainError {
  readonly code = "absent-day-conflict";
  readonly status = 409;
  readonly title = "Day is marked absent";
  constructor(date: string) {
    super(`${date} is marked absent — absent and submitted are contradictory.`);
  }
}

export class EntryConflictError extends DomainError {
  readonly code = "entry-conflict";
  readonly status = 409;
  readonly title = "Day already holds entries";
  constructor(date: string) {
    super(`${date} already holds entries — it cannot also be marked absent.`);
  }
}

export class WeekendAbsenceError extends DomainError {
  readonly code = "weekend-absence";
  readonly status = 400;
  readonly title = "Weekends have no absence";
  constructor(date: string) {
    super(`${date} is a weekend — there is nothing to be absent from (FR-16).`);
  }
}

export class OpenEnrolmentExistsError extends DomainError {
  readonly code = "open-enrolment-exists";
  readonly status = 409;
  readonly title = "Student already enrolled";
  constructor(studentId: string) {
    super(`Student ${studentId} already has an open enrolment.`);
  }
}

export class NoOpenEnrolmentError extends DomainError {
  readonly code = "no-open-enrolment";
  readonly status = 409;
  readonly title = "No open enrolment";
  constructor(studentId: string) {
    super(`Student ${studentId} has no open enrolment.`);
  }
}

export class AbsenceExistsError extends DomainError {
  readonly code = "absence-exists";
  readonly status = 409;
  readonly title = "Absence already recorded";
  constructor(date: string) {
    super(`${date} is already marked absent.`);
  }
}

export class AbsenceNotFoundError extends DomainError {
  readonly code = "absence-not-found";
  readonly status = 404;
  readonly title = "No absence recorded";
  constructor(date: string) {
    super(`No absence is recorded for ${date}.`);
  }
}
```

- [ ] **Step 5: Route the repos through the contract**

`apps/api/src/db/batch-repo.ts` — import `OpenEnrolmentExistsError`, `NoOpenEnrolmentError` from `../domain/errors.js` and `Prisma` from `../generated/prisma/client.js`. Add a local P2002 guard and use it in `enrol`; replace the bare `Error` in `transfer`:

```typescript
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// in enrol():
async enrol(studentId, batchId, startDate) {
  try {
    const e = await prisma.enrolment.create({
      data: { studentId, batchId, startDate: toDbDate(startDate) },
    });
    return mapEnrolment(e);
  } catch (err) {
    if (isUniqueViolation(err)) throw new OpenEnrolmentExistsError(studentId);
    throw err;
  }
},

// in transfer(), replace:
//   if (!open) throw new Error(`transfer: student ${studentId} has no open enrolment`);
// with:
if (!open) throw new NoOpenEnrolmentError(studentId);
```

`apps/api/src/db/absence-repo.ts` — same `isUniqueViolation` guard (duplicate it locally; two lines beats a premature shared module). Wrap the `create` insert: catch unique violation → `throw new AbsenceExistsError(input.date)`. In `remove`, `deleteMany` returns `{ count }`: if `count === 0`, `throw new AbsenceNotFoundError(date)`.

- [ ] **Step 6: Map DomainError centrally in `problem-details.ts`**

Import `DomainError` from `../domain/errors.js`. Insert this branch FIRST in the error handler, before the `HttpError` branch:

```typescript
if (err instanceof DomainError) {
  return send(reply, req, {
    type: `https://irp.bistec.example/problems/${err.code}`,
    title: err.title,
    status: err.status,
    detail: err.message,
    instance: req.url,
  });
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'; pnpm --filter @irp/api test`
Expected: PASS, including all pre-existing suites (the seed exercises `transfer`/`enrol` happy paths and must stay green).

- [ ] **Step 8: Commit**

```bash
git add docs/adr/0015-domain-errors-as-the-repo-contract.md apps/api/src/domain/errors.ts apps/api/src/db/batch-repo.ts apps/api/src/db/absence-repo.ts apps/api/src/plugins/problem-details.ts apps/api/test/
git commit -m "feat(api): repo error contract -- DomainError carries code/status/title, mapped centrally (ADR-0015)"
```

---

### Task 2: Entry-vs-absence mutual exclusion via advisory lock (ADR-0016)

Two concurrent requests can currently create an entry AND an absence for the same student-day: both check-then-write paths read under READ COMMITTED. A transaction-scoped advisory lock on `(studentId, date)` serialises them.

**Files:**
- Create: `docs/adr/0016-advisory-lock-for-student-day-writes.md`
- Create: `apps/api/src/db/day-lock.ts`
- Modify: `apps/api/src/db/entry-repo.ts` (inside the `addEntry` transaction)
- Modify: `apps/api/src/db/absence-repo.ts` (wrap `create` in a transaction with the lock)
- Test: `apps/api/test/day-lock.test.ts` (new)

**Interfaces:**
- Consumes: `Prisma.TransactionClient` type from `../generated/prisma/client.js`, `CivilDate`.
- Produces: `lockStudentDay(tx: Prisma.TransactionClient, studentId: string, date: CivilDate): Promise<void>` — must be the FIRST await inside any transaction that writes an Entry, DailyReport, or AbsenceRecord for a student-day.

- [ ] **Step 1: Write the ADR**

`docs/adr/0016-advisory-lock-for-student-day-writes.md`:

```markdown
# ADR-0016: Transaction-scoped advisory locks serialise student-day writes

## Status
Accepted (2026-08-02). Implements decision 2 of Plan 5's pre-PR pass.

## Context
"A day cannot hold both entries and an absence" spans two tables, so no
unique index can express it. Both write paths are check-then-write; under
READ COMMITTED two concurrent requests can each pass the check and both
commit (Plan 5 final review).

## Decision
`pg_advisory_xact_lock(hashtextextended(studentId || ':' || date, 0))` as the
first statement of both transactions. The lock is per student-day, held to
commit/rollback, and cannot be leaked (xact-scoped). Whichever transaction
wins, the loser re-runs its check after the lock clears and throws the
correct DomainError.

## Rejected alternatives
1. **SERIALIZABLE + retry-on-40001** — correct but general-purpose machinery
   (retry loops, error classification) for exactly one conflict pair; every
   other write in the system is single-row and does not need it.
2. **A DB-level exclusion constraint via a shared "day claim" table** — makes
   the invariant declarative but adds a table whose only purpose is locking,
   plus insert/delete bookkeeping on every entry and absence write.
```

- [ ] **Step 2: Write `apps/api/src/db/day-lock.ts`**

```typescript
import type { CivilDate } from "@irp/core";
import type { Prisma } from "../generated/prisma/client.js";

/**
 * Serialise all writes for one student-day (ADR-0016). MUST be the first
 * await inside any transaction writing Entry / DailyReport / AbsenceRecord
 * for a (studentId, date) pair — the check-then-write bodies of those
 * transactions are only correct because this lock makes them mutually
 * exclusive. Transaction-scoped: released automatically at commit/rollback.
 */
export async function lockStudentDay(
  tx: Prisma.TransactionClient,
  studentId: string,
  date: CivilDate,
): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${studentId}:${date}`}, 0))`;
}
```

- [ ] **Step 3: Take the lock in both write paths**

`apps/api/src/db/entry-repo.ts`, inside `addEntry`'s `prisma.$transaction(async (tx) => {`, as the first statement:

```typescript
await lockStudentDay(tx, input.studentId, input.entryDate);
```

`apps/api/src/db/absence-repo.ts` — `create` currently runs its guards on `prisma` directly. Wrap the whole body in a transaction and lock first:

```typescript
async create(input) {
  if (!isWeekday(input.date)) throw new WeekendAbsenceError(input.date);
  return prisma.$transaction(async (tx) => {
    await lockStudentDay(tx, input.studentId, input.date);
    await assertNotLocked(tx, input.studentId, input.date);
    // …existing entry-existence guard and insert, all via tx…
  });
},
```

Keep the existing guard order (weekend → locked → entries-exist → insert); only the client changes from `prisma` to `tx`.

- [ ] **Step 4: Write the concurrency test**

`apps/api/test/day-lock.test.ts` — in-file rows, `// @vitest-environment node` not needed (no jose). For 20 rounds: fire `entryRepo.addEntry` and `absenceRepo.create` for the same fresh student-day with `Promise.allSettled`, then assert the invariant — never both:

```typescript
const [entries, absences] = await Promise.all([
  prisma.entry.count({ where: { studentId: s.id, entryDate: toDbDate(day) } }),
  prisma.absenceRecord.count({ where: { studentId: s.id, date: toDbDate(day) } }),
]);
expect(entries > 0 && absences > 0).toBe(false);
// and exactly one of the two settled results is rejected OR both raced to
// different outcomes — at least one must have succeeded:
expect(entries + absences).toBeGreaterThan(0);
```

Use a weekday inside the current submission window for `day` (compute with `submissionWindow(new Date()).targetDates` and pick the first weekday via `isWeekday`; skip absence rounds when today is a weekend by picking the previous weekday — `previousWeekday(toProgrammeDate(new Date()))` is always a legal absence-free weekday target if unused).

- [ ] **Step 5: Run tests**

Run: `$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'; pnpm --filter @irp/api test`
Expected: PASS. (Before the lock, the race test may pass by luck — run the new file alone 3× to gain confidence: `pnpm --filter @irp/api exec vitest run test/day-lock.test.ts` — and note in the task report that the test is probabilistic-by-nature; the lock is verified primarily by inspection of the transaction bodies.)

- [ ] **Step 6: Commit**

```bash
git add docs/adr/0016-advisory-lock-for-student-day-writes.md apps/api/src/db/ apps/api/test/day-lock.test.ts
git commit -m "feat(api): advisory lock serialises entry-vs-absence writes per student-day (ADR-0016)"
```

---

### Task 3: Transfer-day ownership — the new batch owns the effective date (ADR-0017)

Plan 5 left both enrolments containing the effective date. Before any roster/compliance arithmetic, close the old enrolment at `effectiveDate − 1`.

**Files:**
- Create: `docs/adr/0017-transfer-day-belongs-to-the-new-batch.md`
- Modify: `apps/api/src/db/batch-repo.ts` (`transfer`)
- Modify: `apps/api/src/domain/errors.ts` (add `InvalidTransferDateError`)
- Modify: `docs/superpowers/specs/2026-08-02-slice-2-product-design.md` (§4 correction note)
- Test: `apps/api/test/batch-repo.test.ts`

**Interfaces:**
- Consumes: `addDays`, `compareDates` from `@irp/core`; `NoOpenEnrolmentError` from Task 1.
- Produces: `transfer(studentId, toBatchId, effectiveDate)` now guarantees `old.endDate === addDays(effectiveDate, -1)`; throws `InvalidTransferDateError` (400, code `invalid-transfer-date`) when `effectiveDate <= open.startDate`.

- [ ] **Step 1: Write the ADR**

`docs/adr/0017-transfer-day-belongs-to-the-new-batch.md`:

```markdown
# ADR-0017: The transfer day belongs to the new batch

## Status
Accepted (2026-08-02). Implements decision 3 of Plan 5's pre-PR pass.

## Context
`transfer()` closed the old enrolment AT the effective date and opened the
new one ON it, so both enrolments contained that day. Harmless while nothing
counted per-batch; Plan 6's roster and Plan 7's compliance denominators make
the overlap a double-count.

## Decision
The old enrolment's endDate becomes `effectiveDate − 1 day`; the new
enrolment starts on `effectiveDate`. Enrolment intervals are disjoint by
construction, so "which batch owns this day" is a lookup, not a rule every
query must re-implement. An `effectiveDate` on or before the open
enrolment's start is rejected (400) — it would produce an empty or negative
interval.

## Rejected alternatives
1. **Old batch keeps the day** (new starts at +1): the student's submission
   on transfer day would be reviewed by the batch they are leaving; the
   stakeholder framing is "starts with the new batch on the effective date".
2. **Keep the overlap, resolve at query time**: every roster/compliance
   query carries a tie-break clause forever, and the first one that forgets
   double-counts silently.
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/api/test/batch-repo.test.ts`:

```typescript
it("transfer closes the old enrolment the day BEFORE the effective date (ADR-0017)", async () => {
  // enrol into A on 2026-05-10, transfer to B effective 2026-06-15
  const next = await repo.transfer(s.id, batchB.id, civilDate("2026-06-15"));
  const rows = await prisma.enrolment.findMany({
    where: { studentId: s.id }, orderBy: { startDate: "asc" },
  });
  expect(fromDbDate(rows[0]!.endDate!)).toBe("2026-06-14");
  expect(next.startDate).toBe("2026-06-15");
});

it("transfer on/before the open enrolment's start is rejected", async () => {
  // enrolment starts 2026-05-10
  await expect(repo.transfer(s2.id, batchB.id, civilDate("2026-05-10")))
    .rejects.toBeInstanceOf(InvalidTransferDateError);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'; pnpm --filter @irp/api exec vitest run test/batch-repo.test.ts`
Expected: FAIL — endDate equals the effective date; `InvalidTransferDateError` doesn't exist.

- [ ] **Step 4: Implement**

`apps/api/src/domain/errors.ts`:

```typescript
export class InvalidTransferDateError extends DomainError {
  readonly code = "invalid-transfer-date";
  readonly status = 400;
  readonly title = "Invalid transfer date";
  constructor(effectiveDate: string) {
    super(`Transfer effective ${effectiveDate} would not leave the previous enrolment a single day.`);
  }
}
```

`apps/api/src/db/batch-repo.ts` `transfer` — import `addDays`, `compareDates` from `@irp/core` and the new error:

```typescript
async transfer(studentId, toBatchId, effectiveDate) {
  return prisma.$transaction(async (tx) => {
    const open = await tx.enrolment.findFirst({ where: { studentId, endDate: null } });
    if (!open) throw new NoOpenEnrolmentError(studentId);
    if (compareDates(effectiveDate, fromDbDate(open.startDate)) <= 0) {
      throw new InvalidTransferDateError(effectiveDate);
    }
    await tx.enrolment.update({
      where: { id: open.id },
      // ADR-0017: the new batch owns the effective date.
      data: { endDate: toDbDate(addDays(effectiveDate, -1)) },
    });
    const next = await tx.enrolment.create({
      data: { studentId, batchId: toBatchId, startDate: toDbDate(effectiveDate) },
    });
    return mapEnrolment(next);
  });
},
```

- [ ] **Step 5: Amend the spec at source**

In `docs/superpowers/specs/2026-08-02-slice-2-product-design.md` §4, in the row for `POST /students/{id}/transfer`, append to the behaviour cell: `Effective-date ownership: the NEW batch owns the effective date; the old enrolment closes the day before (ADR-0017). 400 if the effective date is on/before the open enrolment's start.` — keep the table formatting intact.

- [ ] **Step 6: Run the full API suite (the seed's transfer persona is affected)**

Run: `$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'; pnpm --filter @irp/api test`
Expected: PASS. If `seed.test.ts` asserts the transfer persona's old-enrolment end date equals the effective date, update that assertion to `− 1 day` in the same commit — that is this decision landing, not a regression. Then re-seed the dev DB: `pnpm --filter @irp/api run db:seed`.

- [ ] **Step 7: Commit**

```bash
git add docs/adr/0017-transfer-day-belongs-to-the-new-batch.md apps/api/src/ apps/api/test/batch-repo.test.ts docs/superpowers/specs/2026-08-02-slice-2-product-design.md
git commit -m "feat(api): transfer day belongs to the new batch -- disjoint enrolment intervals (ADR-0017)"
```

---
### Task 4: `POST /api/v1/entries` — submit an entry

First endpoint task; establishes the pattern every later endpoint task repeats: spec fragment → `pnpm generate` → route schema mirroring the spec → service call → integration tests.

**Files:**
- Modify: `spec/openapi.yaml` (tag `Submissions`; schemas `Entry`, `EntryCreate`; shared response `Conflict`; path `/api/v1/entries`)
- Create: `apps/api/src/routes/entries.ts`
- Create: `apps/api/src/routes/schemas.ts` (route-level JSON Schemas, one module for the whole plan)
- Modify: `apps/api/src/server.ts`, `apps/api/src/index.ts` (wire `entryRepo` into `ServerDeps` and register the route)
- Test: `apps/api/test/entries-endpoint.test.ts`

**Interfaces:**
- Consumes: `createEntryRepo` (Plan 5), `decideEntryFlags` (transitively — the repo calls it), `app.authenticate` + `req.user` (auth plugin), the Task 1 error mapping.
- Produces: `ServerDeps` gains `entryRepo: EntryRepo`. Route `POST /api/v1/entries`, operationId `createEntry`, STUDENT-only (Admins get 403 — an Admin has no enrolment to submit against). Response shape (200): `{ id, entryDate, body, submittedAt, isLate, isExtra }`. `apps/api/src/routes/schemas.ts` exports `ENTRY_CREATE_BODY` (JSON Schema 2020-12 object). Also produces the `requireStudent` helper other student endpoints reuse: exported from `entries.ts` as a plain function.

- [ ] **Step 1: Spec first — add to `spec/openapi.yaml`**

Add to `tags`:

```yaml
  - name: Submissions
    description: Student daily entries and their rolled-up day view.
```

Add path (all `$ref` responses already exist except `Conflict` — added below):

```yaml
  /api/v1/entries:
    post:
      operationId: createEntry
      summary: Submit a daily entry
      description: |
        Creates one text entry for a target date the submission window
        currently allows (FR-15: today or the previous weekday, weekends
        included as optional Extra days — FR-33). The server computes
        `isLate`/`isExtra` at the submission instant and creates the day's
        DailyReport on first entry. Multiple entries per day are allowed.

        Only students submit entries; a mentor token receives 403.
      tags: [Submissions]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/EntryCreate'
      responses:
        '200':
          description: The stored entry, with server-computed flags.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Entry'
              examples:
                onTime:
                  summary: Submitted on the target day
                  value:
                    id: 7be9f1d2-3c44-4f8a-9a01-2b3c4d5e6f70
                    entryDate: '2026-08-03'
                    body: Implemented the roster endpoint and its tests.
                    submittedAt: '2026-08-03T11:30:00.000Z'
                    isLate: false
                    isExtra: false
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'
        '500':
          $ref: '#/components/responses/InternalServerError'
```

Add schemas:

```yaml
    EntryCreate:
      type: object
      title: EntryCreate
      description: A new daily entry. Text only — attachments are a confirmed non-goal.
      required: [entryDate, body]
      additionalProperties: false
      properties:
        entryDate:
          type: string
          format: date
          description: The civil date (Asia/Colombo) this entry is for. Must be inside the caller's current submission window.
          examples:
            - '2026-08-03'
        body:
          type: string
          minLength: 1
          maxLength: 4000
          description: What was worked on. Plain text.
          examples:
            - Implemented the roster endpoint and its tests.

    Entry:
      type: object
      title: Entry
      description: One stored entry with server-computed flags.
      required: [id, entryDate, body, submittedAt, isLate, isExtra]
      additionalProperties: false
      properties:
        id:
          type: string
          format: uuid
          description: Entry identifier.
          examples:
            - 7be9f1d2-3c44-4f8a-9a01-2b3c4d5e6f70
        entryDate:
          type: string
          format: date
          description: The civil date the entry targets.
          examples:
            - '2026-08-03'
        body:
          type: string
          description: The submitted text.
          examples:
            - Implemented the roster endpoint and its tests.
        submittedAt:
          type: string
          format: date-time
          description: UTC instant the entry was accepted.
          examples:
            - '2026-08-03T11:30:00.000Z'
        isLate:
          type: boolean
          description: True when a required day's entry arrived after that day ended but inside grace. Weekends are never late.
          examples:
            - false
        isExtra:
          type: boolean
          description: True for entries on optional (weekend) days — FR-33.
          examples:
            - false
```

Add shared response (under `components.responses`):

```yaml
    Conflict:
      description: The request is valid but conflicts with the day's current state — locked (Evaluated), marked absent, or already holding contradictory records.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/Problem'
          examples:
            lockedDay:
              summary: The day is Evaluated and locked
              value:
                type: https://irp.bistec.example/problems/day-locked
                title: Day is locked
                status: 409
                detail: 2026-08-03 is Evaluated and locked for the student (FR-20).
                instance: /api/v1/entries
                traceId: 4bf92f3577b34da6a3ce929d0e0e4736
```

- [ ] **Step 2: Lint the spec and regenerate**

Run: `pnpm spec:lint` — Expected: zero errors, zero warnings.
Run: `pnpm generate` — Expected: `@irp/types` + `@irp/client` regenerate; `createEntry` appears in `packages/client`.

- [ ] **Step 3: Write the failing integration tests**

`apps/api/test/entries-endpoint.test.ts` — build a real server via `buildServer` with the real repos against the test DB, mint tokens the way the existing auth integration tests do (copy the local-JWKS helper setup from the existing `me` endpoint test file — find it via `Select-String -Path apps/api/test/*.ts -Pattern "buildServer"`). Cases, all through `app.inject`:

```typescript
it("stores an on-time entry for today with both flags false", async () => { /* 200, isLate false, isExtra false or true if today is a weekend — compute expectation with isWeekday(toProgrammeDate(new Date())) */ });
it("flags a previous-weekday entry late when that day has ended", async () => { /* target previousWeekday(today); expected isLate = true only when today's date differs from target — guard with an if and assert the flag the engine dictates */ });
it("rejects a date outside the window with 400 submission-window-closed", async () => { /* entryDate far in the past, expect 400 + problem type */ });
it("rejects an entry on an absent day with 409 absent-day-conflict", async () => {});
it("rejects an entry on an Evaluated day with 409 day-locked", async () => { /* create report, set status EVALUATED via prisma, then POST */ });
it("rejects unknown body properties with 400", async () => { /* body: { entryDate, body, extra: 1 } */ });
it("rejects a mentor token with 403", async () => {});
it("rejects an unauthenticated request with 401", async () => {});
```

Every case asserts `content-type: application/problem+json` on errors and the exact `type` URI.

- [ ] **Step 4: Run tests to verify they fail**

Run: `$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'; pnpm --filter @irp/api exec vitest run test/entries-endpoint.test.ts`
Expected: FAIL — route does not exist (404s).

- [ ] **Step 5: Implement the route**

`apps/api/src/routes/schemas.ts`:

```typescript
/**
 * Route-level JSON Schemas (2020-12), mirroring spec/openapi.yaml request
 * shapes. The spec is the source of truth; these literals exist because
 * Fastify validates per-route and the generated packages export TypeScript
 * types, not JSON Schema. A mismatch here is a bug — fix the spec first,
 * then this mirror. Keep additionalProperties: false on every body.
 */
export const ENTRY_CREATE_BODY = {
  type: "object",
  required: ["entryDate", "body"],
  additionalProperties: false,
  properties: {
    entryDate: { type: "string", format: "date" },
    body: { type: "string", minLength: 1, maxLength: 4000 },
  },
} as const;
```

`apps/api/src/routes/entries.ts`:

```typescript
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { civilDate } from "@irp/core";
import type { components } from "@irp/types";
import type { EntryRepo, EntryRecord } from "../db/entry-repo.js";
import { HttpError } from "../errors.js";
import { ENTRY_CREATE_BODY } from "./schemas.js";

type ApiEntry = components["schemas"]["Entry"];

/** Student-only endpoints: an Admin has no enrolment to act against. */
export function requireStudent(req: FastifyRequest): void {
  if (req.user?.role !== "STUDENT") {
    throw new HttpError(
      403,
      "https://irp.bistec.example/problems/students-only",
      "Students only",
      "This action belongs to students; mentors use the review endpoints.",
    );
  }
}

export function toApiEntry(e: EntryRecord): ApiEntry {
  return {
    id: e.id,
    entryDate: e.entryDate,
    body: e.body,
    submittedAt: e.submittedAt.toISOString(),
    isLate: e.isLate,
    isExtra: e.isExtra,
  };
}

// eslint-disable-next-line @typescript-eslint/require-await
export const entryRoutes: FastifyPluginAsync<{ entryRepo: EntryRepo }> = async (app, opts) => {
  app.post<{ Body: components["schemas"]["EntryCreate"] }>(
    "/api/v1/entries",
    { schema: { body: ENTRY_CREATE_BODY }, preHandler: [app.authenticate] },
    async (req): Promise<ApiEntry> => {
      requireStudent(req);
      const entry = await opts.entryRepo.addEntry({
        studentId: req.user!.id,
        entryDate: civilDate(req.body.entryDate),
        body: req.body.body,
        submittedAt: new Date(),
      });
      return toApiEntry(entry);
    },
  );
};
```

`apps/api/src/server.ts` — add `entryRepo: EntryRepo` to `ServerDeps`; register after `meRoutes`:

```typescript
await app.register(entryRoutes, { entryRepo: deps.entryRepo });
```

`apps/api/src/index.ts` — `const entryRepo = createEntryRepo(prisma);` and pass it to `buildServer`. Any existing test that constructs `buildServer` with a literal `ServerDeps` gains the new field — give those tests the real repo over the test prisma client, or a stub `{ addEntry: () => { throw new Error("unused"); }, … }` where the file has no DB.

- [ ] **Step 6: Run tests to verify they pass**

Run: `$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'; pnpm --filter @irp/api test`
Expected: PASS (whole suite — server-construction changes touch other files).

- [ ] **Step 7: Commit**

```bash
git add spec/openapi.yaml apps/api/src/ apps/api/test/entries-endpoint.test.ts
git commit -m "feat(api): POST /api/v1/entries -- window-validated submission with server-computed flags (FR-10..FR-15, FR-33)"
```

---

### Task 5: The day service + `GET /api/v1/me/days`

The rolled-up day view: per date — entries, report status, and the server-computed classification. This service is reused verbatim by the mentor's `GET /students/{id}/days` (Task 8) and the roster (Task 7).

**Files:**
- Modify: `spec/openapi.yaml` (schemas `DaySummary`, `DayStatus`, `ReportStatus`; path `/api/v1/me/days`)
- Modify: `apps/api/src/db/entry-repo.ts` (add `listReports`; add `reportId` plumbing)
- Create: `apps/api/src/services/day-service.ts`
- Create: `apps/api/src/routes/me-days.ts`
- Modify: `apps/api/src/server.ts`, `apps/api/src/index.ts`
- Test: `apps/api/test/day-service.test.ts`, `apps/api/test/me-days-endpoint.test.ts`

**Interfaces:**
- Consumes: `classifyDay`, `DayFacts`, `DayStatus`, `addDays`, `compareDates`, `cycleContaining`, `toProgrammeDate` from `@irp/core`; `EntryRepo`, `AbsenceRepo`.
- Produces:
  - `EntryRepo` gains `listReports(studentId: string, from: CivilDate, to: CivilDate): Promise<DailyReportRecord[]>`; `DailyReportRecord` (already exported) is unchanged.
  - `apps/api/src/services/day-service.ts` exports:
    ```typescript
    interface DayView {
      date: CivilDate;
      status: DayStatus;                       // from @irp/core
      reportId: string | null;
      reportStatus: DailyReportStatus | null;  // generated Prisma enum
      absenceReason: string | null;
      entries: EntryRecord[];
    }
    interface DayService {
      listDays(studentId: string, from: CivilDate, to: CivilDate, now: Date): Promise<DayView[]>;
    }
    function createDayService(deps: { entryRepo: EntryRepo; absenceRepo: AbsenceRepo }): DayService
    ```
  - Route `GET /api/v1/me/days?from&to`, operationId `listMyDays`, any authenticated registered user (a mentor gets an empty list — no enrolment days). Defaults to the current calendar cycle (`cycleContaining(toProgrammeDate(now))`). Range longer than 92 days → 400 (`HttpError`, type `…/problems/range-too-wide`, title `Range too wide`).
  - API mapping (later tasks reuse): `REPORT_STATUS_TO_API: Record<DailyReportStatus, "Submitted" | "InReview" | "Evaluated">` exported from `me-days.ts`.

- [ ] **Step 1: Spec first**

Path:

```yaml
  /api/v1/me/days:
    get:
      operationId: listMyDays
      summary: My rolled-up day history
      description: |
        One element per calendar day in the range, oldest first: the caller's
        entries for that day, the review status of the day's report, and the
        server-computed classification. Weekends appear with status `extra`
        (work recorded) or `none` (nothing) — never late or missed (FR-33).

        Defaults to the current evaluation cycle (the 10th of the month to
        the 9th of the next, Asia/Colombo) when `from`/`to` are omitted.
      tags: [Submissions]
      parameters:
        - name: from
          in: query
          required: false
          description: First day of the range (inclusive). Defaults to the current cycle's start.
          schema:
            type: string
            format: date
            examples:
              - '2026-07-10'
        - name: to
          in: query
          required: false
          description: Last day of the range (inclusive). Defaults to the current cycle's end. Ranges over 92 days are rejected.
          schema:
            type: string
            format: date
            examples:
              - '2026-08-09'
      responses:
        '200':
          description: The day-by-day view, oldest first.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/DaySummary'
              examples:
                twoDays:
                  summary: A submitted weekday and an untouched weekend day
                  value:
                    - date: '2026-07-31'
                      status: onTime
                      reportStatus: Submitted
                      reportId: 5a3c2b1d-0e9f-4a8b-b7c6-d5e4f3a2b1c0
                      absenceReason: null
                      entries:
                        - id: 7be9f1d2-3c44-4f8a-9a01-2b3c4d5e6f70
                          entryDate: '2026-07-31'
                          body: Wrote the cycle materialisation tests.
                          submittedAt: '2026-07-31T10:05:00.000Z'
                          isLate: false
                          isExtra: false
                    - date: '2026-08-01'
                      status: none
                      reportStatus: null
                      reportId: null
                      absenceReason: null
                      entries: []
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '500':
          $ref: '#/components/responses/InternalServerError'
```

Schemas:

```yaml
    DayStatus:
      type: string
      title: DayStatus
      enum: [onTime, late, absent, missed, pending, extra, none, future]
      description: |
        Server-computed classification of one day. Required days (weekdays)
        resolve to onTime/late/absent/missed/pending; optional days
        (weekends) resolve to extra/none and are never late or missed.
        `pending` means the grace window is still open; `future` days have
        not arrived. There is no rejected state.
      examples:
        - onTime

    ReportStatus:
      type: string
      title: ReportStatus
      enum: [Submitted, InReview, Evaluated]
      description: Review state of one day's rolled-up report (FR-18/FR-20). Forward-only; Evaluated locks the day.
      examples:
        - Submitted

    DaySummary:
      type: object
      title: DaySummary
      description: Everything on record for one student and one calendar day.
      required: [date, status, reportStatus, reportId, absenceReason, entries]
      additionalProperties: false
      properties:
        date:
          type: string
          format: date
          description: The civil date (Asia/Colombo).
          examples:
            - '2026-07-31'
        status:
          $ref: '#/components/schemas/DayStatus'
        reportStatus:
          oneOf:
            - $ref: '#/components/schemas/ReportStatus'
            - type: 'null'
          description: Review state of the day's report, or null when no entry has created one.
        reportId:
          oneOf:
            - type: string
              format: uuid
            - type: 'null'
          description: The DailyReport id, used by mentors to transition review state. Null until a first entry exists.
          examples:
            - 5a3c2b1d-0e9f-4a8b-b7c6-d5e4f3a2b1c0
        absenceReason:
          oneOf:
            - type: string
            - type: 'null'
          description: The recorded absence reason, when the day is marked absent.
          examples:
            - medical appointment
        entries:
          type: array
          description: The day's entries, earliest first. Empty when nothing was submitted.
          items:
            $ref: '#/components/schemas/Entry'
```

Run: `pnpm spec:lint` (zero warnings) then `pnpm generate`.

- [ ] **Step 2: Write the failing service tests**

`apps/api/test/day-service.test.ts` — real repos on the test DB. Build one student with, across a fixed historical week (use dates ≥ 60 days back so grace is closed, created via the repos with historical `submittedAt` instants like the seed does): an on-time day, a late day, an absent day, a silent weekday (→ `missed`), a weekend entry (→ `extra`), a silent weekend (→ `none`), plus assert today+1 → `future` and a silent today → `pending`/`missed` per the engine (compute the expectation with `graceDeadlineFor`). Assert `reportId`/`reportStatus` are non-null exactly on entry days and `absenceReason` only on the absent day, and elements come back oldest-first, one per calendar day.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @irp/api exec vitest run test/day-service.test.ts` (with `$env:DATABASE_URL` set)
Expected: FAIL — `createDayService` does not exist.

- [ ] **Step 4: Implement**

`apps/api/src/db/entry-repo.ts` — add to the interface and implementation:

```typescript
// interface EntryRepo:
listReports(studentId: string, from: CivilDate, to: CivilDate): Promise<DailyReportRecord[]>;

// implementation:
async listReports(studentId, from, to) {
  const rows = await prisma.dailyReport.findMany({
    where: { studentId, reportDate: { gte: toDbDate(from), lte: toDbDate(to) } },
    orderBy: { reportDate: "asc" },
  });
  return rows.map((r) => ({
    id: r.id, studentId: r.studentId, reportDate: fromDbDate(r.reportDate), status: r.status,
  }));
},
```

`apps/api/src/services/day-service.ts`:

```typescript
import {
  addDays, classifyDay, compareDates,
  type CivilDate, type DayStatus,
} from "@irp/core";
import type { AbsenceRepo } from "../db/absence-repo.js";
import type { EntryRepo, EntryRecord } from "../db/entry-repo.js";
import type { DailyReportStatus } from "../generated/prisma/client.js";

export interface DayView {
  date: CivilDate;
  status: DayStatus;
  reportId: string | null;
  reportStatus: DailyReportStatus | null;
  absenceReason: string | null;
  entries: EntryRecord[];
}

export interface DayService {
  listDays(studentId: string, from: CivilDate, to: CivilDate, now: Date): Promise<DayView[]>;
}

/**
 * Assembles the per-day view the student history, mentor review, and roster
 * all read. Classification is the ENGINE's (classifyDay) — this service only
 * gathers facts; it never re-decides late/extra/missed.
 */
export function createDayService(deps: {
  entryRepo: EntryRepo;
  absenceRepo: AbsenceRepo;
}): DayService {
  return {
    async listDays(studentId, from, to, now) {
      const [entries, absences, reports] = await Promise.all([
        deps.entryRepo.listEntries(studentId, from, to),
        deps.absenceRepo.listForStudent(studentId, from, to),
        deps.entryRepo.listReports(studentId, from, to),
      ]);
      const entriesByDate = new Map<CivilDate, EntryRecord[]>();
      for (const e of entries) {
        const bucket = entriesByDate.get(e.entryDate) ?? [];
        bucket.push(e);
        entriesByDate.set(e.entryDate, bucket);
      }
      const absenceByDate = new Map(absences.map((a) => [a.date, a.reason]));
      const reportByDate = new Map(reports.map((r) => [r.reportDate, r]));

      const days: DayView[] = [];
      for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) {
        const dayEntries = entriesByDate.get(d) ?? [];
        const first = dayEntries[0]; // listEntries orders submittedAt asc within a date
        const report = reportByDate.get(d) ?? null;
        const absenceReason = absenceByDate.get(d) ?? null;
        const status = classifyDay(
          d,
          first !== undefined
            ? { hasEntry: true, firstEntryAt: first.submittedAt, hasAbsence: absenceReason !== null }
            : { hasEntry: false, firstEntryAt: null, hasAbsence: absenceReason !== null },
          now,
        );
        days.push({
          date: d,
          status,
          reportId: report?.id ?? null,
          reportStatus: report?.status ?? null,
          absenceReason,
          entries: dayEntries,
        });
      }
      return days;
    },
  };
}
```

`apps/api/src/routes/me-days.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import {
  civilDate, cycleContaining, toProgrammeDate, workingDaysBetween,
  addDays, compareDates,
} from "@irp/core";
import type { components } from "@irp/types";
import type { DayService, DayView } from "../services/day-service.js";
import type { DailyReportStatus } from "../generated/prisma/client.js";
import { HttpError } from "../errors.js";
import { toApiEntry } from "./entries.js";

type ApiDaySummary = components["schemas"]["DaySummary"];

export const REPORT_STATUS_TO_API: Record<
  DailyReportStatus,
  "Submitted" | "InReview" | "Evaluated"
> = { SUBMITTED: "Submitted", IN_REVIEW: "InReview", EVALUATED: "Evaluated" };

export function toApiDay(v: DayView): ApiDaySummary {
  return {
    date: v.date,
    status: v.status,
    reportId: v.reportId,
    reportStatus: v.reportStatus === null ? null : REPORT_STATUS_TO_API[v.reportStatus],
    absenceReason: v.absenceReason,
    entries: v.entries.map(toApiEntry),
  };
}

const MAX_RANGE_DAYS = 92;

export function resolveRange(from?: string, to?: string, now = new Date()) {
  const cycle = cycleContaining(toProgrammeDate(now));
  const f = from === undefined ? cycle.start : civilDate(from);
  const t = to === undefined ? cycle.end : civilDate(to);
  if (compareDates(f, t) > 0) {
    throw new HttpError(400, "https://irp.bistec.example/problems/range-too-wide",
      "Range too wide", "`from` is after `to`.");
  }
  let width = 0;
  for (let d = f; compareDates(d, t) <= 0 && width <= MAX_RANGE_DAYS; d = addDays(d, 1)) width++;
  if (width > MAX_RANGE_DAYS) {
    throw new HttpError(400, "https://irp.bistec.example/problems/range-too-wide",
      "Range too wide", `The range may not exceed ${MAX_RANGE_DAYS} days.`);
  }
  return { from: f, to: t };
}

const DAYS_QUERY = {
  type: "object",
  additionalProperties: false,
  properties: {
    from: { type: "string", format: "date" },
    to: { type: "string", format: "date" },
  },
} as const;

// eslint-disable-next-line @typescript-eslint/require-await
export const meDaysRoutes: FastifyPluginAsync<{ dayService: DayService }> = async (app, opts) => {
  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/v1/me/days",
    { schema: { querystring: DAYS_QUERY }, preHandler: [app.authenticate] },
    async (req): Promise<ApiDaySummary[]> => {
      const now = new Date();
      const { from, to } = resolveRange(req.query.from, req.query.to, now);
      const days = await opts.dayService.listDays(req.user!.id, from, to, now);
      return days.map(toApiDay);
    },
  );
};
```

(`workingDaysBetween` is imported only if used — drop unused imports; lint is type-aware and will flag them.)

Wire in `server.ts` (`dayService: DayService` on `ServerDeps`, register `meDaysRoutes`) and `index.ts` (`createDayService({ entryRepo, absenceRepo })` — `absenceRepo` is constructed here from Task 6's wiring; if Task 6 has not run yet, construct it now: `const absenceRepo = createAbsenceRepo(prisma);` — it exists since Plan 5).

- [ ] **Step 5: Endpoint tests**

`apps/api/test/me-days-endpoint.test.ts`: 200 happy (seed-style rows created in-file, assert shape + `reportStatus: "Submitted"` mapping), default range equals current cycle bounds, explicit range respected, >92 days → 400 `range-too-wide`, `from > to` → 400, unknown query property → 400, unauthenticated → 401.

- [ ] **Step 6: Run the whole API suite, verify green, commit**

```bash
git add spec/openapi.yaml apps/api/
git commit -m "feat(api): day service + GET /api/v1/me/days -- engine-classified day history (FR-14, FR-29 groundwork)"
```

---

### Task 6: Absence endpoints — `POST /api/v1/absences`, `DELETE /api/v1/absences/{date}`

**Files:**
- Modify: `spec/openapi.yaml` (tag `Absences`; schemas `Absence`, `AbsenceCreate`; shared response `NotFound`; two paths)
- Create: `apps/api/src/routes/absences.ts`
- Modify: `apps/api/src/domain/errors.ts` (add `AbsenceWindowClosedError`)
- Modify: `apps/api/src/routes/schemas.ts`, `apps/api/src/server.ts`, `apps/api/src/index.ts`
- Test: `apps/api/test/absences-endpoint.test.ts`

**Interfaces:**
- Consumes: `AbsenceRepo` (Task 1/2 versions), `requireStudent` (Task 4), `canSubmitFor` from `@irp/core`, `EntryRepo.getReport`.
- Produces: operations `createAbsence` / `deleteAbsence`; `AbsenceWindowClosedError` (400, code `absence-window-closed`). Time rule, stated once: **an absence can be created or removed exactly while the day is still inside its submission window** (`canSubmitFor(date, now)`) **and the day is not locked** — past-final days are history, not editable state.

- [ ] **Step 1: Spec first**

Tag `Absences` (`description: Explicitly recorded weekday absences. Recorded, not requested — there is no approval workflow.`). Paths:

```yaml
  /api/v1/absences:
    post:
      operationId: createAbsence
      summary: Mark a weekday absent
      description: |
        Records an absence with a reason (FR-16). Weekdays only — a weekend
        carries no obligation to be absent from (400). The day must still be
        inside its submission window (400 otherwise), must not be locked
        (409), and must not already hold entries (409) — absent and
        submitted are contradictory.
      tags: [Absences]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/AbsenceCreate'
      responses:
        '200':
          description: The recorded absence.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Absence'
              examples:
                medical:
                  summary: A recorded absence
                  value:
                    id: 1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9
                    date: '2026-08-03'
                    reason: medical appointment
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'
        '500':
          $ref: '#/components/responses/InternalServerError'

  /api/v1/absences/{date}:
    delete:
      operationId: deleteAbsence
      summary: Remove an absence mark
      description: |
        Removes the caller's absence record for the date. Allowed only while
        the day is still inside its submission window and not locked — a
        finalised day is history, not editable state.
      tags: [Absences]
      parameters:
        - name: date
          in: path
          required: true
          description: The civil date whose absence mark to remove.
          schema:
            type: string
            format: date
            examples:
              - '2026-08-03'
      responses:
        '200':
          description: The absence was removed.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Absence'
              examples:
                removed:
                  summary: The removed record
                  value:
                    id: 1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9
                    date: '2026-08-03'
                    reason: medical appointment
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
        '409':
          $ref: '#/components/responses/Conflict'
        '500':
          $ref: '#/components/responses/InternalServerError'
```

Schemas `AbsenceCreate` (`required: [date, reason]`, `additionalProperties: false`, `date` format date, `reason` minLength 1 maxLength 500, examples + descriptions on both) and `Absence` (`required: [id, date, reason]`, `additionalProperties: false`, uuid id, examples on every property). Shared response `NotFound`:

```yaml
    NotFound:
      description: The referenced resource does not exist for this caller.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/Problem'
          examples:
            missingAbsence:
              summary: No absence recorded on that date
              value:
                type: https://irp.bistec.example/problems/absence-not-found
                title: No absence recorded
                status: 404
                detail: No absence is recorded for 2026-08-03.
                instance: /api/v1/absences/2026-08-03
                traceId: 4bf92f3577b34da6a3ce929d0e0e4736
```

`pnpm spec:lint` → zero warnings; `pnpm generate`.

- [ ] **Step 2: The service rule + repo return value**

`AbsenceRepo.remove` currently returns `void`; the DELETE response returns the removed record. Change `remove` to fetch-then-delete inside the existing transaction and return `AbsenceRecordShape` (`remove(studentId, date): Promise<AbsenceRecordShape>`); Task 1's `AbsenceNotFoundError` already covers the miss. Add to `apps/api/src/domain/errors.ts`:

```typescript
export class AbsenceWindowClosedError extends DomainError {
  readonly code = "absence-window-closed";
  readonly status = 400;
  readonly title = "Day is final";
  constructor(date: string) {
    super(`${date} is already final — absence can only be edited while the day's window is open.`);
  }
}
```

- [ ] **Step 3: Failing endpoint tests**

`apps/api/test/absences-endpoint.test.ts`: create happy (200, weekday inside window — use `previousWeekday(toProgrammeDate(new Date()))` or today when a weekday); weekend date → 400 `weekend-absence`; past-final date → 400 `absence-window-closed`; day already holding entries → 409 `entry-conflict`; locked day → 409 `day-locked`; duplicate → 409 `absence-exists`; delete happy (200, body echoes the record); delete nonexistent → 404 `absence-not-found`; delete past-final → 400; mentor token → 403 `students-only`; extra body property → 400.

- [ ] **Step 4: Implement `apps/api/src/routes/absences.ts`**

```typescript
import type { FastifyPluginAsync } from "fastify";
import { canSubmitFor, civilDate } from "@irp/core";
import type { components } from "@irp/types";
import type { AbsenceRepo, AbsenceRecordShape } from "../db/absence-repo.js";
import { AbsenceWindowClosedError } from "../domain/errors.js";
import { requireStudent } from "./entries.js";
import { ABSENCE_CREATE_BODY, DATE_PARAM } from "./schemas.js";

type ApiAbsence = components["schemas"]["Absence"];

function toApiAbsence(a: AbsenceRecordShape): ApiAbsence {
  return { id: a.id, date: a.date, reason: a.reason };
}

/** FR-16 time rule: absence is editable exactly while the window is open. */
function assertWindowOpen(date: string, now: Date): void {
  if (!canSubmitFor(civilDate(date), now)) throw new AbsenceWindowClosedError(date);
}

// eslint-disable-next-line @typescript-eslint/require-await
export const absenceRoutes: FastifyPluginAsync<{ absenceRepo: AbsenceRepo }> = async (app, opts) => {
  app.post<{ Body: components["schemas"]["AbsenceCreate"] }>(
    "/api/v1/absences",
    { schema: { body: ABSENCE_CREATE_BODY }, preHandler: [app.authenticate] },
    async (req): Promise<ApiAbsence> => {
      requireStudent(req);
      assertWindowOpen(req.body.date, new Date());
      const rec = await opts.absenceRepo.create({
        studentId: req.user!.id,
        date: civilDate(req.body.date),
        reason: req.body.reason,
      });
      return toApiAbsence(rec);
    },
  );

  app.delete<{ Params: { date: string } }>(
    "/api/v1/absences/:date",
    { schema: { params: DATE_PARAM }, preHandler: [app.authenticate] },
    async (req): Promise<ApiAbsence> => {
      requireStudent(req);
      assertWindowOpen(req.params.date, new Date());
      const rec = await opts.absenceRepo.remove(req.user!.id, civilDate(req.params.date));
      return toApiAbsence(rec);
    },
  );
};
```

`schemas.ts` additions:

```typescript
export const ABSENCE_CREATE_BODY = {
  type: "object",
  required: ["date", "reason"],
  additionalProperties: false,
  properties: {
    date: { type: "string", format: "date" },
    reason: { type: "string", minLength: 1, maxLength: 500 },
  },
} as const;

export const DATE_PARAM = {
  type: "object",
  required: ["date"],
  additionalProperties: false,
  properties: { date: { type: "string", format: "date" } },
} as const;
```

Wire `absenceRepo` through `ServerDeps`/`index.ts` (if Task 5 already constructed it, just add the route registration). Note the DELETE's locked-day check lives in the repo (`assertNotLocked` runs inside `remove`'s transaction — extend `remove` to call it, mirroring `create`).

- [ ] **Step 5: Run the whole suite, verify green, commit**

```bash
git add spec/openapi.yaml apps/api/
git commit -m "feat(api): absence endpoints -- recorded, window-bound, contradiction-free (FR-16, FR-17)"
```

---
### Task 7: Admin gate + batches + roster — `GET/POST /api/v1/batches`, `GET /api/v1/batches/{id}/roster`

**Files:**
- Modify: `spec/openapi.yaml` (tag `Batches`; schemas `Batch`, `BatchCreate`, `RosterRow`; three operations)
- Create: `apps/api/src/plugins/roles.ts`
- Create: `apps/api/src/routes/batches.ts`
- Create: `apps/api/src/services/roster-service.ts`
- Modify: `apps/api/src/db/batch-repo.ts` (add `getBatch`, `rosterMembers`)
- Modify: `apps/api/src/domain/errors.ts` (add `BatchNotFoundError`, `InvalidBatchDatesError`)
- Modify: `apps/api/src/routes/schemas.ts`, `apps/api/src/server.ts`, `apps/api/src/index.ts`
- Test: `apps/api/test/batches-endpoint.test.ts`, `apps/api/test/roster-service.test.ts`

**Interfaces:**
- Consumes: `DayService` (Task 5), `MentorRecordRepo.get`, `BatchRepo`, Task 1 errors.
- Produces:
  - `roles.ts` exports `requireAdmin(req: FastifyRequest): void` — throws `HttpError(403, "https://irp.bistec.example/problems/admin-only", "Admin access required", "This endpoint is for mentors.")` unless `req.user?.role === "ADMIN"`. (A plain exported function like `requireStudent`, used in `preHandler`-adjacent handler code; not a Fastify decoration — nothing needs app-level state.)
  - `BatchRepo` gains:
    ```typescript
    getBatch(id: string): Promise<BatchRecord | null>;
    rosterMembers(batchId: string, date: CivilDate): Promise<{ studentId: string; displayName: string; email: string }[]>;
    ```
    `rosterMembers`: students with an enrolment where `startDate <= date AND (endDate IS NULL OR endDate >= date)` and `user.deletedAt: null`, ordered by displayName. Disjoint intervals (ADR-0017) guarantee at most one batch per student-day.
  - `BatchNotFoundError` (404, code `batch-not-found`), `InvalidBatchDatesError` (400, code `invalid-batch-dates`).
  - `roster-service.ts` exports `createRosterService(deps: { batchRepo, dayService, mentorRecordRepo })` with
    `roster(batchId: string, date: CivilDate, now: Date): Promise<RosterRowView[]>` where
    ```typescript
    interface RosterRowView {
      student: { id: string; displayName: string; email: string };
      day: DayView;                 // Task 5 shape for exactly `date`
      hasMentorRecord: boolean;
      extraCountThisCycle: number;  // entries with isExtra in the cycle containing `date`
    }
    ```
  - Operations: `listBatches`, `createBatch`, `getBatchRoster` — all Admin-only (403 for students).

- [ ] **Step 1: Spec first**

Tag `Batches` (`description: Cohorts and their enrolment rosters. Mentor (Admin) access only.`). Schemas:

```yaml
    Batch:
      type: object
      title: Batch
      description: A cohort with its own start and end dates. Two run concurrently; calendars are independent.
      required: [id, name, startDate, endDate]
      additionalProperties: false
      properties:
        id:
          type: string
          format: uuid
          description: Batch identifier.
          examples:
            - 0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e
        name:
          type: string
          description: Display name.
          examples:
            - Batch Aurora
        startDate:
          type: string
          format: date
          description: Admission date — anchors cycle numbering (FR-6, FR-9).
          examples:
            - '2026-05-10'
        endDate:
          type: string
          format: date
          description: Programme end for this cohort.
          examples:
            - '2026-11-09'

    BatchCreate:
      type: object
      title: BatchCreate
      description: A new cohort. startDate must precede endDate.
      required: [name, startDate, endDate]
      additionalProperties: false
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 120
          description: Display name, unique in practice but not enforced.
          examples:
            - Batch Cinder
        startDate:
          type: string
          format: date
          description: Admission date.
          examples:
            - '2026-09-10'
        endDate:
          type: string
          format: date
          description: Programme end. Must be after startDate (400 otherwise).
          examples:
            - '2027-03-09'

    RosterRow:
      type: object
      title: RosterRow
      description: One enrolled student's state for the roster date — the mentor's working view (FR-28 groundwork).
      required: [student, day, hasMentorRecord, extraCountThisCycle]
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
                - Amaya Perera
            email:
              type: string
              format: email
              description: Bistec account email.
              examples:
                - a.perera@bistecglobal.com
        day:
          $ref: '#/components/schemas/DaySummary'
        hasMentorRecord:
          type: boolean
          description: Whether the mentor has recorded attendance/tasks for this date (FR-19).
          examples:
            - true
        extraCountThisCycle:
          type: integer
          minimum: 0
          description: Weekend Extra entries inside the cycle containing the roster date. A count, not a status — Extra is not a compliance state.
          examples:
            - 2
```

Operations (each with the standard five responses plus `403`; roster and both batch ops add nothing else except roster's `404`):

```yaml
  /api/v1/batches:
    get:
      operationId: listBatches
      summary: List batches
      description: All cohorts, oldest first. Mentor only.
      tags: [Batches]
      responses:
        '200':
          description: Every batch.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Batch'
              examples:
                two:
                  summary: Two concurrent cohorts
                  value:
                    - id: 0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e
                      name: Batch Aurora
                      startDate: '2026-05-10'
                      endDate: '2026-11-09'
                    - id: 9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b
                      name: Batch Basalt
                      startDate: '2026-07-10'
                      endDate: '2027-01-09'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '500':
          $ref: '#/components/responses/InternalServerError'
    post:
      operationId: createBatch
      summary: Create a batch
      description: Creates a cohort (FR-6). startDate must precede endDate.
      tags: [Batches]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/BatchCreate'
      responses:
        '200':
          description: The created batch.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Batch'
              examples:
                created:
                  summary: A new cohort
                  value:
                    id: 7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d
                    name: Batch Cinder
                    startDate: '2026-09-10'
                    endDate: '2027-03-09'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '500':
          $ref: '#/components/responses/InternalServerError'

  /api/v1/batches/{id}/roster:
    get:
      operationId: getBatchRoster
      summary: The batch roster for a date
      description: |
        Every student enrolled on the given date (archived students leave
        active rosters), each with their day view, mentor-record presence,
        and the cycle's Extra count. Defaults to today (Asia/Colombo).
      tags: [Batches]
      parameters:
        - name: id
          in: path
          required: true
          description: The batch id.
          schema:
            type: string
            format: uuid
            examples:
              - 0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e
        - name: date
          in: query
          required: false
          description: The roster date. Defaults to today in Asia/Colombo.
          schema:
            type: string
            format: date
            examples:
              - '2026-08-03'
      responses:
        '200':
          description: One row per enrolled student, ordered by display name.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/RosterRow'
              examples:
                oneRow:
                  summary: A single enrolled student
                  value:
                    - student:
                        id: 3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8
                        displayName: Amaya Perera
                        email: a.perera@bistecglobal.com
                      day:
                        date: '2026-08-03'
                        status: onTime
                        reportStatus: Submitted
                        reportId: 5a3c2b1d-0e9f-4a8b-b7c6-d5e4f3a2b1c0
                        absenceReason: null
                        entries:
                          - id: 7be9f1d2-3c44-4f8a-9a01-2b3c4d5e6f70
                            entryDate: '2026-08-03'
                            body: Implemented the roster endpoint and its tests.
                            submittedAt: '2026-08-03T11:30:00.000Z'
                            isLate: false
                            isExtra: false
                      hasMentorRecord: false
                      extraCountThisCycle: 0
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

`pnpm spec:lint` → zero warnings; `pnpm generate`.

- [ ] **Step 2: Failing tests**

`apps/api/test/roster-service.test.ts` — in-file rows: one batch, three students (one archived → excluded; one transferred away before the date → excluded; one enrolled → included with correct `day.status`, `hasMentorRecord` true after an upsert, `extraCountThisCycle` counting a weekend entry inside the cycle). Assert the transfer-day boundary: on the effective date the student appears ONLY in the new batch's roster; the day before, only in the old one (this is ADR-0017 observable).

`apps/api/test/batches-endpoint.test.ts` — student token → 403 `admin-only` on all three ops; create happy; `endDate <= startDate` → 400 `invalid-batch-dates`; roster of unknown batch id → 404 `batch-not-found`; roster default date is today; extra body property → 400.

- [ ] **Step 3: Implement**

`apps/api/src/domain/errors.ts`:

```typescript
export class BatchNotFoundError extends DomainError {
  readonly code = "batch-not-found";
  readonly status = 404;
  readonly title = "Batch not found";
  constructor(id: string) {
    super(`No batch exists with id ${id}.`);
  }
}

export class InvalidBatchDatesError extends DomainError {
  readonly code = "invalid-batch-dates";
  readonly status = 400;
  readonly title = "Invalid batch dates";
  constructor() {
    super("startDate must be before endDate.");
  }
}
```

`apps/api/src/plugins/roles.ts`:

```typescript
import type { FastifyRequest } from "fastify";
import { HttpError } from "../errors.js";

/** Mentor-only endpoints (spec §4: all 403 for STUDENT role). */
export function requireAdmin(req: FastifyRequest): void {
  if (req.user?.role !== "ADMIN") {
    throw new HttpError(
      403,
      "https://irp.bistec.example/problems/admin-only",
      "Admin access required",
      "This endpoint is for mentors.",
    );
  }
}
```

`batch-repo.ts` additions:

```typescript
async getBatch(id) {
  const b = await prisma.batch.findUnique({ where: { id } });
  return b ? mapBatch(b) : null;
},

async rosterMembers(batchId, date) {
  const rows = await prisma.enrolment.findMany({
    where: {
      batchId,
      startDate: { lte: toDbDate(date) },
      OR: [{ endDate: null }, { endDate: { gte: toDbDate(date) } }],
      student: { deletedAt: null },
    },
    include: { student: { select: { id: true, displayName: true, email: true } } },
    orderBy: { student: { displayName: "asc" } },
  });
  return rows.map((r) => ({
    studentId: r.student.id,
    displayName: r.student.displayName,
    email: r.student.email,
  }));
},
```

(The `student` relation name must match `schema.prisma`'s field on `Enrolment` — check the model; if the relation field is named differently, e.g. `user`, use that name in `include`, `orderBy`, and the mapping.)

`apps/api/src/services/roster-service.ts`:

```typescript
import { cycleContaining, type CivilDate } from "@irp/core";
import type { BatchRepo } from "../db/batch-repo.js";
import type { MentorRecordRepo } from "../db/mentor-record-repo.js";
import type { DayService, DayView } from "./day-service.js";
import { BatchNotFoundError } from "../domain/errors.js";

export interface RosterRowView {
  student: { id: string; displayName: string; email: string };
  day: DayView;
  hasMentorRecord: boolean;
  extraCountThisCycle: number;
}

export function createRosterService(deps: {
  batchRepo: BatchRepo;
  dayService: DayService;
  mentorRecordRepo: MentorRecordRepo;
}) {
  return {
    async roster(batchId: string, date: CivilDate, now: Date): Promise<RosterRowView[]> {
      const batch = await deps.batchRepo.getBatch(batchId);
      if (!batch) throw new BatchNotFoundError(batchId);
      const members = await deps.batchRepo.rosterMembers(batchId, date);
      const cycle = cycleContaining(date);
      return Promise.all(
        members.map(async (m) => {
          const [cycleDays, record] = await Promise.all([
            deps.dayService.listDays(m.studentId, cycle.start, cycle.end, now),
            deps.mentorRecordRepo.get(m.studentId, date),
          ]);
          const day = cycleDays.find((d) => d.date === date)!;
          const extraCountThisCycle = cycleDays
            .flatMap((d) => d.entries)
            .filter((e) => e.isExtra).length;
          return {
            student: { id: m.studentId, displayName: m.displayName, email: m.email },
            day,
            hasMentorRecord: record !== null,
            extraCountThisCycle,
          };
        }),
      );
    },
  };
}

export type RosterService = ReturnType<typeof createRosterService>;
```

`apps/api/src/routes/batches.ts` — three handlers: `requireAdmin(req)` first line each; `createBatch` validates `compareDates(civilDate(startDate), civilDate(endDate)) < 0` else `InvalidBatchDatesError`; roster resolves `date ?? toProgrammeDate(new Date())`, calls the roster service, maps `day` through `toApiDay` (Task 5). Body/query/param schemas go in `schemas.ts` (`BATCH_CREATE_BODY`, `UUID_PARAM = { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } }`, `ROSTER_QUERY` with optional `date`). Wire `batchRepo`, `rosterService`, `mentorRecordRepo` through `ServerDeps` and `index.ts`.

- [ ] **Step 4: Run the whole suite, verify green, commit**

```bash
git add spec/openapi.yaml apps/api/
git commit -m "feat(api): batches + roster -- the mentor working view over engine-classified days (FR-6, FR-28 groundwork)"
```

---

### Task 8: Review actions — transition, day records, mentor's student view

`POST /api/v1/daily-reports/{id}/transition`, `PUT /api/v1/students/{id}/day-records/{date}`, `GET /api/v1/students/{id}/days`.

**Files:**
- Modify: `spec/openapi.yaml` (tags `Reviews`; schemas `DailyReport`, `TransitionRequest`, `DayRecord`, `DayRecordUpsert`; three paths)
- Create: `apps/api/src/routes/reviews.ts`
- Modify: `apps/api/src/db/entry-repo.ts` (add `transition`)
- Modify: `apps/api/src/db/user-repo.ts` (add `findById` — unfiltered by deletedAt)
- Modify: `apps/api/src/domain/errors.ts` (add `ReportNotFoundError`, `InvalidTransitionError`, `WeekendDayRecordError`, `StudentNotFoundError`)
- Modify: `apps/api/src/routes/schemas.ts`, `apps/api/src/server.ts`, `apps/api/src/index.ts`
- Test: `apps/api/test/reviews-endpoint.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 7), `DayService` + `resolveRange`/`toApiDay` (Task 5), `MentorRecordRepo.upsert/get`, `isWeekday` from `@irp/core`.
- Produces:
  - `EntryRepo.transition(reportId: string, to: "IN_REVIEW" | "EVALUATED", mentorId: string, now: Date): Promise<DailyReportRecord>` — forward-only: `IN_REVIEW` requires current `SUBMITTED`; `EVALUATED` requires current `IN_REVIEW`. Wrong current state → `InvalidTransitionError` (409, code `invalid-transition`); unknown id → `ReportNotFoundError` (404, code `report-not-found`). Sets `reviewedById` and `inReviewAt`/`evaluatedAt` respectively.
  - `UserRepo.findById(id: string): Promise<(UserRecord & { deletedAt: Date | null }) | null>` — includes archived users (callers decide).
  - `StudentNotFoundError` (404, code `student-not-found`), `WeekendDayRecordError` (400, code `weekend-day-record`).
  - Operations: `transitionDailyReport`, `upsertDayRecord`, `listStudentDays`.

- [ ] **Step 1: Spec first**

Tag `Reviews` (`description: Mentor review of daily reports — forward-only state, attendance records, and the per-student day view.`). Schemas:

```yaml
    TransitionRequest:
      type: object
      title: TransitionRequest
      description: Advance a report one step. Forward-only — Submitted to InReview to Evaluated; there is no Rejected and no way back.
      required: [to]
      additionalProperties: false
      properties:
        to:
          type: string
          enum: [InReview, Evaluated]
          description: The target state. InReview requires the report to be Submitted; Evaluated requires InReview.
          examples:
            - InReview

    DailyReport:
      type: object
      title: DailyReport
      description: One student-day's rolled-up review record (FR-18/FR-20).
      required: [id, studentId, reportDate, status]
      additionalProperties: false
      properties:
        id:
          type: string
          format: uuid
          description: Report identifier.
          examples:
            - 5a3c2b1d-0e9f-4a8b-b7c6-d5e4f3a2b1c0
        studentId:
          type: string
          format: uuid
          description: The student the report belongs to.
          examples:
            - 3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8
        reportDate:
          type: string
          format: date
          description: The civil date the report rolls up.
          examples:
            - '2026-08-03'
        status:
          $ref: '#/components/schemas/ReportStatus'

    DayRecordUpsert:
      type: object
      title: DayRecordUpsert
      description: The mentor's own attendance/tasks record for a student-day (FR-19). Independent of entries — valid for entry-less days.
      required: [attended, tasksCompleted]
      additionalProperties: false
      properties:
        attended:
          type: boolean
          description: Whether the student attended.
          examples:
            - true
        tasksCompleted:
          type: boolean
          description: Whether the day's tasks were completed.
          examples:
            - true
        note:
          type: string
          maxLength: 500
          description: Optional free-text note.
          examples:
            - Paired on the deployment workflow.

    DayRecord:
      type: object
      title: DayRecord
      description: A stored mentor day record.
      required: [id, studentId, date, attended, tasksCompleted, note, recordedById]
      additionalProperties: false
      properties:
        id:
          type: string
          format: uuid
          description: Record identifier.
          examples:
            - 8c7b6a5d-4e3f-4d2c-9b1a-0f9e8d7c6b5a
        studentId:
          type: string
          format: uuid
          description: The student.
          examples:
            - 3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8
        date:
          type: string
          format: date
          description: The weekday recorded.
          examples:
            - '2026-08-03'
        attended:
          type: boolean
          description: Attendance as recorded by the mentor.
          examples:
            - true
        tasksCompleted:
          type: boolean
          description: Task completion as recorded by the mentor.
          examples:
            - true
        note:
          oneOf:
            - type: string
            - type: 'null'
          description: The mentor's note, when one was recorded.
          examples:
            - Paired on the deployment workflow.
        recordedById:
          type: string
          format: uuid
          description: The mentor who recorded it.
          examples:
            - 9c8b7a6d-5e4f-4a3b-9182-7c6d5e4f3a2b
```

Paths — `POST /api/v1/daily-reports/{id}/transition` (operationId `transitionDailyReport`; param `id` uuid with description; responses 200 → `DailyReport`, 400, 401, 403, 404 NotFound, 409 Conflict, 500 — one example each), `PUT /api/v1/students/{id}/day-records/{date}` (operationId `upsertDayRecord`; params `id` uuid + `date`; body `DayRecordUpsert`; responses 200 → `DayRecord`, 400, 401, 403, 404, 500), `GET /api/v1/students/{id}/days` (operationId `listStudentDays`; same `from`/`to` query as `listMyDays` with the same descriptions; responses 200 → array of `DaySummary` with one example, 400, 401, 403, 404, 500). Every parameter carries a description; run `pnpm spec:lint` (zero warnings) then `pnpm generate`.

- [ ] **Step 2: Failing tests**

`apps/api/test/reviews-endpoint.test.ts`:
- transition Submitted→InReview 200 (sets status + `reviewedById`, `inReviewAt` non-null in DB); InReview→Evaluated 200 (`evaluatedAt` set); repeat InReview → 409 `invalid-transition`; Evaluated→InReview → 409; unknown report id → 404 `report-not-found`; student token → 403 `admin-only`.
- day-record: PUT creates then PUT again overwrites (200 both, second wins); weekend date → 400 `weekend-day-record`; unknown student → 404 `student-not-found`; entry-less day works.
- student days: mirrors `me/days` happy shape for a target student; unknown student → 404; student token → 403.

- [ ] **Step 3: Implement**

`entry-repo.ts` `transition` (inside `createEntryRepo`'s returned object; add to `EntryRepo` interface):

```typescript
async transition(reportId, to, mentorId, now) {
  const expected = to === "IN_REVIEW" ? "SUBMITTED" : "IN_REVIEW";
  const data =
    to === "IN_REVIEW"
      ? { status: to, reviewedById: mentorId, inReviewAt: now }
      : { status: to, reviewedById: mentorId, evaluatedAt: now };
  const { count } = await prisma.dailyReport.updateMany({
    where: { id: reportId, status: expected },
    data,
  });
  if (count === 0) {
    const current = await prisma.dailyReport.findUnique({ where: { id: reportId } });
    if (!current) throw new ReportNotFoundError(reportId);
    throw new InvalidTransitionError(current.status, to);
  }
  const r = await prisma.dailyReport.findUniqueOrThrow({ where: { id: reportId } });
  return { id: r.id, studentId: r.studentId, reportDate: fromDbDate(r.reportDate), status: r.status };
},
```

(`updateMany` with the status in the `where` is the concurrency guard: two mentors racing the same step — exactly one `count === 1`.)

New errors:

```typescript
export class ReportNotFoundError extends DomainError {
  readonly code = "report-not-found";
  readonly status = 404;
  readonly title = "Report not found";
  constructor(id: string) {
    super(`No daily report exists with id ${id}.`);
  }
}

export class InvalidTransitionError extends DomainError {
  readonly code = "invalid-transition";
  readonly status = 409;
  readonly title = "Invalid review transition";
  constructor(from: string, to: string) {
    super(`A report in state ${from} cannot move to ${to} — review is forward-only (FR-18), with no Rejected state.`);
  }
}

export class WeekendDayRecordError extends DomainError {
  readonly code = "weekend-day-record";
  readonly status = 400;
  readonly title = "Weekends have no day record";
  constructor(date: string) {
    super(`${date} is a weekend — attendance records apply to required days only (FR-19).`);
  }
}

export class StudentNotFoundError extends DomainError {
  readonly code = "student-not-found";
  readonly status = 404;
  readonly title = "Student not found";
  constructor(id: string) {
    super(`No student exists with id ${id}.`);
  }
}
```

`user-repo.ts` `findById` (interface + impl):

```typescript
async findById(id) {
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return null;
  return {
    id: u.id, externalId: u.externalId, email: u.email,
    displayName: u.displayName, role: u.role, deletedAt: u.deletedAt,
  };
},
```

`apps/api/src/routes/reviews.ts` — three handlers, `requireAdmin(req)` first in each. `transitionDailyReport` maps the API enum to the DB enum (`{ InReview: "IN_REVIEW", Evaluated: "EVALUATED" } as const`) and returns the report mapped through `REPORT_STATUS_TO_API`. `upsertDayRecord` resolves the student via `userRepo.findById` (404 `StudentNotFoundError` when null or `role !== "STUDENT"`), throws `WeekendDayRecordError` unless `isWeekday(civilDate(req.params.date))`, then `mentorRecordRepo.upsert({ …, recordedById: req.user!.id })`. `listStudentDays` resolves the student the same way, then reuses `resolveRange` + `dayService.listDays` + `toApiDay` exactly as `me-days.ts` does. Route schemas (`TRANSITION_BODY`, `DAY_RECORD_BODY`, param schemas) in `schemas.ts`. Wire `userRepo` (already in deps) + register routes.

- [ ] **Step 4: Run the whole suite, verify green, commit**

```bash
git add spec/openapi.yaml apps/api/
git commit -m "feat(api): review actions -- forward-only transitions, mentor day records, student day view (FR-18..FR-20)"
```

---

### Task 9: User administration — `POST /api/v1/users`, `GET /api/v1/users`

**Files:**
- Modify: `spec/openapi.yaml` (tag `Users`; schemas `UserCreate`, `UserDetail`; two operations on `/api/v1/users`)
- Create: `apps/api/src/routes/users.ts`
- Modify: `apps/api/src/db/user-repo.ts` (add `create`, `list`)
- Modify: `apps/api/src/domain/errors.ts` (add `DuplicateUserError`, `EnrolmentRequiredError`)
- Modify: `apps/api/src/routes/schemas.ts`, `apps/api/src/server.ts`, `apps/api/src/index.ts`
- Test: `apps/api/test/users-endpoint.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `BatchRepo.enrol` + `getBatch`, Task 1 P2002 pattern.
- Produces:
  - `UserRepo.create(input: { externalId: string; email: string; displayName: string; role: "ADMIN" | "STUDENT" }): Promise<UserRecord>` — P2002 → `DuplicateUserError` (409, code `duplicate-user`).
  - `UserRepo.list(filter: { role?: "ADMIN" | "STUDENT"; archived: boolean }): Promise<(UserRecord & { deletedAt: Date | null })[]>` — `archived: false` → `deletedAt: null` rows; `archived: true` → `deletedAt != null` rows (the FR-5 archive view).
  - `EnrolmentRequiredError` (400, code `enrolment-required`) — a Student registration without `enrolment`, or an Admin registration carrying one.
  - Operations `createUser` / `listUsers`. Registration of a student creates user + initial enrolment atomically; the transaction wraps `user.create` and `enrolment.create` directly (a cross-repo transaction seam is not worth building for one call site — note the seam decision in the route file comment).
  - `UserDetail` = `User` + `archived: boolean` (list view needs it; the `User` schema stays as `/me` returns it).

- [ ] **Step 1: Spec first**

Tag `Users` (`description: Registration and the user directory. Mentor (Admin) access only; there is no self-registration.`). Schemas:

```yaml
    UserCreate:
      type: object
      title: UserCreate
      description: |
        Register a mentor or a student (FR-3). Students require an initial
        enrolment; mentors must not carry one. The externalId is the Entra
        object id (oid claim) the person will authenticate with.
      required: [externalId, email, displayName, role]
      additionalProperties: false
      properties:
        externalId:
          type: string
          minLength: 1
          maxLength: 200
          description: Entra object id (oid) of the account.
          examples:
            - 00000000-aaaa-bbbb-cccc-000000000001
        email:
          type: string
          format: email
          description: Bistec account email. Unique.
          examples:
            - n.perera@bistecglobal.com
        displayName:
          type: string
          minLength: 1
          maxLength: 200
          description: Name as shown in the interface.
          examples:
            - Nuwan Perera
        role:
          $ref: '#/components/schemas/Role'
        enrolment:
          type: object
          description: Initial enrolment — required for Students, forbidden for Admins.
          required: [batchId, startDate]
          additionalProperties: false
          properties:
            batchId:
              type: string
              format: uuid
              description: The batch to enrol into.
              examples:
                - 0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e
            startDate:
              type: string
              format: date
              description: Enrolment start (admission) date.
              examples:
                - '2026-08-10'

    UserDetail:
      type: object
      title: UserDetail
      description: A directory row — the User shape plus archival state (FR-5).
      required: [id, email, displayName, role, archived]
      additionalProperties: false
      properties:
        id:
          type: string
          format: uuid
          description: Stable internal identifier.
          examples:
            - 3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8
        email:
          type: string
          format: email
          description: Bistec account email.
          examples:
            - a.perera@bistecglobal.com
        displayName:
          type: string
          description: Name as shown in the interface.
          examples:
            - Amaya Perera
        role:
          $ref: '#/components/schemas/Role'
        archived:
          type: boolean
          description: True when the user has been archived (soft-deleted). Archived users keep history and lose access.
          examples:
            - false
```

Operations: `POST /api/v1/users` (operationId `createUser`; body `UserCreate`; 200 → `UserDetail` with one example; 400/401/403/404/409/500 — the 404 is `NotFound`, for an enrolment naming a batch that does not exist) and `GET /api/v1/users` (operationId `listUsers`; query `role` — `schema: { $ref: '#/components/schemas/Role' }`, optional, description `Filter by role.`; query `archived` — `type: boolean`, optional, description `true lists archived users (the FR-5 archive view); default false.`; 200 → array of `UserDetail` with one example; 400/401/403/500). `pnpm spec:lint`; `pnpm generate`.

- [ ] **Step 2: Failing tests**

`apps/api/test/users-endpoint.test.ts`: register mentor 200 (no enrolment field); register student 200 → open enrolment exists in DB with the given start date; student without enrolment → 400 `enrolment-required`; admin WITH enrolment → 400 `enrolment-required`; duplicate email → 409 `duplicate-user`; unknown batchId → 404 `batch-not-found`; list defaults to active only; `?archived=true` returns only archived; `?role=Student` filters; student token → 403; extra property → 400.

- [ ] **Step 3: Implement**

`user-repo.ts` additions (same `isUniqueViolation` local guard as Task 1):

```typescript
async create(input) {
  try {
    const u = await prisma.user.create({ data: input });
    return { id: u.id, externalId: u.externalId, email: u.email, displayName: u.displayName, role: u.role };
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateUserError(input.email);
    throw err;
  }
},

async list(filter) {
  const rows = await prisma.user.findMany({
    where: {
      deletedAt: filter.archived ? { not: null } : null,
      ...(filter.role === undefined ? {} : { role: filter.role }),
    },
    orderBy: { displayName: "asc" },
  });
  return rows.map((u) => ({
    id: u.id, externalId: u.externalId, email: u.email,
    displayName: u.displayName, role: u.role, deletedAt: u.deletedAt,
  }));
},
```

Errors:

```typescript
export class DuplicateUserError extends DomainError {
  readonly code = "duplicate-user";
  readonly status = 409;
  readonly title = "User already exists";
  constructor(email: string) {
    super(`A user already exists with this email or external id (${email}).`);
  }
}

export class EnrolmentRequiredError extends DomainError {
  readonly code = "enrolment-required";
  readonly status = 400;
  readonly title = "Enrolment mismatch";
  constructor(detail: string) {
    super(detail);
  }
}
```

`apps/api/src/routes/users.ts` — `createUser`: `requireAdmin`; role `Student` requires `enrolment` (else `EnrolmentRequiredError("A student registration requires an initial enrolment.")`), role `Admin` forbids it (`"A mentor registration must not carry an enrolment."`); when enrolling, resolve the batch first (`getBatch` → `BatchNotFoundError`), then `prisma.$transaction` around `user.create` + `enrolment.create` (the route receives `prisma` for exactly this — pass it via plugin opts like the repos). Map API `Role` ("Admin"/"Student") ↔ DB (`ADMIN`/`STUDENT`) with a `Record`, mirroring `ROLE_TO_API` in `me.ts`. `listUsers`: map `deletedAt !== null` → `archived`. Route schemas in `schemas.ts` (`USER_CREATE_BODY` mirroring the spec including the nested `enrolment` object, `USERS_QUERY` with `role` enum ["Admin","Student"] and `archived` boolean — the coercing wire ajv turns `"true"` into `true`).

- [ ] **Step 4: Run the whole suite, verify green, commit**

```bash
git add spec/openapi.yaml apps/api/
git commit -m "feat(api): user registration and directory -- students enrol atomically, archive view (FR-3, FR-5)"
```

---

### Task 10: Transfer + archive — `POST /api/v1/students/{id}/transfer`, `DELETE /api/v1/users/{id}`

**Files:**
- Modify: `spec/openapi.yaml` (schemas `TransferRequest`; two operations)
- Create: `apps/api/src/routes/admin-actions.ts`
- Modify: `apps/api/src/db/user-repo.ts` (add `archive`)
- Modify: `apps/api/src/domain/errors.ts` (add `SelfArchiveError`, `UserNotFoundError`)
- Modify: `apps/api/src/routes/schemas.ts`, `apps/api/src/server.ts`, `apps/api/src/index.ts`
- Test: `apps/api/test/admin-actions-endpoint.test.ts`

**Interfaces:**
- Consumes: `BatchRepo.transfer` (ADR-0017 semantics), `UserRepo.findById`, `requireAdmin`.
- Produces:
  - `UserRepo.archive(id: string, now: Date): Promise<void>` — sets `deletedAt: now` when null; **idempotent**: already-archived is a no-op success (a second DELETE changes nothing — correct REST and correct FR-5).
  - `SelfArchiveError` (409, code `self-archive`), `UserNotFoundError` (404, code `user-not-found`).
  - Operations `transferStudent` (200 → the new open `Enrolment` — add an `Enrolment` schema: `required: [id, studentId, batchId, startDate, endDate]`, `endDate` nullable via `oneOf` with `'null'`, descriptions + examples on all) and `archiveUser` (200 → `UserDetail` with `archived: true`).

- [ ] **Step 1: Spec first**

```yaml
    TransferRequest:
      type: object
      title: TransferRequest
      description: Move a student to another batch (FR-8). The new batch owns the effective date; the old enrolment closes the day before (ADR-0017).
      required: [toBatchId, effectiveDate]
      additionalProperties: false
      properties:
        toBatchId:
          type: string
          format: uuid
          description: The destination batch.
          examples:
            - 9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b
        effectiveDate:
          type: string
          format: date
          description: First day in the new batch. Must be after the open enrolment's start (400 otherwise).
          examples:
            - '2026-08-10'
```

`POST /api/v1/students/{id}/transfer` (operationId `transferStudent`; param `id` uuid described; responses 200 → `Enrolment`, 400, 401, 403, 404 NotFound, 409 Conflict — `no-open-enrolment`, 500). `DELETE /api/v1/users/{id}` (operationId `archiveUser`; description: `Soft archive (FR-5): the user leaves active rosters and loses access, history is kept. Idempotent — archiving an archived user is a no-op. Self-archive is rejected (409).`; responses 200 → `UserDetail`, 400, 401, 403, 404, 409, 500). `pnpm spec:lint`; `pnpm generate`.

- [ ] **Step 2: Failing tests**

`apps/api/test/admin-actions-endpoint.test.ts`: transfer happy — old enrolment ends effectiveDate−1, response is the new enrolment with `endDate: null`; unknown student → 404 `student-not-found`; unknown target batch → 404 `batch-not-found`; mentor as target → 404 `student-not-found` (role check); no open enrolment → 409; effectiveDate ≤ start → 400 `invalid-transfer-date`. Archive: 200 with `archived: true`; the archived student disappears from `listUsers` default + appears under `?archived=true`; a `/me` call with the archived student's token now 403s (the FR-5 access-revocation path — `findByExternalId` filters `deletedAt`); repeat DELETE → 200 (idempotent); self-archive → 409 `self-archive`; unknown id → 404 `user-not-found`; student token → 403.

- [ ] **Step 3: Implement**

Errors:

```typescript
export class SelfArchiveError extends DomainError {
  readonly code = "self-archive";
  readonly status = 409;
  readonly title = "Cannot archive yourself";
  constructor() {
    super("Archiving your own account would lock you out mid-session.");
  }
}

export class UserNotFoundError extends DomainError {
  readonly code = "user-not-found";
  readonly status = 404;
  readonly title = "User not found";
  constructor(id: string) {
    super(`No user exists with id ${id}.`);
  }
}
```

`user-repo.ts`:

```typescript
async archive(id, now) {
  // Idempotent: only stamps when not already archived.
  await prisma.user.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: now },
  });
},
```

`apps/api/src/routes/admin-actions.ts` — `transferStudent`: `requireAdmin`; `userRepo.findById` → `StudentNotFoundError` when null or role not STUDENT; `batchRepo.getBatch(toBatchId)` → `BatchNotFoundError`; `batchRepo.transfer(...)` (Task 3 throws the rest); map to the API `Enrolment` shape. `archiveUser`: `requireAdmin`; `req.user!.id === req.params.id` → `SelfArchiveError`; `findById` → `UserNotFoundError` when null; `archive(id, new Date())`; re-fetch with `findById` and return as `UserDetail` (`archived: deletedAt !== null`). Schemas `TRANSFER_BODY` in `schemas.ts`; wire + register.

- [ ] **Step 4: Run the whole suite, verify green, commit**

```bash
git add spec/openapi.yaml apps/api/
git commit -m "feat(api): transfer and archive -- disjoint enrolments applied, access revoked with history kept (FR-5, FR-8)"
```

---
### Task 11: Shared UI primitives + page migration + sign-out (D7, D8)

`apps/web/components/ui/` gains the component vocabulary of `docs/design-system.md` §4/§9/§10; the three existing pages migrate onto it; the topbar gains Sign out.

**Files:**
- Create: `apps/web/components/ui/page-title.tsx`, `section-label.tsx`, `status-pill.tsx`, `button.tsx`, `panel.tsx`, `empty-state.tsx`
- Modify: `apps/web/app/globals.css` (button state styles + `--st-review` token if absent)
- Modify: `apps/web/components/app-frame/topbar.tsx` (sign-out form)
- Modify: `apps/web/app/(app)/page.tsx`, `apps/web/app/(auth)/signin/sign-in-panel.tsx`, `apps/web/app/(auth)/not-registered/page.tsx` (migrate onto primitives)
- Test: `apps/web/test/ui-primitives.test.tsx` (new), existing `layout.test.tsx` / `signin.test.tsx` / `app-frame.test.tsx` stay green (update selectors only where markup changed)

**Interfaces:**
- Consumes: existing CSS tokens in `globals.css` (`--ink`, `--ink-muted`, `--surface`, `--line`, `--primary`, `--primary-weak`, `--radius-control`, `--radius-panel`, `--st-ok/late/absent/missed`), `signOut` from `apps/web/auth.ts`.
- Produces (exact props later tasks use):
  ```tsx
  PageTitle:    { children: ReactNode }                       // h1, 24px, tracking -0.03em, text-wrap balance
  SectionLabel: { children: ReactNode }                       // the uppercase 12px label pattern the pages hand-roll today
  Panel:        { children: ReactNode; sunk?: boolean }        // surface card, radius-panel, 24px padding
  EmptyState:   { title: string; hint?: string }               // invitation copy, §11 — never "Nothing here"
  Button:       { children; type?; variant?: "primary" | "quiet" | "danger"; disabled?; loading? }
                // all seven states via CSS classes btn/btn-primary/btn-quiet/btn-danger (§9);
                // loading renders the label at reduced opacity + aria-busy, never a spinner swap
  StatusPill:   { status: "onTime" | "late" | "absent" | "missed" | "pending" | "extra" | "none" | "future";
                  reportStatus?: "Submitted" | "InReview" | "Evaluated" | null }
  ```
  `StatusPill` renders glyph + text label (a11y §12: status is never colour alone): `onTime` → `● On time` in `--st-ok`; `late` → `◐ Late` in `--st-late`; `absent` → `○ Absent` in `--st-absent`; `missed` → `✕ Missed` in `--st-missed`; `pending` → `· Open` in `--ink-muted`; `future`/`none` → `— —` in `--ink-muted`; `extra` → the text `+ Extra` in `--ink-muted` (form, not colour — §3.2). When `reportStatus` is `InReview` it appends `· In review` in `--primary`; `Evaluated` appends `· Evaluated 🔒`-equivalent using the lock glyph `\u{1F512}` replaced by text `· Evaluated (locked)` — copy per §11, no emoji.

- [ ] **Step 1: Button state CSS**

Append to `apps/web/app/globals.css` (tokens exist; only component classes are new — check first with `Select-String -Path apps/web/app/globals.css -Pattern "btn"` that nothing collides, and add `--st-review: var(--primary);` to both theme blocks if absent):

```css
/* §9 button vocabulary — all seven states. 150ms ease-out-quart (§10). */
.btn {
  border-radius: var(--radius-control);
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
  transition: background-color 150ms cubic-bezier(0.25, 1, 0.5, 1),
    color 150ms cubic-bezier(0.25, 1, 0.5, 1),
    border-color 150ms cubic-bezier(0.25, 1, 0.5, 1);
}
.btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn[aria-busy="true"] { opacity: 0.7; cursor: progress; }
.btn-primary { background: var(--primary); color: var(--surface); border: 1px solid var(--primary); }
.btn-primary:hover:not(:disabled) { filter: brightness(1.08); }
.btn-primary:active:not(:disabled) { filter: brightness(0.92); }
.btn-quiet { background: transparent; color: var(--ink); border: 1px solid var(--line); }
.btn-quiet:hover:not(:disabled) { background: var(--primary-weak); }
.btn-quiet:active:not(:disabled) { border-color: var(--line-strong); }
.btn-danger { background: transparent; color: var(--st-missed); border: 1px solid var(--st-missed); }
.btn-danger:hover:not(:disabled) { background: color-mix(in oklab, var(--st-missed) 12%, transparent); }
.btn-danger:active:not(:disabled) { filter: brightness(0.92); }
@media (prefers-reduced-motion: reduce) {
  .btn { transition: none; }
}
```

(If Plan 5's "button interaction states" commit already added equivalent classes, reuse those class names verbatim instead of adding duplicates — the design-system commit `24f876a` may have landed them; check before writing.)

- [ ] **Step 2: The primitives**

`apps/web/components/ui/button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

const VARIANT_CLASS = {
  primary: "btn btn-primary",
  quiet: "btn btn-quiet",
  danger: "btn btn-danger",
} as const;

export function Button({
  children,
  variant = "primary",
  loading = false,
  disabled,
  ...rest
}: {
  children: ReactNode;
  variant?: keyof typeof VARIANT_CLASS;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={VARIANT_CLASS[variant]}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  );
}
```

`apps/web/components/ui/status-pill.tsx`:

```tsx
const STATUS_RENDER = {
  onTime: { glyph: "●", label: "On time", color: "var(--st-ok)" },
  late: { glyph: "◐", label: "Late", color: "var(--st-late)" },
  absent: { glyph: "○", label: "Absent", color: "var(--st-absent)" },
  missed: { glyph: "✕", label: "Missed", color: "var(--st-missed)" },
  pending: { glyph: "·", label: "Open", color: "var(--ink-muted)" },
  extra: { glyph: "+", label: "Extra", color: "var(--ink-muted)" },
  none: { glyph: "—", label: "—", color: "var(--ink-muted)" },
  future: { glyph: "—", label: "—", color: "var(--ink-muted)" },
} as const;

export type PillStatus = keyof typeof STATUS_RENDER;
export type PillReportStatus = "Submitted" | "InReview" | "Evaluated" | null;

export function StatusPill({
  status,
  reportStatus = null,
}: {
  status: PillStatus;
  reportStatus?: PillReportStatus;
}) {
  const r = STATUS_RENDER[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
      style={{ color: r.color, borderColor: "var(--line)" }}
      data-status={status}
    >
      <span aria-hidden="true">{r.glyph}</span>
      {r.label}
      {reportStatus === "InReview" && (
        <span style={{ color: "var(--st-review)" }}>&middot; In review</span>
      )}
      {reportStatus === "Evaluated" && (
        <span style={{ color: "var(--ink)" }}>&middot; Evaluated (locked)</span>
      )}
    </span>
  );
}
```

`panel.tsx`, `page-title.tsx`, `section-label.tsx`, `empty-state.tsx`:

```tsx
// panel.tsx
import type { ReactNode } from "react";
export function Panel({ children, sunk = false }: { children: ReactNode; sunk?: boolean }) {
  return (
    <div
      className="rounded-[var(--radius-panel)] border p-6"
      style={{
        background: sunk ? "var(--surface-sunk)" : "var(--surface)",
        borderColor: "var(--line)",
      }}
    >
      {children}
    </div>
  );
}

// page-title.tsx
import type { ReactNode } from "react";
export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1
      className="mb-6 text-2xl font-bold"
      style={{ color: "var(--ink)", letterSpacing: "-0.03em", textWrap: "balance" }}
    >
      {children}
    </h1>
  );
}

// section-label.tsx
import type { ReactNode } from "react";
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
      {children}
    </div>
  );
}

// empty-state.tsx — §11: empty states are invitations, never "Nothing here".
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-8 text-center">
      <p style={{ color: "var(--ink)" }}>{title}</p>
      {hint !== undefined && (
        <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>{hint}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Sign-out in the topbar (D7)**

`topbar.tsx` becomes an async-friendly server component with a form action (Server Action):

```tsx
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

// inside the right-hand cluster, after the user name:
<form
  action={async () => {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }}
>
  <Button type="submit" variant="quiet">Sign out</Button>
</form>
```

(Topbar is currently a plain function component rendered from a server layout — inline `"use server"` actions require the component itself to be a Server Component, which it is: no `"use client"` directive. If the existing `app-frame.test.tsx` renders Topbar directly under jsdom, the inline action serialisation may need the test to assert on the form's presence rather than invoke it.)

- [ ] **Step 4: Migrate the three pages**

`(app)/page.tsx`, `(auth)/signin/sign-in-panel.tsx`, `(auth)/not-registered/page.tsx`: replace hand-rolled `<h1 style=…>` with `PageTitle`, the uppercase `<dt>`/label styling with `SectionLabel`, card `<div style=…>` wrappers with `Panel`, and any `<button>` with `Button`. **Page-local `style={{...}}` typography does not survive review (spec §5)** — colour/layout inline styles tied to tokens may stay; font-size/weight/tracking belongs to the primitives. Behaviour must not change: `data-testid` attributes stay.

- [ ] **Step 5: Tests + build**

`apps/web/test/ui-primitives.test.tsx`: Button renders all three variants + disabled + `aria-busy` when loading; StatusPill renders glyph + label for every status and appends the review/evaluated suffix; EmptyState renders title + hint. Run:

```
pnpm --filter @irp/web test
$env:AUTH_DEV_BYPASS='false'; pnpm --filter @irp/web build
```

Expected: all green; build passes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/
git commit -m "feat(web): shared UI primitives, page migration, topbar sign-out (D7, D8)"
```

---

### Task 12: Student Today page — the under-2-minutes submission path (FR-10..FR-17, NFR-9)

**Files:**
- Modify: `apps/web/app/(app)/page.tsx` (role branch)
- Create: `apps/web/app/(app)/student-today.tsx` (server component)
- Create: `apps/web/app/(app)/entry-actions.ts` (Server Actions)
- Create: `apps/web/app/(app)/entry-composer.tsx` (client component)
- Modify: `apps/web/package.json` (add `"@irp/core": "workspace:*"` dependency), plus `pnpm install`
- Test: `apps/web/test/entry-composer.test.tsx`

**Interfaces:**
- Consumes: generated SDK ops `createEntry`, `listMyDays`, `createAbsence`, `deleteAbsence` from `@irp/client`; `apiClient()` from `lib/api-client.ts`; `submissionWindow` from `@irp/core`; Task 11 primitives.
- Produces: Server Actions
  ```typescript
  submitEntry(formData: FormData): Promise<void | { error: string }>
  markAbsent(formData: FormData): Promise<void | { error: string }>
  removeAbsence(date: string): Promise<void | { error: string }>
  ```
  Each calls the SDK, surfaces the RFC 7807 `detail` on failure, and `revalidatePath("/")` on success.

- [ ] **Step 1: Add `@irp/core` to `apps/web` and install**

`apps/web/package.json` dependencies: `"@irp/core": "workspace:*"`. Run `pnpm install`. **Dockerfile check:** `packages/core/` is already COPY'd in the `deps`/`build`/`prod-deps` stages (it predates this plan), so no Dockerfile change — verify by reading the three stage manifest lists; this is the Plan 5 `@irp/fixtures` lesson applied in advance.

- [ ] **Step 2: Server Actions — `entry-actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createEntry, createAbsence, deleteAbsence } from "@irp/client";
import { apiClient } from "@/lib/api-client";

interface ProblemLike {
  detail?: string;
  title?: string;
}

function problemMessage(error: unknown, fallback: string): string {
  const p = error as ProblemLike | undefined;
  return p?.detail ?? p?.title ?? fallback;
}

export async function submitEntry(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const client = await apiClient();
  const { error } = await createEntry({
    client,
    body: {
      entryDate: String(formData.get("entryDate")),
      body: String(formData.get("body")),
    },
  });
  if (error !== undefined) return { error: problemMessage(error, "The entry was not accepted.") };
  revalidatePath("/");
  return null;
}

export async function markAbsent(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const client = await apiClient();
  const { error } = await createAbsence({
    client,
    body: {
      date: String(formData.get("date")),
      reason: String(formData.get("reason")),
    },
  });
  if (error !== undefined) return { error: problemMessage(error, "The absence was not recorded.") };
  revalidatePath("/");
  return null;
}

export async function removeAbsence(date: string): Promise<{ error: string } | null> {
  const client = await apiClient();
  const { error } = await deleteAbsence({ client, path: { date } });
  if (error !== undefined) return { error: problemMessage(error, "The absence was not removed.") };
  revalidatePath("/");
  return null;
}
```

(Exact SDK call shapes — `body:`/`path:`/`query:` — come from the generated `packages/client`; check `packages/client/src` after `pnpm generate` and match them. `@hey-api/openapi-ts` emits one function per operationId with a typed options object.)

- [ ] **Step 3: The page**

`(app)/page.tsx` branches on role:

```tsx
import { getCurrentUserOrRedirect } from "@/lib/api-client";
import { StudentToday } from "./student-today";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";

export default async function TodayPage() {
  const user = await getCurrentUserOrRedirect();
  if (user.role === "Student") return <StudentToday />;
  return (
    <div>
      <PageTitle>Today</PageTitle>
      <Panel>
        <SectionLabel>Signed in as</SectionLabel>
        <p style={{ color: "var(--ink)" }} data-testid="user-name">{user.displayName}</p>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>
          The batch dashboard arrives with Plan 7. Use Roster to review today&apos;s submissions.
        </p>
      </Panel>
    </div>
  );
}
```

`student-today.tsx` (server component): compute `const window = submissionWindow(new Date());` — `window.targetDates` are the only submittable dates (FR-15 by construction in the UI too); fetch today's cycle days via `listMyDays({ client })` and pick the entries/absence for each target date. Render: `PageTitle` "Today"; the `EntryComposer` (pass `targetDates` and per-date absence state); beneath it, for each target date, the existing entries (body + submitted time + Late/Extra flag text) inside a `Panel`, and the absence toggle — a form posting `markAbsent` (date + reason inputs) when no absence and no entries, or the recorded reason with a quiet remove `Button` posting `removeAbsence` when marked. Deadline copy per §11: `You can still submit for {date} until {graceClosesAt formatted in Asia/Colombo}` — format with `Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", … })`.

- [ ] **Step 4: The composer (client)**

`entry-composer.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { submitEntry } from "./entry-actions";

export function EntryComposer({ targetDates }: { targetDates: string[] }) {
  const [state, action, pending] = useActionState(submitEntry, null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <SectionLabel>Submit an update</SectionLabel>
      <select
        name="entryDate"
        defaultValue={targetDates[targetDates.length - 1]}
        aria-label="Entry date"
        className="rounded-[var(--radius-control)] border px-3 py-2"
        style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
      >
        {targetDates.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <textarea
        name="body"
        required
        maxLength={4000}
        rows={4}
        placeholder="What did you work on?"
        aria-label="Entry text"
        className="rounded-[var(--radius-control)] border px-3 py-2"
        style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
      />
      {state !== null && (
        <p role="alert" className="text-sm" style={{ color: "var(--st-missed)" }}>{state.error}</p>
      )}
      <div>
        <Button type="submit" loading={pending}>Submit update</Button>
      </div>
    </form>
  );
}
```

(The date `<select>` lists only legal targets — older dates are simply not offered; the API still enforces the window authoritatively.)

- [ ] **Step 5: Tests + build**

`apps/web/test/entry-composer.test.tsx` (jsdom): renders only the given target dates as options; shows the error `role="alert"` when the action state carries one (drive `useActionState` by mocking the action module with `vi.mock("./entry-actions", …)` and rendering; assert the submit button disables while pending is impractical under jsdom — assert markup contract instead). Run `pnpm --filter @irp/web test`, then `$env:AUTH_DEV_BYPASS='false'; pnpm --filter @irp/web build`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/ pnpm-lock.yaml
git commit -m "feat(web): student Today -- compose, legal targets only, absence toggle (FR-10..FR-17, NFR-9)"
```

---

### Task 13: Mentor Roster page

**Files:**
- Create: `apps/web/app/(app)/roster/page.tsx`
- Modify: `apps/web/components/app-frame/sidebar.tsx` (Roster + Students become links; role-gated nav)
- Modify: `apps/web/app/(app)/layout.tsx` (pass the user's role to `Sidebar`)
- Test: `apps/web/test/roster-page.test.tsx` (light), existing `app-frame.test.tsx` updated for the role prop

**Interfaces:**
- Consumes: SDK `listBatches`, `getBatchRoster`; Task 11 primitives; `searchParams` (`batchId`, `date`).
- Produces: route `/roster`; `Sidebar` gains `role: "Admin" | "Student"` prop — students see `Today · My month` (My month stays a non-link until Plan 7), mentors see `Today · Roster · Review · Cycles · Students` with Roster/Students as links (Review/Cycles stay non-links until their pages exist — Review's page lands in Task 14, which flips it to a link there).

- [ ] **Step 1: Sidebar role gating**

`sidebar.tsx` — replace the single `DESTINATIONS` list:

```tsx
const MENTOR_DESTINATIONS = [
  { label: "Today", href: "/" },
  { label: "Roster", href: "/roster" },
  { label: "Review" },            // link in Task 14
  { label: "Cycles" },            // Plan 7
  { label: "Students", href: "/students" }, // link real in Task 15; until then keep it label-only — add href in Task 15, not here
] as const;

const STUDENT_DESTINATIONS = [
  { label: "Today", href: "/" },
  { label: "My month" },          // Plan 7
] as const;

export function Sidebar({ role, reviewCount = 0 }: { role: "Admin" | "Student"; reviewCount?: number }) {
  const destinations = role === "Admin" ? MENTOR_DESTINATIONS : STUDENT_DESTINATIONS;
  // …existing render loop unchanged, over `destinations`…
}
```

**Important:** `typedRoutes: true` — a `href` may only appear in the same task that creates its page. In THIS task only `/roster` becomes a link; `Students` stays label-only (Task 15 adds `href: "/students"`).

`layout.tsx`: `<Sidebar role={user.role} />`.

- [ ] **Step 2: The page**

`roster/page.tsx` (server component, `searchParams: Promise<{ batchId?: string; date?: string }>` — Next 16 async searchParams):

```tsx
import Link from "next/link";
import { getCurrentUserOrRedirect, apiClient } from "@/lib/api-client";
import { redirect } from "next/navigation";
import { listBatches, getBatchRoster } from "@irp/client";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string; date?: string }>;
}) {
  const user = await getCurrentUserOrRedirect();
  if (user.role !== "Admin") redirect("/");
  const { batchId, date } = await searchParams;

  const client = await apiClient();
  const { data: batches } = await listBatches({ client });
  if (batches === undefined || batches.length === 0) {
    return (
      <div>
        <PageTitle>Roster</PageTitle>
        <Panel>
          <EmptyState title="No batches yet." hint="Create one from the Students page." />
        </Panel>
      </div>
    );
  }
  const selected = batches.find((b) => b.id === batchId) ?? batches[0]!;
  const { data: rows, error } = await getBatchRoster({
    client,
    path: { id: selected.id },
    query: date === undefined ? {} : { date },
  });
  // …render: batch picker as a row of <Link href={{ pathname: "/roster", query: { batchId: b.id } }}>,
  // a date <form method="get"> with <input type="date" name="date" defaultValue={date}> and hidden batchId,
  // then a table: name · StatusPill(status, reportStatus) · entry count · "+N extra" when
  // extraCountThisCycle > 0 · absence reason · record indicator (✓ recorded / — none) ·
  // a Review link per row: <Link href={{ pathname: `/review/${row.student.id}` }}> — typedRoutes:
  // this link lands in Task 14 together with the page; render the cell as plain text until then.
}
```

Rows table: 13px, 8–12px row padding (`--surface`, dense core per design-system §5); `tabular` class on figures. On `error`, render `Panel` with the problem `detail`.

- [ ] **Step 3: Tests + build**

`roster-page.test.tsx`: mock `@irp/client` + `@/lib/api-client`; assert redirect for a Student role (mock `next/navigation` `redirect` to throw a sentinel), empty state without batches, a row renders name + pill + `+2 extra` when the fixture says so. Update `app-frame.test.tsx` for the `role` prop (both variants render the right destination sets). Run web tests + production build (`AUTH_DEV_BYPASS=false`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/
git commit -m "feat(web): mentor roster -- batch/date picker over engine-classified rows (FR-28 groundwork)"
```

---
### Task 14: Mentor Review page

One student × one cycle: day-by-day rolled-up entries (newest first — brief R5), absence reasons, the mentor's attendance/tasks form (FR-19), and the transition control (FR-18). Evaluated days render locked (FR-20).

**Files:**
- Create: `apps/web/app/(app)/review/page.tsx` (no student selected — points at the roster)
- Create: `apps/web/app/(app)/review/[studentId]/page.tsx`
- Create: `apps/web/app/(app)/review/[studentId]/review-actions.ts` (Server Actions)
- Create: `apps/web/app/(app)/review/[studentId]/day-record-form.tsx` (client)
- Modify: `apps/web/components/app-frame/sidebar.tsx` (Review becomes a link to `/review`)
- Modify: `apps/web/app/(app)/roster/page.tsx` (each row's Review cell becomes a real `<Link>` to `/review/[studentId]`)
- Test: `apps/web/test/review-page.test.tsx`

**Interfaces:**
- Consumes: SDK `listStudentDays`, `transitionDailyReport`, `upsertDayRecord`, `listUsers`; Task 11 primitives; `useActionState` pattern from Task 12.
- Produces: routes `/review` and `/review/[studentId]`; Server Actions
  ```typescript
  transitionReport(reportId: string, to: "InReview" | "Evaluated"): Promise<{ error: string } | null>
  saveDayRecord(prev, formData): Promise<{ error: string } | null>   // fields: studentId, date, attended?, tasksCompleted?, note
  ```

- [ ] **Step 1: `/review` landing**

`review/page.tsx`: `getCurrentUserOrRedirect`; non-Admin → `redirect("/")`; render `PageTitle` "Review" + `Panel` > `EmptyState title="Pick a student from the roster." hint="Every roster row links to that student's review view."` with a `Link` to `/roster`. Sidebar: `{ label: "Review", href: "/review" }` (page now exists — typedRoutes satisfied). Roster rows: replace the plain-text cell with `<Link href={`/review/${row.student.id}`}>Review</Link>` — typed dynamic routes accept template literals for `[param]` segments; if the compiler wants the object form use `{ pathname: "/review/[studentId]", query: … }` per Next 16 typed-routes docs — whichever form `pnpm --filter @irp/web build` accepts is the one that ships.

- [ ] **Step 2: Server Actions — `review-actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { transitionDailyReport, upsertDayRecord } from "@irp/client";
import { apiClient } from "@/lib/api-client";

function problemMessage(error: unknown, fallback: string): string {
  const p = error as { detail?: string; title?: string } | undefined;
  return p?.detail ?? p?.title ?? fallback;
}

export async function transitionReport(
  studentId: string,
  reportId: string,
  to: "InReview" | "Evaluated",
): Promise<{ error: string } | null> {
  const client = await apiClient();
  const { error } = await transitionDailyReport({
    client,
    path: { id: reportId },
    body: { to },
  });
  if (error !== undefined) return { error: problemMessage(error, "The transition was rejected.") };
  revalidatePath(`/review/${studentId}`);
  return null;
}

export async function saveDayRecord(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const client = await apiClient();
  const note = String(formData.get("note") ?? "").trim();
  const { error } = await upsertDayRecord({
    client,
    path: { id: String(formData.get("studentId")), date: String(formData.get("date")) },
    body: {
      attended: formData.get("attended") === "on",
      tasksCompleted: formData.get("tasksCompleted") === "on",
      ...(note === "" ? {} : { note }),
    },
  });
  if (error !== undefined) return { error: problemMessage(error, "The record was not saved.") };
  revalidatePath(`/review/${String(formData.get("studentId"))}`);
  return null;
}
```

- [ ] **Step 3: The page**

`review/[studentId]/page.tsx` (params are async in Next 16: `params: Promise<{ studentId: string }>`): Admin-gate; resolve the student's display name via `listUsers({ client, query: { role: "Student" } })` (find by id — no per-id endpoint exists and the list is ≤10 in v1; note this in a comment). Fetch `listStudentDays({ client, path: { id: studentId } })` (default range = current cycle). Render newest-first (`[...days].reverse()`): for each day a `Panel` with the date + `StatusPill(day.status, day.reportStatus)`; entries' bodies + submitted instants; absence reason when present; the `DayRecordForm` (weekdays only — hide on weekends); and the transition control:

- `reportStatus === "Submitted"` → `<form action={transitionReport.bind(null, studentId, day.reportId!, "InReview")}><Button variant="quiet">Start review</Button></form>`
- `"InReview"` → same shape, `"Evaluated"`, label `Mark evaluated`
- `"Evaluated"` → the locked affordance: `Evaluated (locked)` text via the pill; no buttons; the day's form is not rendered (FR-20 — the API also refuses).

- [ ] **Step 4: The day-record form (client)**

`day-record-form.tsx` — `useActionState(saveDayRecord, null)`; hidden `studentId`/`date` inputs; two labelled checkboxes (`attended`, `tasksCompleted`) defaulting from the roster's record when passed (pass `defaults?: { attended: boolean; tasksCompleted: boolean; note: string | null }` — the page does not have the record; fetch presence via the day view only, so pass `undefined` and let the form start unchecked with a `Saved records overwrite on save` hint); a `note` text input (maxLength 500); quiet `Button` "Save record"; `role="alert"` error line like Task 12.

- [ ] **Step 5: Tests + build + commit**

`review-page.test.tsx`: mocked SDK — renders days newest-first; locked day hides the form and buttons; Submitted day shows "Start review". Run web tests + `AUTH_DEV_BYPASS=false` build.

```bash
git add apps/web/
git commit -m "feat(web): mentor review -- day-by-day roll-up, records, forward-only transitions (FR-18..FR-20)"
```

---

### Task 15: Mentor Students page — register, create batch, transfer, archive

**Files:**
- Create: `apps/web/app/(app)/students/page.tsx`
- Create: `apps/web/app/(app)/students/admin-actions.ts` (Server Actions)
- Create: `apps/web/app/(app)/students/forms.tsx` (client components)
- Modify: `apps/web/components/app-frame/sidebar.tsx` (Students becomes a link)
- Test: `apps/web/test/students-page.test.tsx`

**Interfaces:**
- Consumes: SDK `createUser`, `listUsers`, `createBatch`, `listBatches`, `transferStudent`, `archiveUser`; Task 11 primitives.
- Produces: route `/students`; Server Actions `registerUser`, `addBatch`, `transferStudentAction`, `archiveUserAction` — same `{ error } | null` + `revalidatePath("/students")` contract as Tasks 12/14.

- [ ] **Step 1: Server Actions**

`admin-actions.ts` — four actions following the exact Task 12 pattern (`"use server"`, `apiClient()`, SDK call, `problemMessage`, `revalidatePath("/students")`). `registerUser` reads `role`, `email`, `displayName`, `externalId`, and — when role is `Student` — `batchId` + `startDate` into the nested `enrolment` object; it must NOT send `enrolment` for mentors (the API 400s otherwise, by design). `archiveUserAction(userId: string)` and `transferStudentAction` (fields `studentId`, `toBatchId`, `effectiveDate`) are bound/form variants respectively.

- [ ] **Step 2: The page**

`students/page.tsx`: Admin-gate (redirect like roster); `searchParams: Promise<{ view?: string }>` — `view=archived` renders the FR-5 read-only archive list (`listUsers({ query: { archived: true } })`, names + emails, no actions) with a link back; default view renders four `Panel`s:
1. **Register** — `RegisterForm` (client): role select (Student/Mentor), email, display name, externalId, and — shown for Student via `useState` on the select — batch select (from `listBatches`, passed as props) + start date input.
2. **Create batch** — name, startDate, endDate inputs + quiet Button.
3. **Transfer** — student select (active students, passed as props), target batch select, effective date.
4. **People** — the active directory: rows of name · email · role · archive `Button variant="danger"` (`archiveUserAction.bind(null, u.id)`) — the API refuses self-archive with 409; surface that `detail` like every other error. Link to `?view=archived`.

Sidebar: `{ label: "Students", href: "/students" }`.

- [ ] **Step 3: Tests + build + commit**

`students-page.test.tsx`: mocked SDK — archive view lists archived users without action buttons; default view renders all four panels; RegisterForm hides batch/startDate for Mentor role. Run web tests + `AUTH_DEV_BYPASS=false` build.

```bash
git add apps/web/
git commit -m "feat(web): students admin page -- register, batches, transfer, archive (FR-3, FR-5, FR-6, FR-8)"
```

---

### Task 16: End-to-end suite, docs, and final verification

**Files:**
- Create: `apps/web/e2e/student-flows.spec.ts`, `apps/web/e2e/mentor-flows.spec.ts`
- Modify: `apps/web/e2e/README.md` (flows documented), `handoff.md` (§2a Plan 6 row → note PR; "What exists now" additions)
- Test: the full 8-gate verification

**Interfaces:**
- Consumes: the seeded personas (`@irp/fixtures` — `dev-student-1` compliant, `seed-student-b2` weekend, `seed-student-a5` archived…), the existing Playwright sign-in helper from `signin.spec.ts` (dev-identity picker flow), dev servers + seeded DB.
- Produces: an e2e suite covering spec §7's Plan 6 rows.

- [ ] **Step 1: Seed + servers**

Playwright runs against `next dev` with `AUTH_DEV_BYPASS=true` (CLAUDE.md — a production build cannot host the bypass). Re-seed first: `$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'; pnpm --filter @irp/api run db:seed`. Check `apps/web/playwright.config.ts` for how the API/web servers are started (webServer entries) — extend, don't replace; the generous expect timeout is deliberate (first-compile cost) — **do not tidy it down**.

- [ ] **Step 2: `student-flows.spec.ts`**

Sign in as `Dev Student` (dev-student-1) through the picker (reuse the exact selectors from `signin.spec.ts`):
1. **Submit on-time:** type into the composer, submit for the default (today) target; expect the entry body to appear and — via a fresh `GET` of the page — no Late flag text.
2. **Late target offered, never older:** the date select contains only the legal window targets (compare against the visible option count: 2 on a weekday mid-week, more across a weekend — assert every option is ≥ the previous weekday, not a fixed count).
3. **Absence round-trip:** mark the previous weekday absent with a reason (only when it holds no entry — pick the target the seed leaves empty for this persona, or first delete nothing: the compliant persona has entries on required days, so use "today" before submitting any entry in a serial test ordered before step 1, or register the absence on today for `seed-student-b3` the joiner — choose ONE persona/day the seed provably leaves empty and document the choice in the spec file).
4. **Locked-day refusal:** as the persona whose report the seed sets `EVALUATED` (find it: `run-seed.ts` sets EVALUATED on early days of batch-A students), attempt a submission for that date if it is inside the window — otherwise assert the day renders as locked in the day list (the honest check given relative dates; write which branch ran into the test report).
5. **Student blocked from mentor pages:** `page.goto("/roster")` → lands back on `/` (redirect); `page.goto("/students")` → same.
6. **Sign out:** click Sign out; expect the sign-in page.

- [ ] **Step 3: `mentor-flows.spec.ts`**

Sign in as `Dev Mentor`:
1. **Roster:** open Roster; expect one row per Batch-A student on the default date; the weekend persona (`Dilini Rathnayake`) shows `+N extra` on a roster date inside the current cycle — pick last Saturday via the date input when the cycle contains one, else skip with an annotation (relative-date honesty).
2. **Roster → Review → record → transition → lock:** click a row's Review link for a student with a `Submitted` report (the seed guarantees `SUBMITTED` days exist — mixed persona); save an attendance record (checkboxes + note); click Start review → pill shows In review; Mark evaluated → pill shows Evaluated (locked) and the form disappears.
3. **Archive flow:** on Students, archive a non-self student (pick `Chamodi Herath`); expect them gone from the active directory and present under the archived view; then re-run `db:seed` in the test's cleanup (`execSync`) to restore — or archive→verify→leave and let the next seed run restore; document the choice.
4. **Students page registration:** register a throwaway student into Batch Basalt (unique email via `Date.now()` suffix); expect them in the roster; the next `db:seed` does NOT remove them (they are not in `SEED_EXTERNAL_IDS`) — so delete (archive) them in the same test to keep the dev DB tidy.

- [ ] **Step 4: Docs**

`apps/web/e2e/README.md`: add the two new spec files, the persona-to-flow mapping, and the re-seed instruction. `handoff.md`: extend "What exists now" with the Plan 6 API surface + pages (keep §2a's row as set at branch start; the merge flips it).

- [ ] **Step 5: The full verification set (all eight gates)**

```
pnpm lint                                                     → exit 0
pnpm typecheck                                                → exit 0
$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'; pnpm --filter @irp/api test   → all pass
pnpm --filter @irp/web test                                   → all pass
pnpm spec:lint                                                → zero errors, zero warnings
$env:AUTH_DEV_BYPASS='false'; pnpm --filter @irp/web build    → succeeds
pnpm --filter @irp/api run db:seed                            → clean
pnpm --filter @irp/web exec playwright test                   → all pass (dev servers per playwright.config.ts)
```

Plus the container proof (the Plan 5 lesson): `docker build --target web .` and `docker build --target api .` must succeed locally before the PR — new workspace wiring (`@irp/core` in apps/web) exercises the Dockerfile.

- [ ] **Step 6: Commit**

```bash
git add apps/web/e2e/ apps/web/e2e/README.md handoff.md
git commit -m "test(e2e): submission and review flows over seeded personas; docs refreshed"
```

---

## Self-review checklist (for the planner, before first task dispatch)

- **Spec §4 coverage:** every Plan 6 endpoint in the spec table has a task — entries (4), me/days (5), absences (6), batches+roster (7), transition+day-records+student days (8), users (9), transfer+archive (10). Dashboard endpoints are Plan 7 by design.
- **Spec §5 coverage:** primitives+sign-out (11), student Today (12), Roster (13), Review (14), Students (15). Cycles page + My month + mentor Today dashboard are Plan 7. Dev picker already covers personas (Plan 5).
- **Carried decisions:** Tasks 1–3 = ledger items 1–3, each with its ADR.
- **Type consistency spot-checks:** `DayView`/`toApiDay` (5) is what 7/8 consume; `requireStudent` (4) used by 6; `requireAdmin` (7) used by 8/9/10; `REPORT_STATUS_TO_API` (5) used by 8; fixture personas named in 16 exist in `@irp/fixtures`.
- **Known see-and-adjust points (implementers: verify, don't assume):** generated SDK option shapes (`body`/`path`/`query`), the Prisma relation field name on `Enrolment`, whether `24f876a` already shipped button CSS, seed personas' exact EVALUATED days, Playwright webServer config shape.
