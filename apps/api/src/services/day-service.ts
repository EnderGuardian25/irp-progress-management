import {
  addDays, classifyDay, compareDates,
  type CivilDate, type DayStatus,
} from "@irp/core";
import type { AbsenceRepo } from "../db/absence-repo.js";
import type { EntryRepo, EntryRecord } from "../db/entry-repo.js";
import type { DailyReportStatus } from "../generated/prisma/client.js";

export interface DayView {
  date: CivilDate;
  status: DayStatus;
  reportId: string | null;
  reportStatus: DailyReportStatus | null;
  absenceReason: string | null;
  entries: EntryRecord[];
}

export interface DayService {
  listDays(studentId: string, from: CivilDate, to: CivilDate, now: Date): Promise<DayView[]>;
}

/**
 * Assembles the per-day view the student history, mentor review, and roster
 * all read. Classification is the ENGINE's (classifyDay) — this service only
 * gathers facts; it never re-decides late/extra/missed.
 */
export function createDayService(deps: {
  entryRepo: EntryRepo;
  absenceRepo: AbsenceRepo;
}): DayService {
  return {
    async listDays(studentId, from, to, now) {
      const [entries, absences, reports] = await Promise.all([
        deps.entryRepo.listEntries(studentId, from, to),
        deps.absenceRepo.listForStudent(studentId, from, to),
        deps.entryRepo.listReports(studentId, from, to),
      ]);
      const entriesByDate = new Map<CivilDate, EntryRecord[]>();
      for (const e of entries) {
        const bucket = entriesByDate.get(e.entryDate) ?? [];
        bucket.push(e);
        entriesByDate.set(e.entryDate, bucket);
      }
      const absenceByDate = new Map(absences.map((a) => [a.date, a.reason]));
      const reportByDate = new Map(reports.map((r) => [r.reportDate, r]));

      const days: DayView[] = [];
      for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) {
        const dayEntries = entriesByDate.get(d) ?? [];
        const first = dayEntries[0]; // listEntries orders submittedAt asc within a date
        const report = reportByDate.get(d) ?? null;
        const absenceReason = absenceByDate.get(d) ?? null;
        const status = classifyDay(
          d,
          first !== undefined
            ? { hasEntry: true, firstEntryAt: first.submittedAt, hasAbsence: absenceReason !== null }
            : { hasEntry: false, firstEntryAt: null, hasAbsence: absenceReason !== null },
          now,
        );
        days.push({
          date: d,
          status,
          reportId: report?.id ?? null,
          reportStatus: report?.status ?? null,
          absenceReason,
          entries: dayEntries,
        });
      }
      return days;
    },
  };
}
