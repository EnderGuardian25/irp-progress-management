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
