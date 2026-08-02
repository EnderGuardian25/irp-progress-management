import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { isWeekday, submissionWindow } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createAbsenceRepo } from "../src/db/absence-repo.js";
import { createEntryRepo } from "../src/db/entry-repo.js";
import { toDbDate } from "../src/db/civil-date-map.js";
import { AbsentDayConflictError, EntryConflictError } from "../src/domain/errors.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

// ADR-0016: a day cannot hold both entries and an absence. This is a
// probabilistic race test, not a deterministic one — without the lock it
// may still pass by luck on a given run. Measured: with lockStudentDay
// removed from both call sites, this exact test failed 5/5 runs (see task
// report). The lock's correctness is also verified by inspection of the
// transaction bodies in entry-repo.ts / absence-repo.ts; this test is a net
// on top of that, not a substitute for it.
const ROUNDS = 20;

describe.skipIf(!dbUrl)("student-day advisory lock (ADR-0016)", () => {
  const prisma = createPrismaClient(dbUrl!);
  const entries = createEntryRepo(prisma);
  const absences = createAbsenceRepo(prisma);

  beforeEach(async () => { await resetDb(prisma); });
  afterAll(async () => { await prisma.$disconnect(); });

  async function student(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "STUDENT" },
    });
  }

  it("never lets a concurrent entry and absence both commit for the same student-day", async () => {
    const now = new Date();
    const window = submissionWindow(now);
    const day = window.targetDates.find(isWeekday);
    expect(day, "submission window unexpectedly held no weekday target — fix the test's day pick, not this assertion").toBeDefined();

    for (let i = 0; i < ROUNDS; i++) {
      const s = await student(`race-${i}`);

      const [entryResult, absenceResult] = await Promise.allSettled([
        entries.addEntry({ studentId: s.id, entryDate: day!, body: `entry ${i}`, submittedAt: now }),
        absences.create({ studentId: s.id, date: day!, reason: `absence ${i}` }),
      ]);

      // ADR-0016: "whichever transaction wins, the loser re-runs its check
      // after the lock clears and throws the correct DomainError" — not just
      // any rejection.
      if (entryResult.status === "rejected") {
        expect(entryResult.reason).toBeInstanceOf(AbsentDayConflictError);
      }
      if (absenceResult.status === "rejected") {
        expect(absenceResult.reason).toBeInstanceOf(EntryConflictError);
      }

      const [entryCount, absenceCount] = await Promise.all([
        prisma.entry.count({ where: { studentId: s.id, entryDate: toDbDate(day!) } }),
        prisma.absenceRecord.count({ where: { studentId: s.id, date: toDbDate(day!) } }),
      ]);

      // The invariant: never both.
      expect(entryCount > 0 && absenceCount > 0).toBe(false);
      // At least one side should have won the race.
      expect(entryCount + absenceCount).toBeGreaterThan(0);
    }
  });
});
