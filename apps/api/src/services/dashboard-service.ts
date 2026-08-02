import {
  compareDates, cycleContaining, cycleFor, cycleWorkingDays,
  isWeekday, previousWeekday, toProgrammeDate,
  type CivilDate, type CycleBounds, type DayStatus,
} from "@irp/core";
import type { BatchRecord, BatchRepo, RosterEnrolment } from "../db/batch-repo.js";
import type { DayService, DayView } from "./day-service.js";
import { BatchNotFoundError } from "../domain/errors.js";

export interface CycleView {
  seq: number | null;
  startDate: CivilDate;
  endDate: CivilDate;
  requiredDayCount: number;
}

export interface DayCompliance {
  date: CivilDate;
  enrolled: number;
  submitted: number;
  late: number;
  absent: number;
  missed: number;
  pending: number;
}

export interface BatchTodayView {
  batch: BatchRecord;
  date: CivilDate;
  isFallbackDay: boolean;
  dayNumber: number;
  cycle: CycleView;
  counts: DayCompliance;
  extraCount: number;
  days: DayCompliance[];
  extraAfter: CivilDate[];
}

export interface DashboardService {
  batchToday(batchId: string, now: Date): Promise<BatchTodayView>;
}

/** Whether an enrolment interval covers `d` (open-ended when endDate is null). */
function covers(e: RosterEnrolment, d: CivilDate): boolean {
  return compareDates(e.startDate, d) <= 0 && (e.endDate === null || compareDates(e.endDate, d) >= 0);
}

/**
 * The required day a batch dashboard reports on.
 *
 * Today when today is a weekday inside the cycle; otherwise the most recent
 * required day at or before today, CLAMPED to the cycle. The clamp matters at a
 * boundary: a cycle opening on a Saturday has no earlier required day of its
 * own, and reaching into last month's Friday would report figures the ribbon
 * does not contain. In that one case the cycle's FIRST required day is
 * reported instead, with every count zero — honest, and flagged by
 * `isFallbackDay` either way.
 */
export function reportedDay(requiredDays: CivilDate[], today: CivilDate): CivilDate {
  const first = requiredDays[0];
  if (first === undefined) throw new Error("dashboard: a cycle with no required days is impossible");
  let chosen = first;
  for (const d of requiredDays) {
    if (compareDates(d, today) <= 0) chosen = d;
  }
  return chosen;
}

export function createDashboardService(deps: {
  batchRepo: Pick<BatchRepo, "getBatch" | "enrolmentsInRange">;
  dayService: Pick<DayService, "listDaysForStudents">;
}): DashboardService {
  /** The engine's cycle numbering for a batch (ADR-0019). Null before its first evaluated cycle. */
  function cycleView(bounds: CycleBounds, batch: BatchRecord): CycleView {
    return {
      seq: cycleFor(bounds.start, batch.startDate)?.index ?? null,
      startDate: bounds.start,
      endDate: bounds.end,
      requiredDayCount: cycleWorkingDays(bounds).length,
    };
  }

  return {
    async batchToday(batchId, now) {
      const batch = await deps.batchRepo.getBatch(batchId);
      if (!batch) throw new BatchNotFoundError(batchId);

      const today = toProgrammeDate(now);
      const bounds = cycleContaining(today);
      const requiredDays = cycleWorkingDays(bounds);
      const enrolments = await deps.batchRepo.enrolmentsInRange(batchId, bounds.start, bounds.end);
      const studentIds = [...new Set(enrolments.map((e) => e.studentId))];
      const byStudent = await deps.dayService.listDaysForStudents(
        studentIds, bounds.start, bounds.end, now,
      );

      // Index every student's cycle once; each per-day count is then a lookup.
      const dayIndex = new Map<string, Map<CivilDate, DayView>>();
      for (const [id, days] of byStudent) {
        dayIndex.set(id, new Map(days.map((d) => [d.date, d])));
      }

      const complianceFor = (date: CivilDate): DayCompliance => {
        const counts: DayCompliance = {
          date, enrolled: 0, submitted: 0, late: 0, absent: 0, missed: 0, pending: 0,
        };
        for (const e of enrolments) {
          if (!covers(e, date)) continue;
          counts.enrolled += 1;
          const status: DayStatus | undefined = dayIndex.get(e.studentId)?.get(date)?.status;
          // A late entry IS submitted — `late` reports how many of the
          // submissions were, it is not a separate bucket (FR-13).
          if (status === "onTime" || status === "late") counts.submitted += 1;
          if (status === "late") counts.late += 1;
          if (status === "absent") counts.absent += 1;
          if (status === "missed") counts.missed += 1;
          if (status === "pending") counts.pending += 1;
        }
        return counts;
      };

      const days = requiredDays.map(complianceFor);
      const date = reportedDay(requiredDays, today);
      const counts = days.find((d) => d.date === date)!;

      // Weekend Extra (FR-33): counted from entries, never from a status, and
      // attributed to the required day it follows so the ribbon can draw a
      // half-width slot there. A weekend at the very start of a cycle maps
      // back into the previous one and is dropped rather than mis-attributed.
      let extraCount = 0;
      const extraAfter = new Set<CivilDate>();
      for (const days of byStudent.values()) {
        for (const day of days) {
          if (isWeekday(day.date)) continue;
          const extras = day.entries.filter((entry) => entry.isExtra).length;
          if (extras === 0) continue;
          extraCount += extras;
          const anchor = previousWeekday(day.date);
          if (compareDates(anchor, bounds.start) >= 0) extraAfter.add(anchor);
        }
      }

      return {
        batch,
        date,
        isFallbackDay: date !== today,
        dayNumber: days.findIndex((d) => d.date === date) + 1,
        cycle: cycleView(bounds, batch),
        counts,
        extraCount,
        days,
        extraAfter: [...extraAfter].sort(),
      };
    },
  };
}
