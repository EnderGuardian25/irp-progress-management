import {
  addDays, classifyDay, compareDates,
  type CivilDate, type DayStatus,
} from "@irp/core";
import type { AbsenceRepo, AbsenceRecordShape } from "../db/absence-repo.js";
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
  /**
   * The same classification for many students in one pass — four
   * `WHERE studentId IN (...)` reads instead of four per student (ADR-0018).
   * Every requested id gets a key, even one with no rows at all, so a caller
   * never has to distinguish "absent from the map" from "no activity".
   */
  listDaysForStudents(
    studentIds: string[], from: CivilDate, to: CivilDate, now: Date,
  ): Promise<Map<string, DayView[]>>;
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
  entryRepo: Pick<EntryRepo, "listEntries" | "listReports" | "listEntriesForStudents" | "listReportsForStudents">;
  absenceRepo: Pick<AbsenceRepo, "listForStudent" | "listForStudents">;
  batchRepo: Pick<BatchRepo, "listEnrolments" | "listEnrolmentsForStudents">;
}): DayService {
  /** Group rows by studentId, seeding every requested id so no key is missing. */
  function groupBy<T extends { studentId: string }>(rows: T[], ids: string[]): Map<string, T[]> {
    const out = new Map<string, T[]>(ids.map((id) => [id, []]));
    for (const row of rows) out.get(row.studentId)?.push(row);
    return out;
  }

  /** The per-student assembly both entry points share. Pure — no I/O. */
  function assemble(
    entries: EntryRecord[],
    absences: AbsenceRecordShape[],
    reports: { id: string; reportDate: CivilDate; status: DailyReportStatus }[],
    enrolments: EnrolmentRecord[],
    from: CivilDate,
    to: CivilDate,
    now: Date,
  ): DayView[] {
    const entriesByDate = new Map<CivilDate, EntryRecord[]>();
    for (const e of entries) {
      // An entry whose submittedAt is still in the future relative to `now`
      // has not happened yet as of this view — this only arises when a
      // caller evaluates an instant earlier than a stored submission (a
      // dashboard viewed "as of" a past moment; production always calls with
      // `now = new Date()`, so a real submission is never ahead of it).
      // Without this guard a not-yet-submitted entry would already read as
      // onTime/late, which is exactly the classification `future` days are
      // being protected from further up.
      if (e.submittedAt.getTime() > now.getTime()) continue;
      const bucket = entriesByDate.get(e.entryDate) ?? [];
      bucket.push(e);
      entriesByDate.set(e.entryDate, bucket);
    }
    const absenceByDate = new Map(absences.map((a) => [a.date, a.reason]));
    const reportByDate = new Map(reports.map((r) => [r.reportDate, r]));

    const days: DayView[] = [];
    for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) {
      const dayEntries = entriesByDate.get(d) ?? [];
      const first = dayEntries[0]; // ordered submittedAt asc within a date
      const report = reportByDate.get(d) ?? null;
      const hasAbsence = absenceByDate.has(d);

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
        absenceReason: absenceByDate.get(d) ?? null,
        entries: dayEntries,
      });
    }
    return days;
  }

  return {
    async listDays(studentId, from, to, now) {
      const byStudent = await this.listDaysForStudents([studentId], from, to, now);
      return byStudent.get(studentId) ?? [];
    },

    async listDaysForStudents(studentIds, from, to, now) {
      const ids = [...new Set(studentIds)];
      if (ids.length === 0) return new Map();

      const [entries, absences, reports, enrolments] = await Promise.all([
        deps.entryRepo.listEntriesForStudents(ids, from, to),
        deps.absenceRepo.listForStudents(ids, from, to),
        deps.entryRepo.listReportsForStudents(ids, from, to),
        deps.batchRepo.listEnrolmentsForStudents(ids),
      ]);

      const entriesBy = groupBy(entries, ids);
      const absencesBy = groupBy(absences, ids);
      const reportsBy = groupBy(reports, ids);
      const enrolmentsBy = groupBy(enrolments, ids);

      return new Map(
        ids.map((id) => [
          id,
          assemble(
            entriesBy.get(id) ?? [], absencesBy.get(id) ?? [], reportsBy.get(id) ?? [],
            enrolmentsBy.get(id) ?? [], from, to, now,
          ),
        ]),
      );
    },
  };
}
