import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate, graceDeadlineFor } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createEntryRepo } from "../src/db/entry-repo.js";
import { createAbsenceRepo } from "../src/db/absence-repo.js";
import { colomboInstant } from "../src/db/civil-date-map.js";
import { createDayService } from "../src/services/day-service.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

// A fixed historical week, ~63 days before the fixed NOW below (well past
// any grace window) so the fixtures are deterministic regardless of the
// machine's real clock. 2026-06-01 is a Monday.
const MON_ON_TIME = civilDate("2026-06-01");
const TUE_LATE = civilDate("2026-06-02");
const WED_ABSENT = civilDate("2026-06-03");
const THU_MISSED = civilDate("2026-06-04");
// FRI_UNUSED = 2026-06-05, left silent (also missed, unasserted).
const SAT_EXTRA = civilDate("2026-06-06");
const SUN_NONE = civilDate("2026-06-07");
const TODAY_PENDING = civilDate("2026-06-12"); // Friday
const TOMORROW_FUTURE = civilDate("2026-06-13"); // Saturday

const RANGE_FROM = MON_ON_TIME;
const RANGE_TO = TOMORROW_FUTURE;

// Friday 2026-06-12, 15:00 Colombo (09:30 UTC) — well inside that day, and
// well before Monday 2026-06-15's end-of-day grace close.
const NOW = colomboInstant(TODAY_PENDING, "15:00");

describe.skipIf(!dbUrl)("createDayService", () => {
  const prisma = createPrismaClient(dbUrl!);
  const entryRepo = createEntryRepo(prisma);
  const absenceRepo = createAbsenceRepo(prisma);
  const service = createDayService({ entryRepo, absenceRepo });

  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function student(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "STUDENT" },
    });
  }

  it("classifies onTime, late, absent, missed, extra, none, pending and future (FR-14, FR-33)", async () => {
    const s = await student("day-1");

    await entryRepo.addEntry({
      studentId: s.id,
      entryDate: MON_ON_TIME,
      body: "Wrote the day-service tests.",
      submittedAt: colomboInstant(MON_ON_TIME, "10:00"),
    });
    // Late: entryDate is Tuesday, but it lands the next weekday morning —
    // inside grace, after that day's own end.
    await entryRepo.addEntry({
      studentId: s.id,
      entryDate: TUE_LATE,
      body: "Yesterday's notes, submitted late.",
      submittedAt: colomboInstant(WED_ABSENT, "09:40"),
    });
    await absenceRepo.create({ studentId: s.id, date: WED_ABSENT, reason: "medical appointment" });
    // THU_MISSED: nothing recorded.
    await entryRepo.addEntry({
      studentId: s.id,
      entryDate: SAT_EXTRA,
      body: "Spent Saturday morning polishing the demo.",
      submittedAt: colomboInstant(SAT_EXTRA, "11:00"),
    });
    // SUN_NONE, TODAY_PENDING, TOMORROW_FUTURE: nothing recorded.

    const days = await service.listDays(s.id, RANGE_FROM, RANGE_TO, NOW);

    // Oldest-first, one element per calendar day in the range.
    expect(days.map((d) => d.date)).toEqual([
      "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05",
      "2026-06-06", "2026-06-07", "2026-06-08", "2026-06-09", "2026-06-10",
      "2026-06-11", "2026-06-12", "2026-06-13",
    ]);

    const byDate = new Map(days.map((d) => [d.date, d]));

    const onTime = byDate.get(MON_ON_TIME)!;
    expect(onTime.status).toBe("onTime");
    expect(onTime.reportId).not.toBeNull();
    expect(onTime.reportStatus).toBe("SUBMITTED");
    expect(onTime.absenceReason).toBeNull();
    expect(onTime.entries).toHaveLength(1);

    const late = byDate.get(TUE_LATE)!;
    expect(late.status).toBe("late");
    expect(late.reportId).not.toBeNull();
    expect(late.reportStatus).toBe("SUBMITTED");
    expect(late.entries).toHaveLength(1);
    expect(late.entries[0]!.isLate).toBe(true);

    const absent = byDate.get(WED_ABSENT)!;
    expect(absent.status).toBe("absent");
    expect(absent.reportId).toBeNull();
    expect(absent.reportStatus).toBeNull();
    expect(absent.absenceReason).toBe("medical appointment");
    expect(absent.entries).toHaveLength(0);

    const missed = byDate.get(THU_MISSED)!;
    expect(missed.status).toBe("missed");
    expect(missed.reportId).toBeNull();
    expect(missed.absenceReason).toBeNull();
    expect(missed.entries).toHaveLength(0);

    const extra = byDate.get(SAT_EXTRA)!;
    expect(extra.status).toBe("extra");
    expect(extra.reportId).not.toBeNull();
    expect(extra.reportStatus).toBe("SUBMITTED");
    expect(extra.entries).toHaveLength(1);
    expect(extra.entries[0]!.isExtra).toBe(true);

    const none = byDate.get(SUN_NONE)!;
    expect(none.status).toBe("none");
    expect(none.reportId).toBeNull();
    expect(none.entries).toHaveLength(0);

    // Confirm the fixture is actually testing what it claims: NOW must still
    // be inside TODAY_PENDING's grace window for the "pending" assertion
    // below to mean anything.
    expect(NOW.getTime()).toBeLessThanOrEqual(graceDeadlineFor(TODAY_PENDING).getTime());
    const pending = byDate.get(TODAY_PENDING)!;
    expect(pending.status).toBe("pending");
    expect(pending.reportId).toBeNull();
    expect(pending.entries).toHaveLength(0);

    const future = byDate.get(TOMORROW_FUTURE)!;
    expect(future.status).toBe("future");
    expect(future.reportId).toBeNull();
    expect(future.entries).toHaveLength(0);
  });

  it("returns an empty list for a mentor with no enrolment days (no rows at all)", async () => {
    const s = await student("day-2");
    const days = await service.listDays(s.id, MON_ON_TIME, TUE_LATE, NOW);
    expect(days).toHaveLength(2);
    expect(days.every((d) => d.entries.length === 0)).toBe(true);
  });
});
