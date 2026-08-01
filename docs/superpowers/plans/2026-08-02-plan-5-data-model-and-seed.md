# Plan 5 — Full Data Model + Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The complete Slice 2 Prisma schema (spec §3), a repository layer that keeps `CivilDate` semantics at the database boundary, cycle materialisation, and an idempotent engine-driven seed of 2 batches × 5 students covering every edge-case persona (spec §6).

**Architecture:** Schema-first: one migration adds nine tables around the existing `User`. Repositories own persistence and *state* invariants; *time-based request* validation (is this window open **now**) is deliberately deferred to Plan 6's service layer — repositories accept historical `submittedAt` instants and validate flags against **that instant**, which is what lets the seed create honest history through the same code paths production uses. A tiny `@irp/fixtures` package is the single source of persona identity shared by the seed and the web dev-identity picker, so they cannot drift.

**Tech Stack:** Prisma 7.9.1 (driver adapter, ADR-0008) · PostgreSQL 16 · `@irp/core` date engine · Vitest 4.1.10 · tsx 4.23.1.

**Spec:** `docs/superpowers/specs/2026-08-02-slice-2-product-design.md` §3, §6, §8. Branch: `feat/plan-5-data-model-and-seed` (already exists, carries the spec).

## Global Constraints

- Pinned versions per CLAUDE.md — do not bump anything.
- `spec/openapi.yaml` does **not** change in this plan (spec §8: no API surface change).
- Never hand-edit `apps/api/src/generated/prisma` — regenerate with `pnpm --filter @irp/api db:generate`.
- Civil dates are Postgres `DATE` ⇄ `CivilDate` strings; instants are UTC `timestamptz`. No Colombo-local instants in any column (spec §3).
- Every DB test creates its own rows in-file; suites `TRUNCATE` and Vitest order is unstable.
- Windows dev machine: DB is `postgresql://irp:irp@127.0.0.1:5433/irp?schema=public` (container `apps/api/docker-compose.yml` with `IRP_DB_PORT=5433`). Set `$env:DATABASE_URL` for prisma/vitest commands.
- Conventional commits; end commit messages with the Claude Code trailer used by this repo.
- "Missed" is never stored — always computed (spec §3).
- The seed never hand-sets `isLate`/`isExtra` — flags come from engine calls with historical instants (spec §6).

**Working days note for implementers:** run `pnpm generate` once after cloning/switching branches or typecheck fails (generated packages are git-ignored). After Task 1, run `pnpm --filter @irp/api db:generate` before anything that imports the Prisma client.

---

### Task 1: Schema + migration + reset helper

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_slice_2_domain/migration.sql` (generated, then hand-extended for one partial unique index)
- Modify: `apps/api/test/helpers/db.ts`
- Test: `apps/api/test/schema.test.ts`

**Interfaces:**
- Consumes: existing `User` model, `createPrismaClient(databaseUrl)`.
- Produces: Prisma models `Batch`, `Enrolment`, `Entry`, `DailyReport` (+enum `DailyReportStatus`), `MentorDayRecord`, `AbsenceRecord`, `Cycle`, `Evaluation`, `Override`, `Award`; `resetDb` truncating the whole graph. Later tasks rely on exact field names below.

- [ ] **Step 1: Extend the schema**

Append to `apps/api/prisma/schema.prisma` (and add the listed back-relation fields to `User`):

```prisma
model User {
  id          String    @id @default(uuid())
  externalId  String    @unique // Entra oid claim
  email       String    @unique
  displayName String
  role        Role
  deletedAt   DateTime? @db.Timestamptz(3)
  createdAt   DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime  @updatedAt @db.Timestamptz(3)

  enrolments       Enrolment[]
  entries          Entry[]
  reports          DailyReport[]     @relation("StudentReports")
  reviewedReports  DailyReport[]     @relation("ReviewedReports")
  dayRecords       MentorDayRecord[] @relation("StudentDayRecords")
  recordedRecords  MentorDayRecord[] @relation("RecordedDayRecords")
  absences         AbsenceRecord[]
  evaluations      Evaluation[]
  overrides        Override[]
}

/// FR-6. startDate is the admission date anchoring cycle numbering (FR-9).
model Batch {
  id        String   @id @default(uuid())
  name      String   @unique
  startDate DateTime @db.Date
  endDate   DateTime @db.Date
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  enrolments Enrolment[]
  cycles     Cycle[]
}

/// FR-8. Transfer = close one row, open the next. History follows the student.
model Enrolment {
  id        String    @id @default(uuid())
  studentId String
  batchId   String
  startDate DateTime  @db.Date
  endDate   DateTime? @db.Date
  createdAt DateTime  @default(now()) @db.Timestamptz(3)

  student User  @relation(fields: [studentId], references: [id])
  batch   Batch @relation(fields: [batchId], references: [id])

  @@index([studentId])
  @@index([batchId])
}

/// FR-10/11/13/33. Flags are computed AT SUBMISSION TIME and stored.
model Entry {
  id          String   @id @default(uuid())
  studentId   String
  entryDate   DateTime @db.Date
  body        String
  submittedAt DateTime @db.Timestamptz(3)
  isLate      Boolean
  isExtra     Boolean
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  student User @relation(fields: [studentId], references: [id])

  @@index([studentId, entryDate])
}

/// FR-18/20. No Rejected state — confirmed non-goal.
enum DailyReportStatus {
  SUBMITTED
  IN_REVIEW
  EVALUATED
}

model DailyReport {
  id           String            @id @default(uuid())
  studentId    String
  reportDate   DateTime          @db.Date
  status       DailyReportStatus @default(SUBMITTED)
  reviewedById String?
  inReviewAt   DateTime?         @db.Timestamptz(3)
  evaluatedAt  DateTime?         @db.Timestamptz(3)
  createdAt    DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime          @updatedAt @db.Timestamptz(3)

  student    User  @relation("StudentReports", fields: [studentId], references: [id])
  reviewedBy User? @relation("ReviewedReports", fields: [reviewedById], references: [id])

  @@unique([studentId, reportDate])
}

/// FR-19. Deliberately independent of DailyReport: the mentor's record must
/// exist for a day with no entries at all (attended but never submitted).
model MentorDayRecord {
  id             String   @id @default(uuid())
  studentId      String
  date           DateTime @db.Date
  attended       Boolean
  tasksCompleted Boolean
  note           String?
  recordedById   String
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @db.Timestamptz(3)

  student    User @relation("StudentDayRecords", fields: [studentId], references: [id])
  recordedBy User @relation("RecordedDayRecords", fields: [recordedById], references: [id])

  @@unique([studentId, date])
}

/// FR-16. Weekday-only is a service-layer rule; the row itself is timeless.
model AbsenceRecord {
  id        String   @id @default(uuid())
  studentId String
  date      DateTime @db.Date
  reason    String
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  student User @relation(fields: [studentId], references: [id])

  @@unique([studentId, date])
}

/// FR-9. A cache of the engine's arithmetic so Evaluation has a stable FK.
model Cycle {
  id        String   @id @default(uuid())
  batchId   String
  seq       Int
  startDate DateTime @db.Date
  endDate   DateTime @db.Date
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  batch       Batch        @relation(fields: [batchId], references: [id])
  evaluations Evaluation[]
  award       Award?

  @@unique([batchId, seq])
  @@unique([batchId, startDate])
}

/// FR-22/23, NFR-15. Schema only in Slice 2 — no UI, no scoring code (O-5).
/// Criterion columns named from the brief's rubric table (spec §2).
model Evaluation {
  id                     String   @id @default(uuid())
  cycleId                String
  studentId              String
  attendance             Int
  taskCompletion         Int
  contributionInitiative Int
  effortTime             Int
  mentorEvaluation       Int
  performanceIndex       Decimal  @db.Decimal(5, 2)
  summary                String
  modelVersion           String
  createdAt              DateTime @default(now()) @db.Timestamptz(3)

  cycle    Cycle     @relation(fields: [cycleId], references: [id])
  student  User      @relation(fields: [studentId], references: [id])
  override Override?
  awards   Award[]

  @@unique([cycleId, studentId])
}

/// FR-24. Stores the new score, the original, and the reason.
model Override {
  id            String   @id @default(uuid())
  evaluationId  String   @unique
  mentorId      String
  newScore      Decimal  @db.Decimal(5, 2)
  originalScore Decimal  @db.Decimal(5, 2)
  reason        String
  createdAt     DateTime @default(now()) @db.Timestamptz(3)

  evaluation Evaluation @relation(fields: [evaluationId], references: [id])
  mentor     User       @relation(fields: [mentorId], references: [id])
}

/// FR-31/32. One winner per cycle (cycles are per batch).
model Award {
  id            String   @id @default(uuid())
  cycleId       String   @unique
  evaluationId  String
  justification String
  createdAt     DateTime @default(now()) @db.Timestamptz(3)

  cycle      Cycle      @relation(fields: [cycleId], references: [id])
  evaluation Evaluation @relation(fields: [evaluationId], references: [id])
}
```

- [ ] **Step 2: Create the migration without applying, then add the partial unique index**

Prisma cannot express "unique where endDate IS NULL", so create-only and hand-extend:

```powershell
$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'
pnpm --filter @irp/api exec prisma migrate dev --create-only --name slice_2_domain
```

Append to the generated `migration.sql`:

```sql
-- At most one open enrolment per student (spec §3). Partial unique index:
-- Prisma's @@unique cannot express the WHERE clause, so it lives here.
CREATE UNIQUE INDEX "Enrolment_one_open_per_student"
  ON "Enrolment" ("studentId") WHERE "endDate" IS NULL;
```

- [ ] **Step 3: Apply and regenerate**

```powershell
pnpm --filter @irp/api exec prisma migrate dev
pnpm --filter @irp/api db:generate
```

Expected: migration applies cleanly; client regenerates.

- [ ] **Step 4: Widen the reset helper**

`apps/api/test/helpers/db.ts` — `Batch` is not reachable by cascade from `User` (nothing in `Batch` references `User`), so truncate both roots:

```typescript
import type { PrismaClient } from "../../src/generated/prisma/client.js";

export async function resetDb(prisma: PrismaClient): Promise<void> {
  // CASCADE reaches every table referencing these two roots: Enrolment,
  // Entry, DailyReport, MentorDayRecord, AbsenceRecord, Cycle, Evaluation,
  // Override, Award.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "User", "Batch" RESTART IDENTITY CASCADE',
  );
}
```

- [ ] **Step 5: Write the schema round-trip test**

`apps/api/test/schema.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createPrismaClient } from "../src/db/client.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

describe.skipIf(!dbUrl)("slice 2 schema", () => {
  const prisma = createPrismaClient(dbUrl!);

  beforeEach(async () => { await resetDb(prisma); });
  afterAll(async () => { await prisma.$disconnect(); });

  async function student(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "STUDENT" },
    });
  }

  it("round-trips the whole object graph", async () => {
    const s = await student("g-1");
    const mentor = await prisma.user.create({
      data: { externalId: "g-m", email: "g-m@dev.local", displayName: "M", role: "ADMIN" },
    });
    const batch = await prisma.batch.create({
      data: { name: "Graph", startDate: new Date("2026-05-10"), endDate: new Date("2026-11-09") },
    });
    await prisma.enrolment.create({
      data: { studentId: s.id, batchId: batch.id, startDate: new Date("2026-05-10") },
    });
    await prisma.entry.create({
      data: {
        studentId: s.id, entryDate: new Date("2026-05-11"), body: "did things",
        submittedAt: new Date("2026-05-11T11:30:00Z"), isLate: false, isExtra: false,
      },
    });
    const report = await prisma.dailyReport.create({
      data: { studentId: s.id, reportDate: new Date("2026-05-11") },
    });
    expect(report.status).toBe("SUBMITTED");
    await prisma.mentorDayRecord.create({
      data: {
        studentId: s.id, date: new Date("2026-05-11"),
        attended: true, tasksCompleted: true, recordedById: mentor.id,
      },
    });
    await prisma.absenceRecord.create({
      data: { studentId: s.id, date: new Date("2026-05-12"), reason: "medical appointment" },
    });
    const cycle = await prisma.cycle.create({
      data: { batchId: batch.id, seq: 1, startDate: new Date("2026-05-10"), endDate: new Date("2026-06-09") },
    });
    const evaluation = await prisma.evaluation.create({
      data: {
        cycleId: cycle.id, studentId: s.id,
        attendance: 80, taskCompletion: 75, contributionInitiative: 70,
        effortTime: 90, mentorEvaluation: 85,
        performanceIndex: "78.25", summary: "seed", modelVersion: "none",
      },
    });
    await prisma.override.create({
      data: {
        evaluationId: evaluation.id, mentorId: mentor.id,
        newScore: "82.00", originalScore: "78.25", reason: "led the workshop",
      },
    });
    await prisma.award.create({
      data: { cycleId: cycle.id, evaluationId: evaluation.id, justification: "top of batch" },
    });
    expect(await prisma.award.count()).toBe(1);
  });

  it("rejects a second OPEN enrolment but allows sequential ones", async () => {
    const s = await student("g-2");
    const batch = await prisma.batch.create({
      data: { name: "Seq", startDate: new Date("2026-05-10"), endDate: new Date("2026-11-09") },
    });
    await prisma.enrolment.create({
      data: { studentId: s.id, batchId: batch.id, startDate: new Date("2026-05-10") },
    });
    await expect(
      prisma.enrolment.create({
        data: { studentId: s.id, batchId: batch.id, startDate: new Date("2026-06-10") },
      }),
    ).rejects.toThrow(); // partial unique index
    await prisma.enrolment.updateMany({
      where: { studentId: s.id }, data: { endDate: new Date("2026-06-09") },
    });
    await expect(
      prisma.enrolment.create({
        data: { studentId: s.id, batchId: batch.id, startDate: new Date("2026-06-10") },
      }),
    ).resolves.toBeTruthy(); // closed rows don't block a new open one
  });

  it("resetDb clears the whole graph", async () => {
    await prisma.batch.create({
      data: { name: "Gone", startDate: new Date("2026-05-10"), endDate: new Date("2026-11-09") },
    });
    await resetDb(prisma);
    expect(await prisma.batch.count()).toBe(0);
  });
});
```

- [ ] **Step 6: Run the test**

```powershell
$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'
pnpm --filter @irp/api exec vitest run test/schema.test.ts
```

Expected: 3 passing. Also run the full existing suite (`pnpm --filter @irp/api test`) — the `resetDb` widening must not break anything.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/prisma apps/api/test/helpers/db.ts apps/api/test/schema.test.ts
git commit -m "feat(api): slice 2 schema -- nine tables around User (FR-5..FR-20, FR-31..FR-33)"
```

---

### Task 2: CivilDate ⇄ DATE boundary + Colombo instants

**Files:**
- Create: `apps/api/src/db/civil-date-map.ts`
- Test: `apps/api/test/civil-date-map.test.ts`

**Interfaces:**
- Consumes: `civilDate`, `type CivilDate` from `@irp/core`.
- Produces: `toDbDate(date: CivilDate): Date` · `fromDbDate(value: Date): CivilDate` · `colomboInstant(date: CivilDate, time: string): Date`. Every repository and the seed use exactly these three.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { civilDate } from "@irp/core";
import { colomboInstant, fromDbDate, toDbDate } from "../src/db/civil-date-map.js";

describe("civil-date-map", () => {
  it("round-trips a CivilDate through the DATE representation", () => {
    const d = civilDate("2026-08-02");
    expect(fromDbDate(toDbDate(d))).toBe(d);
  });

  it("toDbDate is UTC midnight — Prisma's DATE convention", () => {
    expect(toDbDate(civilDate("2026-08-02")).toISOString()).toBe("2026-08-02T00:00:00.000Z");
  });

  it("fromDbDate never shifts a day regardless of local timezone", () => {
    // Prisma returns DATE columns as UTC midnight. Reading via UTC parts is
    // what makes this correct on any machine; .getDate() would be wrong west
    // of Greenwich.
    expect(fromDbDate(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
  });

  it("colomboInstant builds the UTC instant for a Colombo wall-clock time", () => {
    // 17:30 in Colombo (UTC+05:30) is 12:00Z.
    expect(colomboInstant(civilDate("2026-08-03"), "17:30").toISOString())
      .toBe("2026-08-03T12:00:00.000Z");
    // 03:00 Colombo is the previous UTC day — the offset must be subtracted,
    // not clamped.
    expect(colomboInstant(civilDate("2026-08-03"), "03:00").toISOString())
      .toBe("2026-08-02T21:30:00.000Z");
  });
});
```

- [ ] **Step 2: Run to verify failure**

```powershell
pnpm --filter @irp/api exec vitest run test/civil-date-map.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/api/src/db/civil-date-map.ts`:

```typescript
import { civilDate, type CivilDate } from "@irp/core";

const COLOMBO_OFFSET_MINUTES = 5 * 60 + 30;

/** CivilDate -> the UTC-midnight Date Prisma stores in a DATE column. */
export function toDbDate(date: CivilDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** The UTC-midnight Date Prisma returns for a DATE column -> CivilDate. */
export function fromDbDate(value: Date): CivilDate {
  return civilDate(value.toISOString().slice(0, 10));
}

/**
 * The UTC instant at which a Colombo wall clock shows `time` ("HH:MM") on
 * `date`. The seed uses this to write historically honest submittedAt
 * instants; nothing in this module consults the machine's own timezone.
 */
export function colomboInstant(date: CivilDate, time: string): Date {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`colomboInstant: bad time "${time}" — expected HH:MM`);
  const base = toDbDate(date).getTime();
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return new Date(base + (minutes - COLOMBO_OFFSET_MINUTES) * 60_000);
}
```

- [ ] **Step 4: Run to verify pass** — same command, expected: 4 passing.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/db/civil-date-map.ts apps/api/test/civil-date-map.test.ts
git commit -m "feat(api): CivilDate boundary for DATE columns and Colombo instants (NFR-12)"
```

---

### Task 3: Entry flags — the one place `isLate`/`isExtra` are decided

**Files:**
- Create: `apps/api/src/domain/entry-flags.ts`
- Create: `apps/api/src/domain/errors.ts`
- Test: `apps/api/test/entry-flags.test.ts`

**Interfaces:**
- Consumes: `canSubmitFor`, `endOfProgrammeDay`, `isWeekday` from `@irp/core`.
- Produces: `decideEntryFlags(target: CivilDate, submittedAt: Date): { isLate: boolean; isExtra: boolean }` throwing `SubmissionWindowClosedError`; error classes `SubmissionWindowClosedError`, `LockedDayError`, `AbsentDayConflictError`, `EntryConflictError` (all extend `DomainError` with a stable `code`). Task 5/6 repos and Plan 6 handlers consume both.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { civilDate } from "@irp/core";
import { decideEntryFlags } from "../src/domain/entry-flags.js";
import { SubmissionWindowClosedError } from "../src/domain/errors.js";

// 2026-08-03 is a Monday; 2026-08-01 a Saturday. Times below are UTC:
// Colombo midnight is 18:30Z the previous day.

describe("decideEntryFlags", () => {
  it("same-day weekday submission is on time", () => {
    // Monday 17:00 Colombo = 11:30Z
    expect(decideEntryFlags(civilDate("2026-08-03"), new Date("2026-08-03T11:30:00Z")))
      .toEqual({ isLate: false, isExtra: false });
  });

  it("next-weekday submission inside grace is late", () => {
    // For Monday's date, Tuesday 09:40 Colombo = Tuesday 04:10Z
    expect(decideEntryFlags(civilDate("2026-08-03"), new Date("2026-08-04T04:10:00Z")))
      .toEqual({ isLate: true, isExtra: false });
  });

  it("weekend submission is extra, never late", () => {
    // Saturday entry submitted Sunday is inside Saturday's grace (next
    // weekday is Monday) and still extra/not-late.
    expect(decideEntryFlags(civilDate("2026-08-01"), new Date("2026-08-02T10:00:00Z")))
      .toEqual({ isLate: false, isExtra: true });
  });

  it("a closed window throws, evaluated at the submission instant", () => {
    // Monday's grace closes Tuesday 23:59:59 Colombo; Thursday is far out.
    expect(() => decideEntryFlags(civilDate("2026-08-03"), new Date("2026-08-06T04:00:00Z")))
      .toThrow(SubmissionWindowClosedError);
  });

  it("a future-dated target throws", () => {
    expect(() => decideEntryFlags(civilDate("2026-08-04"), new Date("2026-08-03T11:30:00Z")))
      .toThrow(SubmissionWindowClosedError);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @irp/api exec vitest run test/entry-flags.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

`apps/api/src/domain/errors.ts`:

```typescript
/**
 * Domain rule violations. Plan 6 maps these onto RFC 7807 responses; Plan 5's
 * seed treats any of them as a bug in the seed itself. `code` is stable and
 * machine-readable; the message is for humans.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

export class SubmissionWindowClosedError extends DomainError {
  readonly code = "submission-window-closed";
  constructor(target: string) {
    super(`The submission window for ${target} is closed (FR-14/FR-15).`);
  }
}

export class LockedDayError extends DomainError {
  readonly code = "day-locked";
  constructor(date: string) {
    super(`${date} is Evaluated and locked for the student (FR-20).`);
  }
}

export class AbsentDayConflictError extends DomainError {
  readonly code = "absent-day-conflict";
  constructor(date: string) {
    super(`${date} is marked absent — absent and submitted are contradictory.`);
  }
}

export class EntryConflictError extends DomainError {
  readonly code = "entry-conflict";
  constructor(date: string) {
    super(`${date} already holds entries — it cannot also be marked absent.`);
  }
}

export class WeekendAbsenceError extends DomainError {
  readonly code = "weekend-absence";
  constructor(date: string) {
    super(`${date} is a weekend — there is nothing to be absent from (FR-16).`);
  }
}
```

`apps/api/src/domain/entry-flags.ts`:

```typescript
import { canSubmitFor, endOfProgrammeDay, isWeekday, type CivilDate } from "@irp/core";
import { SubmissionWindowClosedError } from "./errors.js";

export interface EntryFlags {
  isLate: boolean;
  isExtra: boolean;
}

/**
 * The single place isLate/isExtra are decided (spec §3: computed at
 * submission time and stored).
 *
 * Deliberately evaluated against `submittedAt`, NOT wall-clock now: flags
 * describe the submission instant, so replaying history (the seed) and
 * serving a live request (Plan 6, which passes new Date()) go through the
 * identical rule. A target whose window was closed AT THAT INSTANT throws —
 * the seed cannot fabricate an entry the system would never have accepted.
 */
export function decideEntryFlags(target: CivilDate, submittedAt: Date): EntryFlags {
  if (!canSubmitFor(target, submittedAt)) {
    throw new SubmissionWindowClosedError(target);
  }
  if (!isWeekday(target)) {
    return { isLate: false, isExtra: true }; // FR-33: optional days are never late
  }
  return {
    isLate: submittedAt.getTime() > endOfProgrammeDay(target).getTime(),
    isExtra: false,
  };
}
```

- [ ] **Step 4: Run to verify pass** — same command, expected: 5 passing.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/domain apps/api/test/entry-flags.test.ts
git commit -m "feat(api): entry flag rule -- late/extra decided once, at the submission instant (FR-13, FR-33)"
```

---

### Task 4: Batch + enrolment repository

**Files:**
- Create: `apps/api/src/db/batch-repo.ts`
- Test: `apps/api/test/batch-repo.test.ts`

**Interfaces:**
- Consumes: Prisma models from Task 1; `toDbDate`/`fromDbDate` from Task 2.
- Produces:

```typescript
interface BatchRecord { id: string; name: string; startDate: CivilDate; endDate: CivilDate }
interface EnrolmentRecord {
  id: string; studentId: string; batchId: string;
  startDate: CivilDate; endDate: CivilDate | null;
}
interface BatchRepo {
  create(input: { name: string; startDate: CivilDate; endDate: CivilDate }): Promise<BatchRecord>;
  list(): Promise<BatchRecord[]>;
  enrol(studentId: string, batchId: string, startDate: CivilDate): Promise<EnrolmentRecord>;
  transfer(studentId: string, toBatchId: string, effectiveDate: CivilDate): Promise<EnrolmentRecord>;
  openEnrolment(studentId: string): Promise<EnrolmentRecord | null>;
  firstEnrolmentStart(studentId: string): Promise<CivilDate | null>;
}
createBatchRepo(prisma: PrismaClient): BatchRepo
```

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createBatchRepo } from "../src/db/batch-repo.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

describe.skipIf(!dbUrl)("createBatchRepo", () => {
  const prisma = createPrismaClient(dbUrl!);
  const repo = createBatchRepo(prisma);

  beforeEach(async () => { await resetDb(prisma); });
  afterAll(async () => { await prisma.$disconnect(); });

  async function student(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "STUDENT" },
    });
  }

  it("creates and lists batches with CivilDate fields", async () => {
    await repo.create({ name: "Batch A", startDate: civilDate("2026-05-10"), endDate: civilDate("2026-11-09") });
    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.startDate).toBe("2026-05-10"); // a string, not a Date
  });

  it("transfer closes the open enrolment and opens the new one (FR-8)", async () => {
    const s = await student("t-1");
    const a = await repo.create({ name: "A", startDate: civilDate("2026-05-10"), endDate: civilDate("2026-11-09") });
    const b = await repo.create({ name: "B", startDate: civilDate("2026-07-10"), endDate: civilDate("2027-01-09") });
    await repo.enrol(s.id, a.id, civilDate("2026-05-10"));

    const moved = await repo.transfer(s.id, b.id, civilDate("2026-07-10"));
    expect(moved.batchId).toBe(b.id);
    expect(moved.endDate).toBeNull();

    const open = await repo.openEnrolment(s.id);
    expect(open?.batchId).toBe(b.id);
    // History intact: the closed A enrolment still exists, ended at transfer.
    const rows = await prisma.enrolment.findMany({ where: { studentId: s.id }, orderBy: { startDate: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.endDate).not.toBeNull();
  });

  it("firstEnrolmentStart survives a transfer — the 6-month clock never resets (FR-8)", async () => {
    const s = await student("t-2");
    const a = await repo.create({ name: "A2", startDate: civilDate("2026-05-10"), endDate: civilDate("2026-11-09") });
    const b = await repo.create({ name: "B2", startDate: civilDate("2026-07-10"), endDate: civilDate("2027-01-09") });
    await repo.enrol(s.id, a.id, civilDate("2026-05-10"));
    await repo.transfer(s.id, b.id, civilDate("2026-07-10"));
    expect(await repo.firstEnrolmentStart(s.id)).toBe("2026-05-10");
  });

  it("transfer with no open enrolment throws", async () => {
    const s = await student("t-3");
    const b = await repo.create({ name: "B3", startDate: civilDate("2026-07-10"), endDate: civilDate("2027-01-09") });
    await expect(repo.transfer(s.id, b.id, civilDate("2026-07-10"))).rejects.toThrow(/no open enrolment/i);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @irp/api exec vitest run test/batch-repo.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

`apps/api/src/db/batch-repo.ts`:

```typescript
import type { CivilDate } from "@irp/core";
import type { PrismaClient } from "../generated/prisma/client.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";

export interface BatchRecord {
  id: string;
  name: string;
  startDate: CivilDate;
  endDate: CivilDate;
}

export interface EnrolmentRecord {
  id: string;
  studentId: string;
  batchId: string;
  startDate: CivilDate;
  endDate: CivilDate | null;
}

export interface BatchRepo {
  create(input: { name: string; startDate: CivilDate; endDate: CivilDate }): Promise<BatchRecord>;
  list(): Promise<BatchRecord[]>;
  enrol(studentId: string, batchId: string, startDate: CivilDate): Promise<EnrolmentRecord>;
  transfer(studentId: string, toBatchId: string, effectiveDate: CivilDate): Promise<EnrolmentRecord>;
  openEnrolment(studentId: string): Promise<EnrolmentRecord | null>;
  firstEnrolmentStart(studentId: string): Promise<CivilDate | null>;
}

interface DbBatch { id: string; name: string; startDate: Date; endDate: Date }
interface DbEnrolment { id: string; studentId: string; batchId: string; startDate: Date; endDate: Date | null }

function mapBatch(b: DbBatch): BatchRecord {
  return { id: b.id, name: b.name, startDate: fromDbDate(b.startDate), endDate: fromDbDate(b.endDate) };
}

function mapEnrolment(e: DbEnrolment): EnrolmentRecord {
  return {
    id: e.id,
    studentId: e.studentId,
    batchId: e.batchId,
    startDate: fromDbDate(e.startDate),
    endDate: e.endDate === null ? null : fromDbDate(e.endDate),
  };
}

export function createBatchRepo(prisma: PrismaClient): BatchRepo {
  return {
    async create(input) {
      const b = await prisma.batch.create({
        data: { name: input.name, startDate: toDbDate(input.startDate), endDate: toDbDate(input.endDate) },
      });
      return mapBatch(b);
    },

    async list() {
      const rows = await prisma.batch.findMany({ orderBy: { startDate: "asc" } });
      return rows.map(mapBatch);
    },

    async enrol(studentId, batchId, startDate) {
      const e = await prisma.enrolment.create({
        data: { studentId, batchId, startDate: toDbDate(startDate) },
      });
      return mapEnrolment(e);
    },

    // FR-8 in one transaction: the partial unique index makes "two open
    // enrolments" impossible even under a concurrent double-submit — the
    // second insert violates the index and the transaction rolls back.
    async transfer(studentId, toBatchId, effectiveDate) {
      return prisma.$transaction(async (tx) => {
        const open = await tx.enrolment.findFirst({ where: { studentId, endDate: null } });
        if (!open) throw new Error(`transfer: student ${studentId} has no open enrolment`);
        await tx.enrolment.update({
          where: { id: open.id },
          data: { endDate: toDbDate(effectiveDate) },
        });
        const next = await tx.enrolment.create({
          data: { studentId, batchId: toBatchId, startDate: toDbDate(effectiveDate) },
        });
        return mapEnrolment(next);
      });
    },

    async openEnrolment(studentId) {
      const e = await prisma.enrolment.findFirst({ where: { studentId, endDate: null } });
      return e ? mapEnrolment(e) : null;
    },

    async firstEnrolmentStart(studentId) {
      const e = await prisma.enrolment.findFirst({
        where: { studentId },
        orderBy: { startDate: "asc" },
      });
      return e ? fromDbDate(e.startDate) : null;
    },
  };
}
```

- [ ] **Step 4: Run to verify pass** — same command, expected: 4 passing.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/db/batch-repo.ts apps/api/test/batch-repo.test.ts
git commit -m "feat(api): batch and enrolment repository -- transfer keeps history (FR-6, FR-8)"
```

---

### Task 5: Entry + daily-report repository

**Files:**
- Create: `apps/api/src/db/entry-repo.ts`
- Test: `apps/api/test/entry-repo.test.ts`

**Interfaces:**
- Consumes: `decideEntryFlags` + errors (Task 3), `toDbDate`/`fromDbDate` (Task 2), Prisma models (Task 1).
- Produces:

```typescript
interface EntryRecord {
  id: string; studentId: string; entryDate: CivilDate; body: string;
  submittedAt: Date; isLate: boolean; isExtra: boolean;
}
interface DailyReportRecord {
  id: string; studentId: string; reportDate: CivilDate;
  status: "SUBMITTED" | "IN_REVIEW" | "EVALUATED";
}
interface EntryRepo {
  addEntry(input: { studentId: string; entryDate: CivilDate; body: string; submittedAt: Date }): Promise<EntryRecord>;
  listEntries(studentId: string, from: CivilDate, to: CivilDate): Promise<EntryRecord[]>;
  getReport(studentId: string, date: CivilDate): Promise<DailyReportRecord | null>;
}
createEntryRepo(prisma: PrismaClient): EntryRepo
```

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createEntryRepo } from "../src/db/entry-repo.js";
import { toDbDate } from "../src/db/civil-date-map.js";
import { AbsentDayConflictError, LockedDayError, SubmissionWindowClosedError } from "../src/domain/errors.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

// 2026-08-03 is a Monday. 11:30Z = 17:00 Colombo.
const MONDAY = civilDate("2026-08-03");
const MONDAY_5PM = new Date("2026-08-03T11:30:00Z");

describe.skipIf(!dbUrl)("createEntryRepo", () => {
  const prisma = createPrismaClient(dbUrl!);
  const repo = createEntryRepo(prisma);

  beforeEach(async () => { await resetDb(prisma); });
  afterAll(async () => { await prisma.$disconnect(); });

  async function student(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "STUDENT" },
    });
  }

  it("first entry creates the daily report as SUBMITTED; a second entry reuses it (FR-11, FR-18)", async () => {
    const s = await student("e-1");
    const first = await repo.addEntry({ studentId: s.id, entryDate: MONDAY, body: "stood up the parser", submittedAt: MONDAY_5PM });
    expect(first.isLate).toBe(false);
    const report = await repo.getReport(s.id, MONDAY);
    expect(report?.status).toBe("SUBMITTED");

    await repo.addEntry({ studentId: s.id, entryDate: MONDAY, body: "fixed the tests", submittedAt: new Date("2026-08-03T12:00:00Z") });
    expect(await prisma.dailyReport.count()).toBe(1);
    expect(await prisma.entry.count()).toBe(2);
  });

  it("stores late flags computed from the historical instant (FR-13)", async () => {
    const s = await student("e-2");
    // Tuesday 09:40 Colombo for Monday's date — inside grace, late.
    const e = await repo.addEntry({ studentId: s.id, entryDate: MONDAY, body: "yesterday's notes", submittedAt: new Date("2026-08-04T04:10:00Z") });
    expect(e.isLate).toBe(true);
  });

  it("rejects a closed window with SubmissionWindowClosedError", async () => {
    const s = await student("e-3");
    await expect(
      repo.addEntry({ studentId: s.id, entryDate: MONDAY, body: "too old", submittedAt: new Date("2026-08-06T04:00:00Z") }),
    ).rejects.toThrow(SubmissionWindowClosedError);
  });

  it("rejects an entry for an EVALUATED (locked) day (FR-20)", async () => {
    const s = await student("e-4");
    await repo.addEntry({ studentId: s.id, entryDate: MONDAY, body: "first", submittedAt: MONDAY_5PM });
    await prisma.dailyReport.updateMany({
      where: { studentId: s.id }, data: { status: "EVALUATED", evaluatedAt: new Date() },
    });
    await expect(
      repo.addEntry({ studentId: s.id, entryDate: MONDAY, body: "after lock", submittedAt: new Date("2026-08-03T13:00:00Z") }),
    ).rejects.toThrow(LockedDayError);
  });

  it("rejects an entry for a day marked absent", async () => {
    const s = await student("e-5");
    await prisma.absenceRecord.create({
      data: { studentId: s.id, date: toDbDate(MONDAY), reason: "medical" },
    });
    await expect(
      repo.addEntry({ studentId: s.id, entryDate: MONDAY, body: "but also worked?", submittedAt: MONDAY_5PM }),
    ).rejects.toThrow(AbsentDayConflictError);
  });

  it("lists entries within a date range, oldest first", async () => {
    const s = await student("e-6");
    await repo.addEntry({ studentId: s.id, entryDate: MONDAY, body: "one", submittedAt: MONDAY_5PM });
    const rows = await repo.listEntries(s.id, civilDate("2026-08-01"), civilDate("2026-08-09"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.entryDate).toBe("2026-08-03");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @irp/api exec vitest run test/entry-repo.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

`apps/api/src/db/entry-repo.ts`:

```typescript
import type { CivilDate } from "@irp/core";
import { decideEntryFlags } from "../domain/entry-flags.js";
import { AbsentDayConflictError, LockedDayError } from "../domain/errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";

export interface EntryRecord {
  id: string;
  studentId: string;
  entryDate: CivilDate;
  body: string;
  submittedAt: Date;
  isLate: boolean;
  isExtra: boolean;
}

export interface DailyReportRecord {
  id: string;
  studentId: string;
  reportDate: CivilDate;
  status: "SUBMITTED" | "IN_REVIEW" | "EVALUATED";
}

export interface EntryRepo {
  addEntry(input: {
    studentId: string;
    entryDate: CivilDate;
    body: string;
    submittedAt: Date;
  }): Promise<EntryRecord>;
  listEntries(studentId: string, from: CivilDate, to: CivilDate): Promise<EntryRecord[]>;
  getReport(studentId: string, date: CivilDate): Promise<DailyReportRecord | null>;
}

interface DbEntry {
  id: string; studentId: string; entryDate: Date; body: string;
  submittedAt: Date; isLate: boolean; isExtra: boolean;
}

function mapEntry(e: DbEntry): EntryRecord {
  return {
    id: e.id,
    studentId: e.studentId,
    entryDate: fromDbDate(e.entryDate),
    body: e.body,
    submittedAt: e.submittedAt,
    isLate: e.isLate,
    isExtra: e.isExtra,
  };
}

export function createEntryRepo(prisma: PrismaClient): EntryRepo {
  return {
    // The flags call throws SubmissionWindowClosedError before anything is
    // written, so an illegal date never reaches the database (FR-15 by
    // construction). Time validation is against the submittedAt INSTANT —
    // Plan 6 handlers pass new Date(); the seed passes history.
    async addEntry(input) {
      const flags = decideEntryFlags(input.entryDate, input.submittedAt);
      const dbDate = toDbDate(input.entryDate);

      return prisma.$transaction(async (tx) => {
        const report = await tx.dailyReport.findUnique({
          where: { studentId_reportDate: { studentId: input.studentId, reportDate: dbDate } },
        });
        if (report?.status === "EVALUATED") {
          throw new LockedDayError(input.entryDate);
        }
        const absence = await tx.absenceRecord.findUnique({
          where: { studentId_date: { studentId: input.studentId, date: dbDate } },
        });
        if (absence) {
          throw new AbsentDayConflictError(input.entryDate);
        }
        // Upsert, not find-then-create: two concurrent first entries for the
        // same day would both see no report and the loser would throw P2002.
        // Prisma compiles this shape to a native INSERT ... ON CONFLICT.
        await tx.dailyReport.upsert({
          where: { studentId_reportDate: { studentId: input.studentId, reportDate: dbDate } },
          update: {},
          create: { studentId: input.studentId, reportDate: dbDate },
        });
        const entry = await tx.entry.create({
          data: {
            studentId: input.studentId,
            entryDate: dbDate,
            body: input.body,
            submittedAt: input.submittedAt,
            isLate: flags.isLate,
            isExtra: flags.isExtra,
          },
        });
        return mapEntry(entry);
      });
    },

    async listEntries(studentId, from, to) {
      const rows = await prisma.entry.findMany({
        where: { studentId, entryDate: { gte: toDbDate(from), lte: toDbDate(to) } },
        orderBy: [{ entryDate: "asc" }, { submittedAt: "asc" }],
      });
      return rows.map(mapEntry);
    },

    async getReport(studentId, date) {
      const r = await prisma.dailyReport.findUnique({
        where: { studentId_reportDate: { studentId, reportDate: toDbDate(date) } },
      });
      if (!r) return null;
      return { id: r.id, studentId: r.studentId, reportDate: fromDbDate(r.reportDate), status: r.status };
    },
  };
}
```

- [ ] **Step 4: Run to verify pass** — same command, expected: 6 passing.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/db/entry-repo.ts apps/api/test/entry-repo.test.ts
git commit -m "feat(api): entry repository -- roll-up reports, lock and absence guards (FR-11, FR-18, FR-20)"
```

---

### Task 6: Absence + mentor-day-record repositories

**Files:**
- Create: `apps/api/src/db/absence-repo.ts`
- Create: `apps/api/src/db/mentor-record-repo.ts`
- Test: `apps/api/test/absence-repo.test.ts`
- Test: `apps/api/test/mentor-record-repo.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 as above.
- Produces:

```typescript
interface AbsenceRepo {
  create(input: { studentId: string; date: CivilDate; reason: string }): Promise<AbsenceRecordShape>;
  remove(studentId: string, date: CivilDate): Promise<void>;
  listForStudent(studentId: string, from: CivilDate, to: CivilDate): Promise<AbsenceRecordShape[]>;
}
interface AbsenceRecordShape { id: string; studentId: string; date: CivilDate; reason: string }
createAbsenceRepo(prisma: PrismaClient): AbsenceRepo

interface MentorRecordRepo {
  upsert(input: {
    studentId: string; date: CivilDate; attended: boolean;
    tasksCompleted: boolean; note?: string; recordedById: string;
  }): Promise<MentorDayRecordShape>;
  get(studentId: string, date: CivilDate): Promise<MentorDayRecordShape | null>;
}
interface MentorDayRecordShape {
  id: string; studentId: string; date: CivilDate; attended: boolean;
  tasksCompleted: boolean; note: string | null; recordedById: string;
}
createMentorRecordRepo(prisma: PrismaClient): MentorRecordRepo
```

State rules live here (weekday-only, entry-conflict, lock). "Is the day final *now*" is a Plan 6 service rule — the repos stay timeless so the seed can write history.

- [ ] **Step 1: Write the failing absence tests**

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createAbsenceRepo } from "../src/db/absence-repo.js";
import { createEntryRepo } from "../src/db/entry-repo.js";
import { EntryConflictError, LockedDayError, WeekendAbsenceError } from "../src/domain/errors.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

const MONDAY = civilDate("2026-08-03");

describe.skipIf(!dbUrl)("createAbsenceRepo", () => {
  const prisma = createPrismaClient(dbUrl!);
  const repo = createAbsenceRepo(prisma);
  const entries = createEntryRepo(prisma);

  beforeEach(async () => { await resetDb(prisma); });
  afterAll(async () => { await prisma.$disconnect(); });

  async function student(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "STUDENT" },
    });
  }

  it("records a weekday absence with its reason (FR-16)", async () => {
    const s = await student("a-1");
    const a = await repo.create({ studentId: s.id, date: MONDAY, reason: "medical appointment" });
    expect(a.date).toBe("2026-08-03");
    expect((await repo.listForStudent(s.id, civilDate("2026-08-01"), civilDate("2026-08-09")))).toHaveLength(1);
  });

  it("refuses a weekend absence — nothing to be absent from", async () => {
    const s = await student("a-2");
    await expect(repo.create({ studentId: s.id, date: civilDate("2026-08-01"), reason: "n/a" }))
      .rejects.toThrow(WeekendAbsenceError);
  });

  it("refuses to mark a day that already holds entries", async () => {
    const s = await student("a-3");
    await entries.addEntry({ studentId: s.id, entryDate: MONDAY, body: "worked", submittedAt: new Date("2026-08-03T11:30:00Z") });
    await expect(repo.create({ studentId: s.id, date: MONDAY, reason: "also absent?" }))
      .rejects.toThrow(EntryConflictError);
  });

  it("refuses to remove an absence on a locked (EVALUATED) day (FR-20)", async () => {
    const s = await student("a-4");
    await entries.addEntry({ studentId: s.id, entryDate: MONDAY, body: "worked", submittedAt: new Date("2026-08-03T11:30:00Z") });
    await prisma.dailyReport.updateMany({ where: { studentId: s.id }, data: { status: "EVALUATED" } });
    await expect(repo.remove(s.id, MONDAY)).rejects.toThrow(LockedDayError);
  });

  it("remove deletes an existing absence", async () => {
    const s = await student("a-5");
    await repo.create({ studentId: s.id, date: MONDAY, reason: "travel" });
    await repo.remove(s.id, MONDAY);
    expect(await prisma.absenceRecord.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Write the failing mentor-record tests**

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createMentorRecordRepo } from "../src/db/mentor-record-repo.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

const MONDAY = civilDate("2026-08-03");

describe.skipIf(!dbUrl)("createMentorRecordRepo", () => {
  const prisma = createPrismaClient(dbUrl!);
  const repo = createMentorRecordRepo(prisma);

  beforeEach(async () => { await resetDb(prisma); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("upserts a record for a day with no entries — FR-19 is independent of submissions", async () => {
    const s = await prisma.user.create({
      data: { externalId: "m-1", email: "m-1@dev.local", displayName: "S", role: "STUDENT" },
    });
    const mentor = await prisma.user.create({
      data: { externalId: "m-2", email: "m-2@dev.local", displayName: "M", role: "ADMIN" },
    });
    const first = await repo.upsert({
      studentId: s.id, date: MONDAY, attended: true, tasksCompleted: false, recordedById: mentor.id,
    });
    expect(first.attended).toBe(true);

    const second = await repo.upsert({
      studentId: s.id, date: MONDAY, attended: true, tasksCompleted: true,
      note: "caught up by evening", recordedById: mentor.id,
    });
    expect(second.id).toBe(first.id); // updated, not duplicated
    expect(second.tasksCompleted).toBe(true);
    expect(await repo.get(s.id, MONDAY)).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run both to verify failure**

```powershell
pnpm --filter @irp/api exec vitest run test/absence-repo.test.ts test/mentor-record-repo.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`apps/api/src/db/absence-repo.ts`:

```typescript
import { isWeekday, type CivilDate } from "@irp/core";
import { EntryConflictError, LockedDayError, WeekendAbsenceError } from "../domain/errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";

export interface AbsenceRecordShape {
  id: string;
  studentId: string;
  date: CivilDate;
  reason: string;
}

export interface AbsenceRepo {
  create(input: { studentId: string; date: CivilDate; reason: string }): Promise<AbsenceRecordShape>;
  remove(studentId: string, date: CivilDate): Promise<void>;
  listForStudent(studentId: string, from: CivilDate, to: CivilDate): Promise<AbsenceRecordShape[]>;
}

export function createAbsenceRepo(prisma: PrismaClient): AbsenceRepo {
  async function assertNotLocked(
    tx: Pick<PrismaClient, "dailyReport">,
    studentId: string,
    date: CivilDate,
  ): Promise<void> {
    const report = await tx.dailyReport.findUnique({
      where: { studentId_reportDate: { studentId, reportDate: toDbDate(date) } },
    });
    if (report?.status === "EVALUATED") throw new LockedDayError(date);
  }

  return {
    async create(input) {
      if (!isWeekday(input.date)) throw new WeekendAbsenceError(input.date);
      return prisma.$transaction(async (tx) => {
        await assertNotLocked(tx, input.studentId, input.date);
        const entryCount = await tx.entry.count({
          where: { studentId: input.studentId, entryDate: toDbDate(input.date) },
        });
        if (entryCount > 0) throw new EntryConflictError(input.date);
        const row = await tx.absenceRecord.create({
          data: { studentId: input.studentId, date: toDbDate(input.date), reason: input.reason },
        });
        return { id: row.id, studentId: row.studentId, date: fromDbDate(row.date), reason: row.reason };
      });
    },

    async remove(studentId, date) {
      await prisma.$transaction(async (tx) => {
        await assertNotLocked(tx, studentId, date);
        await tx.absenceRecord.deleteMany({ where: { studentId, date: toDbDate(date) } });
      });
    },

    async listForStudent(studentId, from, to) {
      const rows = await prisma.absenceRecord.findMany({
        where: { studentId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
        orderBy: { date: "asc" },
      });
      return rows.map((r) => ({ id: r.id, studentId: r.studentId, date: fromDbDate(r.date), reason: r.reason }));
    },
  };
}
```

`apps/api/src/db/mentor-record-repo.ts`:

```typescript
import type { CivilDate } from "@irp/core";
import type { PrismaClient } from "../generated/prisma/client.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";

export interface MentorDayRecordShape {
  id: string;
  studentId: string;
  date: CivilDate;
  attended: boolean;
  tasksCompleted: boolean;
  note: string | null;
  recordedById: string;
}

export interface MentorRecordRepo {
  upsert(input: {
    studentId: string;
    date: CivilDate;
    attended: boolean;
    tasksCompleted: boolean;
    note?: string;
    recordedById: string;
  }): Promise<MentorDayRecordShape>;
  get(studentId: string, date: CivilDate): Promise<MentorDayRecordShape | null>;
}

interface DbRecord {
  id: string; studentId: string; date: Date; attended: boolean;
  tasksCompleted: boolean; note: string | null; recordedById: string;
}

function map(r: DbRecord): MentorDayRecordShape {
  return { ...r, date: fromDbDate(r.date) };
}

export function createMentorRecordRepo(prisma: PrismaClient): MentorRecordRepo {
  return {
    async upsert(input) {
      const where = { studentId_date: { studentId: input.studentId, date: toDbDate(input.date) } };
      const data = {
        attended: input.attended,
        tasksCompleted: input.tasksCompleted,
        note: input.note ?? null,
        recordedById: input.recordedById,
      };
      const row = await prisma.mentorDayRecord.upsert({
        where,
        update: data,
        create: { studentId: input.studentId, date: toDbDate(input.date), ...data },
      });
      return map(row);
    },

    async get(studentId, date) {
      const row = await prisma.mentorDayRecord.findUnique({
        where: { studentId_date: { studentId, date: toDbDate(date) } },
      });
      return row ? map(row) : null;
    },
  };
}
```

- [ ] **Step 5: Run to verify pass** — same command, expected: 6 passing across the two files.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/db/absence-repo.ts apps/api/src/db/mentor-record-repo.ts apps/api/test/absence-repo.test.ts apps/api/test/mentor-record-repo.test.ts
git commit -m "feat(api): absence and mentor-day-record repositories (FR-16, FR-19)"
```

---

### Task 7: Cycle materialisation

**Files:**
- Create: `apps/api/src/db/cycle-repo.ts`
- Test: `apps/api/test/cycle-repo.test.ts`

**Interfaces:**
- Consumes: `firstEvaluatedCycleStart`, `cycleContaining`, `shiftCycle`, `compareDates`, `addDays` from `@irp/core`; Tasks 1–2.
- Produces:

```typescript
interface CycleRecord { id: string; batchId: string; seq: number; startDate: CivilDate; endDate: CivilDate }
interface CycleRepo {
  ensureCycles(batchId: string, through: CivilDate): Promise<CycleRecord[]>;
  listForBatch(batchId: string): Promise<CycleRecord[]>;
}
createCycleRepo(prisma: PrismaClient): CycleRepo
```

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createCycleRepo } from "../src/db/cycle-repo.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

describe.skipIf(!dbUrl)("createCycleRepo", () => {
  const prisma = createPrismaClient(dbUrl!);
  const repo = createCycleRepo(prisma);

  beforeEach(async () => { await resetDb(prisma); });
  afterAll(async () => { await prisma.$disconnect(); });

  async function batch(name: string, start: string) {
    return prisma.batch.create({
      data: { name, startDate: new Date(`${start}T00:00:00Z`), endDate: new Date("2027-01-09T00:00:00Z") },
    });
  }

  it("materialises cycles from an on-boundary admission (the 10th)", async () => {
    const b = await batch("On", "2026-05-10");
    const cycles = await repo.ensureCycles(b.id, civilDate("2026-08-02"));
    // 10 May–9 Jun, 10 Jun–9 Jul, 10 Jul–9 Aug
    expect(cycles.map((c) => [c.seq, c.startDate, c.endDate])).toEqual([
      [1, "2026-05-10", "2026-06-09"],
      [2, "2026-06-10", "2026-07-09"],
      [3, "2026-07-10", "2026-08-09"],
    ]);
  });

  it("a mid-cycle admission starts numbering at the NEXT cycle (FR-27 joining half)", async () => {
    const b = await batch("Mid", "2026-05-20");
    const cycles = await repo.ensureCycles(b.id, civilDate("2026-07-15"));
    expect(cycles[0]!.startDate).toBe("2026-06-10"); // not 10 May
    expect(cycles[0]!.seq).toBe(1);
  });

  it("is idempotent — a second call adds nothing and renumbers nothing", async () => {
    const b = await batch("Idem", "2026-05-10");
    await repo.ensureCycles(b.id, civilDate("2026-08-02"));
    const again = await repo.ensureCycles(b.id, civilDate("2026-08-02"));
    expect(again).toHaveLength(3);
    expect(await prisma.cycle.count()).toBe(3);
  });

  it("extends forward when `through` moves into a later cycle", async () => {
    const b = await batch("Ext", "2026-05-10");
    await repo.ensureCycles(b.id, civilDate("2026-06-15"));
    const extended = await repo.ensureCycles(b.id, civilDate("2026-08-15"));
    expect(extended).toHaveLength(4); // through 10 Aug–9 Sep
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @irp/api exec vitest run test/cycle-repo.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

`apps/api/src/db/cycle-repo.ts`:

```typescript
import {
  compareDates,
  cycleContaining,
  firstEvaluatedCycleStart,
  shiftCycle,
  type CivilDate,
} from "@irp/core";
import type { PrismaClient } from "../generated/prisma/client.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";

export interface CycleRecord {
  id: string;
  batchId: string;
  seq: number;
  startDate: CivilDate;
  endDate: CivilDate;
}

export interface CycleRepo {
  /**
   * Materialise every cycle from the batch's first evaluated cycle up to and
   * including the one containing `through`. Idempotent: existing (batchId,
   * seq) rows are left untouched, so an Evaluation FK can never be orphaned
   * by a re-run. The ENGINE owns the arithmetic; these rows are its cache
   * (spec §3).
   */
  ensureCycles(batchId: string, through: CivilDate): Promise<CycleRecord[]>;
  listForBatch(batchId: string): Promise<CycleRecord[]>;
}

export function createCycleRepo(prisma: PrismaClient): CycleRepo {
  async function listForBatch(batchId: string): Promise<CycleRecord[]> {
    const rows = await prisma.cycle.findMany({ where: { batchId }, orderBy: { seq: "asc" } });
    return rows.map((c) => ({
      id: c.id,
      batchId: c.batchId,
      seq: c.seq,
      startDate: fromDbDate(c.startDate),
      endDate: fromDbDate(c.endDate),
    }));
  }

  return {
    async ensureCycles(batchId, through) {
      const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
      const admission = fromDbDate(batch.startDate);
      const lastWanted = cycleContaining(through).start;

      let start = firstEvaluatedCycleStart(admission);
      let seq = 1;
      const wanted: { seq: number; start: CivilDate }[] = [];
      while (compareDates(start, lastWanted) <= 0) {
        wanted.push({ seq, start });
        start = shiftCycle(start, 1);
        seq += 1;
      }

      await prisma.$transaction(
        wanted.map((w) =>
          prisma.cycle.upsert({
            where: { batchId_seq: { batchId, seq: w.seq } },
            update: {},
            create: {
              batchId,
              seq: w.seq,
              startDate: toDbDate(w.start),
              endDate: toDbDate(cycleContaining(w.start).end),
            },
          }),
        ),
      );
      return listForBatch(batchId);
    },

    listForBatch,
  };
}
```

- [ ] **Step 4: Run to verify pass** — same command, expected: 4 passing.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/db/cycle-repo.ts apps/api/test/cycle-repo.test.ts
git commit -m "feat(api): cycle materialisation -- the engine's arithmetic cached per batch (FR-9)"
```

---

### Task 8: `@irp/fixtures` — one source of persona identity

**Files:**
- Create: `packages/fixtures/package.json`
- Create: `packages/fixtures/tsconfig.json`
- Create: `packages/fixtures/src/index.ts`
- Modify: `apps/web/lib/dev-identities.ts`
- Modify: `apps/web/package.json` (add dependency)
- Modify: `apps/api/package.json` (add devDependency)
- Test: `apps/web/test/dev-identity.test.ts` (existing — must stay green unchanged)

**Interfaces:**
- Produces:

```typescript
type PersonaKind = "compliant" | "late" | "missed" | "absent" | "weekend" | "joiner" | "transfer" | "archived" | "mixed";
interface SeedMentor { externalId: string; email: string; name: string }
interface SeedStudent { externalId: string; email: string; name: string; batch: "A" | "B"; kind: PersonaKind }
SEED_MENTORS: readonly SeedMentor[]   // 2 mentors
SEED_STUDENTS: readonly SeedStudent[] // 10 students
SEED_BATCH_NAMES: { A: string; B: string }
```

The web picker's Plan 5 shape does **not** change (picker UI expansion is Plan 6); `dev-identities.ts` only starts *deriving* its three entries from the fixtures. `dev-admin-1`/`dev-student-1` keep their externalIds so the existing e2e suite and CI keep passing before the seed lands.

- [ ] **Step 1: Create the package**

`packages/fixtures/package.json`:

```json
{
  "name": "@irp/fixtures",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  }
}
```

`packages/fixtures/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/fixtures/src/index.ts`:

```typescript
/**
 * Dev/seed persona identity — the ONE list the database seed and the web
 * dev-identity picker both derive from, so they cannot drift (spec §6).
 * Data only: no secrets, no signing, importable from client code.
 *
 * Ships raw TS like @irp/client (bundler-only consumers: Next, tsx, Vitest).
 * NOT for apps/api runtime code — dev/test/seed only.
 */

export type PersonaKind =
  | "compliant"
  | "late"
  | "missed"
  | "absent"
  | "weekend"
  | "joiner"
  | "transfer"
  | "archived"
  | "mixed";

export interface SeedMentor {
  externalId: string;
  email: string;
  name: string;
}

export interface SeedStudent {
  externalId: string;
  email: string;
  name: string;
  batch: "A" | "B";
  kind: PersonaKind;
}

export const SEED_BATCH_NAMES = { A: "Batch Aurora", B: "Batch Basalt" } as const;

// dev-admin-1 / dev-student-1 keep their historical externalIds: the
// Playwright suite and CI's seeded users predate this package, and identity
// stability is what lets the seed REPLACE the old manual INSERT without a
// breaking rename.
export const SEED_MENTORS: readonly SeedMentor[] = [
  { externalId: "dev-admin-1", email: "mentor@dev.local", name: "Dev Mentor" },
  { externalId: "seed-mentor-2", email: "priya.mentor@dev.local", name: "Priya Fernando" },
];

export const SEED_STUDENTS: readonly SeedStudent[] = [
  { externalId: "dev-student-1", email: "student@dev.local", name: "Dev Student", batch: "A", kind: "compliant" },
  { externalId: "seed-student-a2", email: "nuwan@dev.local", name: "Nuwan Perera", batch: "A", kind: "late" },
  { externalId: "seed-student-a3", email: "sachini@dev.local", name: "Sachini Silva", batch: "A", kind: "missed" },
  { externalId: "seed-student-a4", email: "kavindu@dev.local", name: "Kavindu Jayasuriya", batch: "A", kind: "absent" },
  { externalId: "seed-student-a5", email: "tharindu@dev.local", name: "Tharindu Weerasinghe", batch: "A", kind: "archived" },
  { externalId: "seed-student-b1", email: "ishara@dev.local", name: "Ishara Gunawardena", batch: "B", kind: "compliant" },
  { externalId: "seed-student-b2", email: "dilini@dev.local", name: "Dilini Rathnayake", batch: "B", kind: "weekend" },
  { externalId: "seed-student-b3", email: "ramesh@dev.local", name: "Ramesh Kumar", batch: "B", kind: "joiner" },
  { externalId: "seed-student-b4", email: "amaya@dev.local", name: "Amaya Wickramasinghe", batch: "B", kind: "transfer" },
  { externalId: "seed-student-b5", email: "chamodi@dev.local", name: "Chamodi Herath", batch: "B", kind: "mixed" },
];

/** Every seeded User externalId — the seed's idempotent delete targets exactly these. */
export const SEED_EXTERNAL_IDS: readonly string[] = [
  ...SEED_MENTORS.map((m) => m.externalId),
  ...SEED_STUDENTS.map((s) => s.externalId),
];
```

- [ ] **Step 2: Wire the workspace**

Add to `apps/web/package.json` `dependencies`: `"@irp/fixtures": "workspace:*"`.
Add to `apps/api/package.json` `devDependencies`: `"@irp/fixtures": "workspace:*"`.
Run `pnpm install` (workspace glob `packages/*` already covers it).

- [ ] **Step 3: Derive the picker constants**

Replace the `DEV_IDENTITIES` array in `apps/web/lib/dev-identities.ts` (keep the file's docblock, `DevIdentity` interface, and `DEV_ISSUER` unchanged):

```typescript
import { SEED_MENTORS, SEED_STUDENTS } from "@irp/fixtures";

/**
 * Derived from @irp/fixtures — the same constants the database seed writes —
 * so the picker and the seeded rows cannot drift (spec §6). Plan 5 keeps the
 * picker at three entries; the full persona picker is Plan 6.
 */
export const DEV_IDENTITIES: readonly DevIdentity[] = [
  {
    id: "mentor",
    label: "Mentor (Admin)",
    oid: SEED_MENTORS[0]!.externalId,
    email: SEED_MENTORS[0]!.email,
    name: SEED_MENTORS[0]!.name,
  },
  {
    id: "student",
    label: "Student",
    oid: SEED_STUDENTS[0]!.externalId,
    email: SEED_STUDENTS[0]!.email,
    name: SEED_STUDENTS[0]!.name,
  },
  { id: "unknown", label: "Unregistered user (expect 403)", oid: "dev-unknown-1", email: "nobody@dev.local", name: "Unregistered" },
];
```

- [ ] **Step 4: Verify nothing web-side changed behaviourally**

```powershell
pnpm --filter @irp/web test
pnpm --filter @irp/fixtures typecheck
```

Expected: all existing web tests pass unchanged (the derived values are identical to the old literals — `dev-admin-1`, `mentor@dev.local`, `Dev Mentor`, `dev-student-1`, …).

- [ ] **Step 5: Commit**

```powershell
git add packages/fixtures apps/web/lib/dev-identities.ts apps/web/package.json apps/api/package.json pnpm-lock.yaml
git commit -m "feat(fixtures): @irp/fixtures -- one persona list for seed and picker"
```

---

### Task 9: The seed script

**Files:**
- Create: `apps/api/src/seed/run-seed.ts` (the logic — inside `src` so `tsc` typechecks it; excluded from the build, see Note below)
- Create: `apps/api/prisma/seed.ts` (thin CLI wrapper — run by tsx, outside the compile scope)
- Modify: `apps/api/package.json` (add `db:seed` script)
- Modify: `.github/workflows/ci.yml` (replace the manual psql INSERT with the seed)
- Test: `apps/api/test/seed.test.ts`
- Note: `apps/api/tsconfig.json` includes `prisma/` (via the explicit `prisma/seed.ts` entry), so the CLI wrapper is typechecked; `apps/api/tsconfig.build.json` excludes both `prisma/**/*` and `src/seed/**/*` — the seed logic is typechecked and built to nothing, and the CLI wrapper is typechecked and never built at all. `tsx` runs both straight from source, so `pnpm db:seed` is unaffected either way.

**Interfaces:**
- Consumes: every repo (Tasks 4–7), `decideEntryFlags` indirectly via `entry-repo`, `colomboInstant` (Task 2), `@irp/fixtures` (Task 8), core engine (`cycleContaining`, `shiftCycle`, `workingDaysBetween`, `isWeekday`, `nextWeekday`, `dayOfWeek`, `toProgrammeDate`, `addDays`, `compareDates`).
- Produces: `runSeed(prisma: PrismaClient, now: Date): Promise<void>` from `src/seed/run-seed.ts` (the test imports this) and the `prisma/seed.ts` CLI guarded by `NODE_ENV`.

Behavioural rules (spec §6):
- Batch A starts two cycles before the current one (on the 10th — month 3); Batch B at the current cycle start.
- Persona day patterns are deterministic functions of the date (index arithmetic, no randomness).
- All timing goes through `colomboInstant`; all flags through `entry-repo.addEntry` with the historical instant.
- **No instant later than `now` is ever written**: an entry whose computed `submittedAt` hasn't happened yet (today's 17:xx entry during a morning run; a late entry whose grace submission lands tomorrow) is skipped, not clamped. Run the seed in the evening and today looks submitted; run it in the morning and today is honestly pending.
- Statuses: entry days older than 14 days → `EVALUATED` (locked, reviewed by mentor 1), older than 7 → `IN_REVIEW`, else left `SUBMITTED`. Mentor day records written for evaluated days.
- Idempotent and **owning only its rows**: deletes exactly the users in `SEED_EXTERNAL_IDS`, their dependent rows, and the two fixture batch names — `Award`/`Override` are deleted through their `evaluation.studentId` relation, never with an unfiltered `deleteMany`. The same scoping applies to the status-promotion `updateMany` calls and the mentor-record `findMany`/upsert below: both carry `studentId: { in: studentIds }` — the ids of the students this run just created — not a bare date filter. Without it, a non-seed student's `DailyReport` rows get rewritten and locked, and the *next* seed run's wipe (which only ever deletes seed-owned rows) leaves a dangling `mentorId` FK pointing at a report it can no longer touch.

- [ ] **Step 1: Write the failing seed test**

`apps/api/test/seed.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SEED_BATCH_NAMES, SEED_STUDENTS } from "@irp/fixtures";
import { createPrismaClient } from "../src/db/client.js";
import { runSeed } from "../src/seed/run-seed.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

// A fixed "now" mid-cycle on a Wednesday so classifications are stable:
// 2026-07-22 is a Wednesday inside the 10 Jul–9 Aug cycle.
const NOW = new Date("2026-07-22T09:00:00Z");

describe.skipIf(!dbUrl)("runSeed", () => {
  const prisma = createPrismaClient(dbUrl!);

  beforeAll(async () => {
    await resetDb(prisma);
    await runSeed(prisma, NOW);
  }, 120_000);
  afterAll(async () => { await prisma.$disconnect(); });

  it("creates 2 batches, 2 mentors, 10 students", async () => {
    expect(await prisma.batch.count()).toBe(2);
    expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(2);
    expect(await prisma.user.count({ where: { role: "STUDENT" } })).toBe(10);
  });

  it("is idempotent — a second run changes no counts", async () => {
    const before = await prisma.entry.count();
    await runSeed(prisma, NOW);
    expect(await prisma.entry.count()).toBe(before);
    expect(await prisma.user.count()).toBe(12);
  });

  it("the late persona has late-flagged entries; compliant has none", async () => {
    const late = SEED_STUDENTS.find((s) => s.kind === "late")!;
    const compliant = SEED_STUDENTS.find((s) => s.kind === "compliant")!;
    const lateUser = await prisma.user.findUniqueOrThrow({ where: { externalId: late.externalId } });
    const compliantUser = await prisma.user.findUniqueOrThrow({ where: { externalId: compliant.externalId } });
    expect(await prisma.entry.count({ where: { studentId: lateUser.id, isLate: true } })).toBeGreaterThan(0);
    expect(await prisma.entry.count({ where: { studentId: compliantUser.id, isLate: true } })).toBe(0);
  });

  it("the weekend persona has extra entries and no other student does", async () => {
    const weekend = SEED_STUDENTS.find((s) => s.kind === "weekend")!;
    const wUser = await prisma.user.findUniqueOrThrow({ where: { externalId: weekend.externalId } });
    expect(await prisma.entry.count({ where: { studentId: wUser.id, isExtra: true } })).toBeGreaterThan(0);
    expect(await prisma.entry.count({ where: { isExtra: true, studentId: { not: wUser.id } } })).toBe(0);
  });

  it("the absent persona has absence records with reasons", async () => {
    const absent = SEED_STUDENTS.find((s) => s.kind === "absent")!;
    const aUser = await prisma.user.findUniqueOrThrow({ where: { externalId: absent.externalId } });
    const rows = await prisma.absenceRecord.findMany({ where: { studentId: aUser.id } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.reason.length > 0)).toBe(true);
  });

  it("the transfer persona has a closed and an open enrolment (FR-8)", async () => {
    const transfer = SEED_STUDENTS.find((s) => s.kind === "transfer")!;
    const tUser = await prisma.user.findUniqueOrThrow({ where: { externalId: transfer.externalId } });
    const enrolments = await prisma.enrolment.findMany({ where: { studentId: tUser.id }, orderBy: { startDate: "asc" } });
    expect(enrolments).toHaveLength(2);
    expect(enrolments[0]!.endDate).not.toBeNull();
    expect(enrolments[1]!.endDate).toBeNull();
  });

  it("the archived persona is soft-deleted but keeps history (FR-5)", async () => {
    const archived = SEED_STUDENTS.find((s) => s.kind === "archived")!;
    const aUser = await prisma.user.findUniqueOrThrow({ where: { externalId: archived.externalId } });
    expect(aUser.deletedAt).not.toBeNull();
    expect(await prisma.entry.count({ where: { studentId: aUser.id } })).toBeGreaterThan(0);
  });

  it("the joiner persona has no entries before their enrolment start (FR-27 setup)", async () => {
    const joiner = SEED_STUDENTS.find((s) => s.kind === "joiner")!;
    const jUser = await prisma.user.findUniqueOrThrow({ where: { externalId: joiner.externalId } });
    const enrolment = await prisma.enrolment.findFirstOrThrow({ where: { studentId: jUser.id } });
    expect(await prisma.entry.count({
      where: { studentId: jUser.id, entryDate: { lt: enrolment.startDate } },
    })).toBe(0);
  });

  it("review statuses span all three states, and cycles exist for both batches", async () => {
    const statuses = await prisma.dailyReport.groupBy({ by: ["status"] });
    expect(statuses.map((s) => s.status).sort()).toEqual(["EVALUATED", "IN_REVIEW", "SUBMITTED"]);
    const batchA = await prisma.batch.findUniqueOrThrow({ where: { name: SEED_BATCH_NAMES.A } });
    expect(await prisma.cycle.count({ where: { batchId: batchA.id } })).toBeGreaterThanOrEqual(3);
    expect(await prisma.evaluation.count()).toBe(0); // D2/D6: no fake evaluations
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @irp/api exec vitest run test/seed.test.ts` → FAIL, `../src/seed/run-seed.js` not found.

- [ ] **Step 3: Implement the seed**

`apps/api/src/seed/run-seed.ts`:

```typescript
/**
 * Idempotent demo seed (spec §6). Personas are deterministic functions of
 * the calendar — no randomness, no hand-set flags. Every entry goes through
 * entry-repo.addEntry with its HISTORICAL submittedAt, so isLate/isExtra are
 * decided by the same rule production uses; a state the engine cannot
 * produce cannot enter the database. No written instant is ever later than
 * `now` — history that hasn't happened yet is skipped, not invented.
 */
import {
  addDays,
  compareDates,
  cycleContaining,
  dayOfWeek,
  isWeekday,
  nextWeekday,
  shiftCycle,
  toProgrammeDate,
  workingDaysBetween,
} from "@irp/core";
import {
  SEED_BATCH_NAMES,
  SEED_EXTERNAL_IDS,
  SEED_MENTORS,
  SEED_STUDENTS,
  type SeedStudent,
} from "@irp/fixtures";
import type { PrismaClient } from "../generated/prisma/client.js";
import { colomboInstant, fromDbDate, toDbDate } from "../db/civil-date-map.js";
import { createAbsenceRepo } from "../db/absence-repo.js";
import { createBatchRepo } from "../db/batch-repo.js";
import { createCycleRepo } from "../db/cycle-repo.js";
import { createEntryRepo } from "../db/entry-repo.js";
import { createMentorRecordRepo } from "../db/mentor-record-repo.js";

const PROSE = [
  "Continued the invoice-parsing task; the edge cases around multi-page PDFs are nastier than expected.",
  "Paired with my mentor on the review comments from yesterday and reworked the validation layer.",
  "Wrote unit tests for the date-handling module and fixed two boundary bugs they caught.",
  "Attended the architecture walkthrough and took notes on the deployment pipeline.",
  "Refactored the report generator; extracted the formatting into its own module.",
  "Investigated the flaky integration test — root cause was a shared fixture; isolated it.",
  "Documented the API endpoints I built this week and added examples to each schema.",
  "Finished the batch-import feature and demoed it at the afternoon stand-up.",
];

const ABSENCE_REASONS = [
  "Medical appointment",
  "Family emergency — informed the mentor in the morning",
  "University exam",
];

function prose(dayIndex: number, salt: number): string {
  return PROSE[(dayIndex + salt) % PROSE.length]!;
}

/** Deterministic per-persona behaviour for one required day. */
type DayPlan =
  | { kind: "onTime"; time: string }
  | { kind: "late" }
  | { kind: "skip" }
  | { kind: "absent"; reason: string };

function planFor(student: SeedStudent, dayIndex: number): DayPlan {
  const onTime = { kind: "onTime", time: `17:${String(10 + ((dayIndex * 7) % 40)).padStart(2, "0")}` } as const;
  switch (student.kind) {
    case "late":
      return dayIndex % 3 === 2 ? { kind: "late" } : onTime;
    case "missed":
      return dayIndex % 4 === 3 ? { kind: "skip" } : onTime;
    case "absent":
      return dayIndex % 5 === 4
        ? { kind: "absent", reason: ABSENCE_REASONS[dayIndex % ABSENCE_REASONS.length]! }
        : onTime;
    case "mixed":
      if (dayIndex % 9 === 8) return { kind: "absent", reason: ABSENCE_REASONS[0]! };
      if (dayIndex % 6 === 3) return { kind: "skip" };
      if (dayIndex % 5 === 1) return { kind: "late" };
      return onTime;
    default:
      return onTime; // compliant, weekend (weekday part), joiner, transfer, archived
  }
}

export async function runSeed(prisma: PrismaClient, now: Date): Promise<void> {
  const today = toProgrammeDate(now);
  const currentCycle = cycleContaining(today);

  // ── wipe exactly what we own ─────────────────────────────────────────────
  const seedUsers = await prisma.user.findMany({ where: { externalId: { in: [...SEED_EXTERNAL_IDS] } } });
  const ids = seedUsers.map((u) => u.id);
  await prisma.$transaction([
    prisma.award.deleteMany({ where: { evaluation: { studentId: { in: ids } } } }),
    prisma.override.deleteMany({ where: { evaluation: { studentId: { in: ids } } } }),
    prisma.evaluation.deleteMany({ where: { studentId: { in: ids } } }),
    prisma.entry.deleteMany({ where: { studentId: { in: ids } } }),
    prisma.dailyReport.deleteMany({ where: { studentId: { in: ids } } }),
    prisma.mentorDayRecord.deleteMany({ where: { studentId: { in: ids } } }),
    prisma.absenceRecord.deleteMany({ where: { studentId: { in: ids } } }),
    prisma.enrolment.deleteMany({ where: { studentId: { in: ids } } }),
    prisma.cycle.deleteMany({ where: { batch: { name: { in: Object.values(SEED_BATCH_NAMES) } } } }),
    prisma.batch.deleteMany({ where: { name: { in: Object.values(SEED_BATCH_NAMES) } } }),
    prisma.user.deleteMany({ where: { id: { in: ids } } }),
  ]);

  // ── users ────────────────────────────────────────────────────────────────
  const mentorRows: { id: string }[] = [];
  for (const m of SEED_MENTORS) {
    mentorRows.push(await prisma.user.create({
      data: { externalId: m.externalId, email: m.email, displayName: m.name, role: "ADMIN" },
    }));
  }
  const studentRows = new Map<string, { id: string }>();
  for (const s of SEED_STUDENTS) {
    const row = await prisma.user.create({
      data: { externalId: s.externalId, email: s.email, displayName: s.name, role: "STUDENT" },
    });
    studentRows.set(s.externalId, row);
  }
  const studentIds = [...studentRows.values()].map((r) => r.id);

  // ── batches: A two cycles back, B at the current cycle start ────────────
  const batches = createBatchRepo(prisma);
  const aStart = shiftCycle(currentCycle.start, -2);
  const bStart = currentCycle.start;
  const batchA = await batches.create({ name: SEED_BATCH_NAMES.A, startDate: aStart, endDate: addDays(shiftCycle(aStart, 6), -1) });
  const batchB = await batches.create({ name: SEED_BATCH_NAMES.B, startDate: bStart, endDate: addDays(shiftCycle(bStart, 6), -1) });
  const batchIds = { A: batchA.id, B: batchB.id };

  // ── enrolments ───────────────────────────────────────────────────────────
  const transferDate = bStart; // Amaya moves A -> B when B opens
  for (const s of SEED_STUDENTS) {
    const id = studentRows.get(s.externalId)!.id;
    if (s.kind === "transfer") {
      await batches.enrol(id, batchIds.A, aStart);
      await batches.transfer(id, batchIds.B, transferDate);
    } else if (s.kind === "joiner") {
      // First weekday at least 3 days into the current cycle (FR-27 setup).
      let join = addDays(currentCycle.start, 3);
      while (!isWeekday(join)) join = addDays(join, 1);
      await batches.enrol(id, batchIds.B, join);
    } else {
      await batches.enrol(id, batchIds[s.batch], s.batch === "A" ? aStart : bStart);
    }
  }

  // ── entries, absences ────────────────────────────────────────────────────
  const entries = createEntryRepo(prisma);
  const absences = createAbsenceRepo(prisma);

  for (const s of SEED_STUDENTS) {
    const id = studentRows.get(s.externalId)!.id;
    const enrolment = await prisma.enrolment.findFirstOrThrow({
      where: { studentId: id }, orderBy: { startDate: "asc" },
    });
    const from = fromDbDate(enrolment.startDate);
    // The archived student stops three weeks after their batch starts.
    const to = s.kind === "archived" ? addDays(from, 21) : today;
    if (compareDates(from, to) > 0) continue;

    const days = workingDaysBetween(from, to);
    const salt = [...s.externalId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

    // Never write an instant later than `now` — skip, don't clamp. A morning
    // seed run leaves today honestly pending; an evening run shows it
    // submitted. `hasHappened` is the ONLY gate; the engine still owns flags.
    const hasHappened = (instant: Date): boolean => instant.getTime() <= now.getTime();

    for (const [i, day] of days.entries()) {
      const plan = planFor(s, i);
      if (plan.kind === "skip") continue;
      if (plan.kind === "absent") {
        await absences.create({ studentId: id, date: day, reason: plan.reason });
        continue;
      }
      if (plan.kind === "late") {
        // Next weekday, 09:40 Colombo — inside grace, flagged late by the engine.
        const next = nextWeekday(day);
        const at = colomboInstant(next, "09:40");
        if (hasHappened(at)) {
          await entries.addEntry({ studentId: id, entryDate: day, body: prose(i, salt), submittedAt: at });
        }
        continue;
      }
      const at = colomboInstant(day, plan.time);
      if (!hasHappened(at)) continue;
      await entries.addEntry({ studentId: id, entryDate: day, body: prose(i, salt), submittedAt: at });
      // A second same-day entry every 6th day — FR-11 roll-up visible.
      const second = colomboInstant(day, "18:05");
      if (i % 6 === 5 && hasHappened(second)) {
        await entries.addEntry({ studentId: id, entryDate: day, body: prose(i + 3, salt), submittedAt: second });
      }
    }

    // Weekend persona: every Saturday between from..to, an Extra entry.
    if (s.kind === "weekend") {
      let cursor = from;
      while (compareDates(cursor, to) <= 0) {
        if (dayOfWeek(cursor) === 6) {
          const at = colomboInstant(cursor, "11:00");
          if (hasHappened(at)) {
            await entries.addEntry({
              studentId: id, entryDate: cursor,
              body: "Spent the morning polishing the demo and reading the review-queue docs.",
              submittedAt: at,
            });
          }
        }
        cursor = addDays(cursor, 1);
      }
    }
  }

  // ── review statuses + mentor records (state, not flags) ─────────────────
  const mentorRecords = createMentorRecordRepo(prisma);
  const mentor1 = mentorRows[0]!;
  const evaluatedBefore = toDbDate(addDays(today, -14));
  const inReviewBefore = toDbDate(addDays(today, -7));

  // Scoped to studentId: { in: studentIds } -- without it, this rewrites and
  // locks any non-seed student's reports too, and the next seed run's wipe
  // (which only deletes seed-owned rows) hits a mentor-record FK still
  // pointing at a report this update just moved to EVALUATED.
  await prisma.dailyReport.updateMany({
    where: { reportDate: { lt: evaluatedBefore }, studentId: { in: studentIds } },
    data: { status: "EVALUATED", reviewedById: mentor1.id, evaluatedAt: now, inReviewAt: now },
  });
  await prisma.dailyReport.updateMany({
    where: { reportDate: { lt: inReviewBefore, gte: evaluatedBefore }, studentId: { in: studentIds } },
    data: { status: "IN_REVIEW", reviewedById: mentor1.id, inReviewAt: now },
  });

  const evaluated = await prisma.dailyReport.findMany({
    where: { status: "EVALUATED", studentId: { in: studentIds } },
  });
  for (const report of evaluated) {
    const reportDate = fromDbDate(report.reportDate);
    if (!isWeekday(reportDate)) continue;
    await mentorRecords.upsert({
      studentId: report.studentId,
      date: reportDate,
      attended: true,
      tasksCompleted: true,
      recordedById: mentor1.id,
    });
  }

  // ── archive + cycles ─────────────────────────────────────────────────────
  const archived = SEED_STUDENTS.find((s) => s.kind === "archived")!;
  await prisma.user.update({
    where: { externalId: archived.externalId },
    data: { deletedAt: now },
  });

  const cycles = createCycleRepo(prisma);
  await cycles.ensureCycles(batchIds.A, today);
  await cycles.ensureCycles(batchIds.B, today);
}
```

`apps/api/prisma/seed.ts` — the CLI wrapper (run by tsx only; deliberately
outside `src` so the build never ships it, while all the logic it calls IS
typechecked and built):

```typescript
import { createPrismaClient } from "../src/db/client.js";
import { runSeed } from "../src/seed/run-seed.js";

try {
  process.loadEnvFile(); // picks up apps/api/.env locally
} catch {
  /* CI provides DATABASE_URL via the environment; no .env file exists there */
}

// Same posture as the dev-bypass guard: demo data never enters production,
// and the comparison is case-insensitive so NODE_ENV=Production still trips.
// Loading .env FIRST and guarding ONCE, after, covers both cases: Node's
// loadEnvFile never overrides an already-set variable, so a shell-exported
// NODE_ENV=production is untouched by the load, and a .env-file-set
// NODE_ENV=production is visible by the time this check runs. Guarding
// before the load would miss the .env case entirely.
if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
  console.error("[seed] refusing to run with NODE_ENV=production — demo data never enters production.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[seed] DATABASE_URL is not set.");
  process.exit(1);
}

const prisma = createPrismaClient(url);
try {
  await runSeed(prisma, new Date());
  console.log("[seed] done.");
} catch (error) {
  console.error("[seed] failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
```

Add to `apps/api/package.json` scripts:

```json
"db:seed": "tsx prisma/seed.ts"
```

- [ ] **Step 4: Run the seed test**

```powershell
pnpm --filter @irp/api exec vitest run test/seed.test.ts
```

Expected: 9 passing. If `SubmissionWindowClosedError` surfaces, a persona pattern produced an impossible instant — fix the pattern, never the guard.

- [ ] **Step 5: Run the seed for real and eyeball it**

```powershell
pnpm --filter @irp/api db:seed
```

Expected: `[seed] done.` Then sanity-query:

```powershell
docker compose -f apps\api\docker-compose.yml exec db psql -U irp -d irp -c "SELECT \"displayName\", role, \"deletedAt\" IS NOT NULL AS archived FROM \"User\" ORDER BY role, \"displayName\";"
```

- [ ] **Step 6: Swap CI's manual INSERT for the seed**

In `.github/workflows/ci.yml`, replace the body of the "Seed the dev users the e2e test expects" step (the two `psql` lines and the `PSQL_URL` preamble) with:

```yaml
      - name: Seed the demo data the e2e suite expects
        if: matrix.timezone == 'UTC'
        run: |
          pnpm --filter @irp/api db:seed
```

Keep the step's surrounding comment about why it runs after the unit suite, updating its text to name the seed script instead of psql. `DATABASE_URL` is already exported at the job level, and the seed's `loadEnvFile` fallback tolerates the missing `.env`.

- [ ] **Step 7: Full local gate**

```powershell
pnpm --filter @irp/api test
pnpm lint
pnpm typecheck
```

Expected: everything green (the e2e suite itself is checked in Task 10's verification).

- [ ] **Step 8: Commit**

```powershell
git add apps/api/src/seed/run-seed.ts apps/api/prisma/seed.ts apps/api/package.json apps/api/test/seed.test.ts .github/workflows/ci.yml
git commit -m "feat(api): idempotent engine-driven demo seed -- 2x5 personas, every edge case (T-07)"
```

---

### Task 10: Docs + whole-branch verification

**Files:**
- Modify: `apps/web/e2e/README.md` (manual INSERT superseded by `db:seed`)
- Modify: `handoff.md` (§2a Plan 5 row → this plan; §3 position note)
- Test: full verification suite

- [ ] **Step 1: Update the e2e README**

Replace the manual-INSERT instructions (§2 of the README, the SQL block and the psql-stdin guidance) with:

```markdown
2. The seeded demo data. `dev-unknown-1` is deliberately absent —
   the test asserts it produces a 403.

   **Re-seed before every Playwright run.** `apps/api`'s own test suites
   `TRUNCATE` the database, so a `pnpm --filter @irp/api test` run wipes
   the demo rows even if you seeded earlier in the session.

   ```powershell
   pnpm --filter @irp/api db:seed
   ```

   The seed is idempotent and covers far more than the two users the old
   manual INSERT created — see `docs/superpowers/specs/2026-08-02-slice-2-product-design.md` §6.
```

- [ ] **Step 2: Update handoff.md**

In §2a, change the Plan 5 row's status from `Not started` to `✅ **This plan.**` wording consistent with the other rows, and add the plan/spec filenames. In §3 "Current position", add one paragraph: Plan 5 complete on `feat/plan-5-data-model-and-seed` — full schema, repositories, cycle materialisation, `@irp/fixtures`, engine-driven seed; CI now seeds e2e data via `db:seed`; no API surface change.

- [ ] **Step 3: Whole-branch verification**

```powershell
$env:DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'
pnpm lint
pnpm typecheck
pnpm --filter @irp/api test
pnpm --filter @irp/web test
pnpm spec:lint
$env:AUTH_DEV_BYPASS='false'; pnpm --filter @irp/web build
pnpm --filter @irp/api db:seed
pnpm --filter @irp/web exec playwright test
```

Expected: all green. The Playwright run needs both dev servers down first (Playwright starts its own) and the seed re-run beforehand (the API suite truncates).

- [ ] **Step 4: Commit**

```powershell
git add apps/web/e2e/README.md handoff.md
git commit -m "docs: seed supersedes the manual e2e INSERT; handoff records Plan 5"
```

- [ ] **Step 5: Push and open the PR**

```powershell
git push -u origin feat/plan-5-data-model-and-seed
gh pr create --title "Plan 5: full data model + engine-driven seed" --body "Implements T-05 (full), T-07. FR-5, FR-6, FR-8, FR-9, FR-10, FR-11, FR-13, FR-16, FR-18, FR-19, FR-20, FR-27 (data layer), FR-31-FR-33 (schema only).

Spec: docs/superpowers/specs/2026-08-02-slice-2-product-design.md (SS3, SS6, SS8)
Plan: docs/superpowers/plans/2026-08-02-plan-5-data-model-and-seed.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Remember: CI runs on the PR, not on a bare branch push — open the PR or the checks never run.
