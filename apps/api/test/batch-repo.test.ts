import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createBatchRepo } from "../src/db/batch-repo.js";
import { OpenEnrolmentExistsError, NoOpenEnrolmentError } from "../src/domain/errors.js";
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
});
