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
