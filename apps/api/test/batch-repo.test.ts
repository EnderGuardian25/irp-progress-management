import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { fromDbDate } from "../src/db/civil-date-map.js";
import { createBatchRepo } from "../src/db/batch-repo.js";
import { OpenEnrolmentExistsError, NoOpenEnrolmentError, InvalidTransferDateError } from "../src/domain/errors.js";
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

  it("enrol() maps a second open enrolment to OpenEnrolmentExistsError", async () => {
    const s = await student("t-4");
    const b = await repo.create({ name: "B4", startDate: civilDate("2026-07-10"), endDate: civilDate("2027-01-09") });
    await repo.enrol(s.id, b.id, civilDate("2026-06-10"));
    await expect(repo.enrol(s.id, b.id, civilDate("2026-06-10")))
      .rejects.toBeInstanceOf(OpenEnrolmentExistsError);
  });

  it("transfer() without an open enrolment throws NoOpenEnrolmentError", async () => {
    const freshStudent = await student("t-5");
    const b = await repo.create({ name: "B5", startDate: civilDate("2026-07-10"), endDate: civilDate("2027-01-09") });
    await expect(repo.transfer(freshStudent.id, b.id, civilDate("2026-06-10")))
      .rejects.toBeInstanceOf(NoOpenEnrolmentError);
  });

  it("transfer closes the old enrolment the day BEFORE the effective date (ADR-0017)", async () => {
    const s = await student("t-6");
    const a = await repo.create({ name: "A6", startDate: civilDate("2026-05-10"), endDate: civilDate("2026-11-09") });
    const b = await repo.create({ name: "B6", startDate: civilDate("2026-06-10"), endDate: civilDate("2026-12-09") });
    await repo.enrol(s.id, a.id, civilDate("2026-05-10"));

    const next = await repo.transfer(s.id, b.id, civilDate("2026-06-15"));
    const rows = await prisma.enrolment.findMany({
      where: { studentId: s.id }, orderBy: { startDate: "asc" },
    });
    expect(fromDbDate(rows[0]!.endDate!)).toBe("2026-06-14");
    expect(next.startDate).toBe("2026-06-15");
  });

  it("transfer on/before the open enrolment's start is rejected", async () => {
    const s2 = await student("t-7");
    const b = await repo.create({ name: "B7", startDate: civilDate("2026-06-10"), endDate: civilDate("2026-12-09") });
    await repo.enrol(s2.id, b.id, civilDate("2026-05-10"));
    await expect(repo.transfer(s2.id, b.id, civilDate("2026-05-10")))
      .rejects.toBeInstanceOf(InvalidTransferDateError);
  });

  it("listEnrolments returns every row for the student, startDate ascending, including a transfer's closed history", async () => {
    const s = await student("t-8");
    const a = await repo.create({ name: "A8", startDate: civilDate("2026-05-10"), endDate: civilDate("2026-11-09") });
    const b = await repo.create({ name: "B8", startDate: civilDate("2026-07-10"), endDate: civilDate("2027-01-09") });
    await repo.enrol(s.id, a.id, civilDate("2026-05-10"));
    await repo.transfer(s.id, b.id, civilDate("2026-07-10"));

    const rows = await repo.listEnrolments(s.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.batchId).toBe(a.id);
    expect(rows[0]!.startDate).toBe("2026-05-10");
    expect(rows[0]!.endDate).toBe("2026-07-09"); // closed the day before the transfer
    expect(rows[1]!.batchId).toBe(b.id);
    expect(rows[1]!.endDate).toBeNull(); // still open
  });

  it("listEnrolments returns an empty array for a student with no enrolment history", async () => {
    const s = await student("t-9");
    expect(await repo.listEnrolments(s.id)).toEqual([]);
  });
});
