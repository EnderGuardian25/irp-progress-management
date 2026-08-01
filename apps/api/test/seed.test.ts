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
