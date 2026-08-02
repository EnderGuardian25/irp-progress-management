import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createEntryRepo } from "../src/db/entry-repo.js";
import { createAbsenceRepo } from "../src/db/absence-repo.js";
import { createBatchRepo } from "../src/db/batch-repo.js";
import { colomboInstant } from "../src/db/civil-date-map.js";
import { createDayService } from "../src/services/day-service.js";
import { createDashboardService } from "../src/services/dashboard-service.js";
import { BatchNotFoundError, InvalidCycleError } from "../src/domain/errors.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

// A fixed cycle with no dependence on the machine clock. 2026-07-10 is a
// Friday, so this cycle's required days start 07-10, 07-13 (Mon) ... and
// 2026-08-03 is the Monday three weeks in. 2026-08-05 (Wednesday) is "now".
const CYCLE_START = civilDate("2026-07-10");
const MON = civilDate("2026-08-03");
const SAT = civilDate("2026-08-01");
const NOW = colomboInstant(civilDate("2026-08-05"), "10:00");

// 2026-10-10 is itself a Saturday, confirmed with @irp/core's dayOfWeek.
// (Do not re-derive it from the 2026-08-03 Monday anchor above by eye: the
// gap is 68 days, not the 35 an earlier version of this comment claimed --
// 68 mod 7 = 5, Monday + 5 = Saturday. The arithmetic is easy to get wrong
// and the conclusion happened to survive it. Run dayOfWeek if you move
// this date.)
// So the cycle it opens has no required day of its own before the following
// Monday, and cycleWorkingDays() over that cycle's bounds
// ({ start: "2026-10-10", end: "2026-11-09" }) confirms its first entry is
// 2026-10-12.
const WEEKEND_CYCLE_START = civilDate("2026-10-10");
const WEEKEND_CYCLE_FIRST_REQUIRED = civilDate("2026-10-12");

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

  it("clamps to the cycle's first required day when the cycle itself opens on a weekend", async () => {
    const batch = await batchRepo.create({
      name: "Batch Weekend Open", startDate: WEEKEND_CYCLE_START, endDate: civilDate("2027-04-09"),
    });
    const s = await student("dash-weekend-open", "Weekend Open");
    await batchRepo.enrol(s.id, batch.id, WEEKEND_CYCLE_START);

    // "Now" is the cycle-opening Saturday itself, before any required day of
    // the cycle has arrived.
    const view = await dashboards.batchToday(batch.id, colomboInstant(WEEKEND_CYCLE_START, "12:00"));

    expect(view.date).toBe(WEEKEND_CYCLE_FIRST_REQUIRED);
    expect(view.isFallbackDay).toBe(true);
    expect(view.dayNumber).toBe(1);
    expect(view.counts.enrolled).toBe(1);
    expect(view.counts.submitted).toBe(0);
    expect(view.counts.late).toBe(0);
    expect(view.counts.absent).toBe(0);
    expect(view.counts.missed).toBe(0);
    expect(view.counts.pending).toBe(0);
  });

  it("returns a full days array with zero enrolled counts for a batch with no enrolments", async () => {
    const batch = await batchRepo.create({
      name: "Batch No Enrolments", startDate: CYCLE_START, endDate: civilDate("2027-01-09"),
    });

    const view = await dashboards.batchToday(batch.id, NOW);

    expect(view.days).toHaveLength(view.cycle.requiredDayCount);
    expect(view.days.every((d) => d.enrolled === 0)).toBe(true);
    expect(view.extraCount).toBe(0);
    expect(view.extraAfter).toEqual([]);
  });

  it("drops a weekend Extra whose anchor precedes the cycle start, rather than mis-attributing it", async () => {
    const batch = await batchRepo.create({
      name: "Batch Weekend Extra At Open", startDate: WEEKEND_CYCLE_START, endDate: civilDate("2027-04-09"),
    });
    const s = await student("dash-weekend-extra-open", "Weekend Extra Open");
    await batchRepo.enrol(s.id, batch.id, WEEKEND_CYCLE_START);
    // WEEKEND_CYCLE_START (2026-10-10) is the Saturday the cycle itself opens
    // on. previousWeekday(2026-10-10) is 2026-10-09 (the preceding Friday),
    // which precedes the cycle's own start -- the branch under test.
    await entryRepo.addEntry({
      studentId: s.id, entryDate: WEEKEND_CYCLE_START, body: "Weekend polish before the cycle's first weekday.",
      submittedAt: colomboInstant(WEEKEND_CYCLE_START, "11:00"),
    });

    const view = await dashboards.batchToday(batch.id, colomboInstant(WEEKEND_CYCLE_FIRST_REQUIRED, "10:00"));

    // The Extra is counted but anchors nowhere: previousWeekday(2026-10-10)
    // is 2026-10-09, which precedes this cycle's start, so the slot is
    // DROPPED rather than attributed to the previous cycle's last Friday.
    expect(view.extraCount).toBe(1);
    expect(view.extraAfter).toEqual([]);
  });

  it("throws BatchNotFoundError for an unknown batch id", async () => {
    await expect(dashboards.batchToday("00000000-0000-0000-0000-000000000000", NOW))
      .rejects.toBeInstanceOf(BatchNotFoundError);
  });
});

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
    // Independently derived from @irp/core against this fixture (see the
    // fix-wave report for the scratch script): the cycle 2026-07-10 ..
    // 2026-08-09 has 21 weekdays. Each one with no entry/absence classifies
    // via classifyDay(date, facts, NOW) as: 07-10 and 07-16..07-31 and 08-03
    // (14 days) "missed" -- their grace (end of the next weekday) has closed
    // by NOW; 08-04 and 08-05 "pending" -- 08-04's grace closes end of 08-05,
    // 08-05 (today) closes end of 08-06, neither has passed at NOW's 10:00;
    // 08-06 and 08-07 "future". Settled = 14 missed + the 3 recorded outcomes
    // (onTime/late/absent) above = 17; requiredDays = 21 (17 settled + 2
    // pending + 2 future); complianceRate = round4(3/17) = 0.1765.
    expect(row.counts.requiredDays).toBe(21);
    expect(row.counts.missed).toBe(14);
    expect(row.counts.settledDays).toBe(17);
    expect(row.counts.complianceRate).toBe(0.1765);
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

  // BATCH_OFF_TENTH admits on the 15th, not the 10th, so FR-27 pushes its
  // first evaluated cycle to the FOLLOWING month: firstEvaluatedCycleStart
  // (2026-06-15) is 2026-07-10, not 2026-06-10. BEFORE_FIRST_CYCLE is a "now"
  // that precedes that opening, so cycleFor(today, batch.startDate) is null
  // -- the `currentSeq === null` branch these two tests exist to exercise.
  const BATCH_OFF_TENTH_START = civilDate("2026-06-15");
  const BEFORE_FIRST_CYCLE = colomboInstant(civilDate("2026-06-20"), "09:00");

  it("defaults to cycle 1 and reports everything future before a batch's first evaluated cycle opens", async () => {
    const batch = await batchRepo.create({
      name: "Batch Off Tenth", startDate: BATCH_OFF_TENTH_START, endDate: civilDate("2027-05-09"),
    });
    const s = await prisma.user.create({
      data: { externalId: "sum-off-tenth", email: "sum-off-tenth@dev.local", displayName: "Off Tenth", role: "STUDENT" },
    });
    await batchRepo.enrol(s.id, batch.id, BATCH_OFF_TENTH_START);

    const view = await dashboards.batchSummary(batch.id, undefined, BEFORE_FIRST_CYCLE);

    // seq defaults via `cycleSeq ?? currentSeq ?? 1` with currentSeq null, to 1.
    expect(view.cycle.seq).toBe(1);
    expect(view.cycle.startDate).toBe(civilDate("2026-07-10"));
    expect(view.cycle.endDate).toBe(civilDate("2026-08-09"));
    const row = view.students.find((r) => r.student.id === s.id)!;
    expect(row.counts.settledDays).toBe(0);
    expect(row.counts.complianceRate).toBeNull();
  });

  it("rejects cycle 2 with InvalidCycleError when the batch has no evaluated cycle yet", async () => {
    const batch = await batchRepo.create({
      name: "Batch Off Tenth Reject", startDate: BATCH_OFF_TENTH_START, endDate: civilDate("2027-05-09"),
    });
    // currentSeq is null (no evaluated cycle yet); the guard is
    // `currentSeq === null && seq > 1`, distinct from the currentSeq-not-null
    // guard the previous test exercises.
    await expect(dashboards.batchSummary(batch.id, 2, BEFORE_FIRST_CYCLE))
      .rejects.toBeInstanceOf(InvalidCycleError);
  });

  it("collapses a transfer-out-and-back into one roster row, and clips counts to time actually spent in this batch", async () => {
    const batchA = await batchRepo.create({
      name: "Batch Transfer A", startDate: CYCLE_START, endDate: civilDate("2027-01-09"),
    });
    const batchB = await batchRepo.create({
      name: "Batch Transfer B", startDate: CYCLE_START, endDate: civilDate("2027-01-09"),
    });
    const s = await prisma.user.create({
      data: { externalId: "sum-transfer", email: "sum-transfer@dev.local", displayName: "Transfer", role: "STUDENT" },
    });

    // A: 07-10..07-12 (on time on the 07-10 Friday) -> B: 07-13..07-19 -> A: 07-20..open (on time on the 07-20 Monday).
    await batchRepo.enrol(s.id, batchA.id, CYCLE_START);
    await entryRepo.addEntry({
      studentId: s.id, entryDate: CYCLE_START, body: "Onboard.",
      submittedAt: colomboInstant(CYCLE_START, "17:00"),
    });
    await batchRepo.transfer(s.id, batchB.id, civilDate("2026-07-13"));
    await batchRepo.transfer(s.id, batchA.id, civilDate("2026-07-20"));
    await entryRepo.addEntry({
      studentId: s.id, entryDate: civilDate("2026-07-20"), body: "Back in A.",
      submittedAt: colomboInstant(civilDate("2026-07-20"), "17:00"),
    });

    const view = await dashboards.batchSummary(batchA.id, undefined, NOW);
    const rows = view.students.filter((r) => r.student.id === s.id);

    // Exactly one row despite two enrolment intervals in batch A.
    expect(rows).toHaveLength(1);
    const row = rows[0]!;

    // Independently derived (see the fix-wave report's scratch script):
    // batch A's own weekdays in this cycle are 07-10 and 07-20..08-07 (16 of
    // the cycle's 21 weekdays -- 07-13..07-17, the 5 weekdays spent enrolled
    // in B, are excluded). Of those 16: 07-10 and 07-20 onTime (2 entries
    // above); 07-21..08-03 (10 weekdays) missed, no entry/absence and grace
    // closed by NOW; 08-04/08-05 pending; 08-06/08-07 future. Settled =
    // 2 onTime + 10 missed = 12; complianceRate = round4(2/12) = 0.1667.
    // Before this fix, `countCycle` trusted `day.status !== "none"` as the
    // obligation check, which is student- not batch-scoped -- the student
    // was enrolled in B throughout, so those days never read "none" and
    // batch A's row wrongly absorbed them (requiredDays 21, missed 15,
    // complianceRate 0.1176). A real defect, fixed alongside this test.
    expect(row.counts.requiredDays).toBe(16);
    expect(row.counts.settledDays).toBe(12);
    expect(row.counts.onTime).toBe(2);
    expect(row.counts.missed).toBe(10);
    expect(row.counts.pending).toBe(2);
    expect(row.counts.complianceRate).toBe(0.1667);
  });

  it("throws BatchNotFoundError for an unknown batch id", async () => {
    await expect(dashboards.batchSummary("00000000-0000-0000-0000-000000000000", undefined, NOW))
      .rejects.toBeInstanceOf(BatchNotFoundError);
  });
});
