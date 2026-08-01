import type { CivilDate } from "@irp/core";
import { decideEntryFlags } from "../domain/entry-flags.js";
import { AbsentDayConflictError, LockedDayError } from "../domain/errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";

export interface EntryRecord {
  id: string;
  studentId: string;
  entryDate: CivilDate;
  body: string;
  submittedAt: Date;
  isLate: boolean;
  isExtra: boolean;
}

export interface DailyReportRecord {
  id: string;
  studentId: string;
  reportDate: CivilDate;
  status: "SUBMITTED" | "IN_REVIEW" | "EVALUATED";
}

export interface EntryRepo {
  addEntry(input: {
    studentId: string;
    entryDate: CivilDate;
    body: string;
    submittedAt: Date;
  }): Promise<EntryRecord>;
  listEntries(studentId: string, from: CivilDate, to: CivilDate): Promise<EntryRecord[]>;
  getReport(studentId: string, date: CivilDate): Promise<DailyReportRecord | null>;
}

interface DbEntry {
  id: string; studentId: string; entryDate: Date; body: string;
  submittedAt: Date; isLate: boolean; isExtra: boolean;
}

function mapEntry(e: DbEntry): EntryRecord {
  return {
    id: e.id,
    studentId: e.studentId,
    entryDate: fromDbDate(e.entryDate),
    body: e.body,
    submittedAt: e.submittedAt,
    isLate: e.isLate,
    isExtra: e.isExtra,
  };
}

export function createEntryRepo(prisma: PrismaClient): EntryRepo {
  return {
    // The flags call throws SubmissionWindowClosedError before anything is
    // written, so an illegal date never reaches the database (FR-15 by
    // construction). Time validation is against the submittedAt INSTANT —
    // Plan 6 handlers pass new Date(); the seed passes history.
    async addEntry(input) {
      const flags = decideEntryFlags(input.entryDate, input.submittedAt);
      const dbDate = toDbDate(input.entryDate);

      return prisma.$transaction(async (tx) => {
        const report = await tx.dailyReport.findUnique({
          where: { studentId_reportDate: { studentId: input.studentId, reportDate: dbDate } },
        });
        if (report?.status === "EVALUATED") {
          throw new LockedDayError(input.entryDate);
        }
        const absence = await tx.absenceRecord.findUnique({
          where: { studentId_date: { studentId: input.studentId, date: dbDate } },
        });
        if (absence) {
          throw new AbsentDayConflictError(input.entryDate);
        }
        // Upsert, not find-then-create: two concurrent first entries for the
        // same day would both see no report and the loser would throw P2002.
        // Prisma compiles this shape to a native INSERT ... ON CONFLICT.
        await tx.dailyReport.upsert({
          where: { studentId_reportDate: { studentId: input.studentId, reportDate: dbDate } },
          update: {},
          create: { studentId: input.studentId, reportDate: dbDate },
        });
        const entry = await tx.entry.create({
          data: {
            studentId: input.studentId,
            entryDate: dbDate,
            body: input.body,
            submittedAt: input.submittedAt,
            isLate: flags.isLate,
            isExtra: flags.isExtra,
          },
        });
        return mapEntry(entry);
      });
    },

    async listEntries(studentId, from, to) {
      const rows = await prisma.entry.findMany({
        where: { studentId, entryDate: { gte: toDbDate(from), lte: toDbDate(to) } },
        orderBy: [{ entryDate: "asc" }, { submittedAt: "asc" }],
      });
      return rows.map(mapEntry);
    },

    async getReport(studentId, date) {
      const r = await prisma.dailyReport.findUnique({
        where: { studentId_reportDate: { studentId, reportDate: toDbDate(date) } },
      });
      if (!r) return null;
      return { id: r.id, studentId: r.studentId, reportDate: fromDbDate(r.reportDate), status: r.status };
    },
  };
}
