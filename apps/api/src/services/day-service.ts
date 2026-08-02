import {
  addDays, classifyDay, compareDates,
  type CivilDate, type DayStatus,
} from "@irp/core";
import type { AbsenceRepo } from "../db/absence-repo.js";
import type { BatchRepo, EnrolmentRecord } from "../db/batch-repo.js";
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

/** Whether any of the student's enrolment intervals covers `d` (open-ended when `endDate` is null). */
function isEnrolledOn(enrolments: EnrolmentRecord[], d: CivilDate): boolean {
  return enrolments.some(
    (e) => compareDates(e.startDate, d) <= 0 && (e.endDate === null || compareDates(e.endDate, d) >= 0),
  );
}

/**
 * Assembles the per-day view the student history, mentor review, and roster
 * all read. Classification is the ENGINE's (classifyDay) — this service only
 * gathers facts; it never re-decides late/extra/missed.
 *
 * Obligation is enrolment-clipped: a day outside every one of the student's
 * enrolment intervals carries no obligation, so a silent day there is `none`,
 * not `missed` — classifyDay is not even consulted for it. This is why a
 * mentor (no enrolments at all) sees a uniform list of `none` days rather
 * than an empty list, and why a mid-cycle joiner's pre-enrolment weekdays
 * read as `none` instead of `missed` (FR-27 spirit).
 *
 * The 92-day range cap is enforced one layer up, in the route
 * (`routes/me-days.ts`'s `resolveRange`) — this service accepts whatever
 * `from`/`to` it is given.
 */
export function createDayService(deps: {
  entryRepo: EntryRepo;
  absenceRepo: AbsenceRepo;
  batchRepo: Pick<BatchRepo, "listEnrolments">;
}): DayService {
  return {
    async listDays(studentId, from, to, now) {
      const [entries, absences, reports, enrolments] = await Promise.all([
        deps.entryRepo.listEntries(studentId, from, to),
        deps.absenceRepo.listForStudent(studentId, from, to),
        deps.entryRepo.listReports(studentId, from, to),
        deps.batchRepo.listEnrolments(studentId),
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
        const hasAbsence = absenceByDate.has(d);
        const absenceReason = absenceByDate.get(d) ?? null;

        const status: DayStatus =
          dayEntries.length === 0 && !isEnrolledOn(enrolments, d)
            ? "none"
            : classifyDay(
                d,
                first !== undefined
                  ? { hasEntry: true, firstEntryAt: first.submittedAt, hasAbsence }
                  : { hasEntry: false, firstEntryAt: null, hasAbsence },
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
