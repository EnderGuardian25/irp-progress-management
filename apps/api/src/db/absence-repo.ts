import { isWeekday, type CivilDate } from "@irp/core";
import {
  AbsenceExistsError,
  AbsenceNotFoundError,
  EntryConflictError,
  LockedDayError,
  WeekendAbsenceError,
} from "../domain/errors.js";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";
import { lockStudentDay } from "./day-lock.js";

// Duplicated from batch-repo.ts: two lines beats a premature shared module.
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export interface AbsenceRecordShape {
  id: string;
  studentId: string;
  date: CivilDate;
  reason: string;
}

export interface AbsenceRepo {
  create(input: { studentId: string; date: CivilDate; reason: string }): Promise<AbsenceRecordShape>;
  remove(studentId: string, date: CivilDate): Promise<AbsenceRecordShape>;
  listForStudent(studentId: string, from: CivilDate, to: CivilDate): Promise<AbsenceRecordShape[]>;
}

export function createAbsenceRepo(prisma: PrismaClient): AbsenceRepo {
  async function assertNotLocked(
    tx: Pick<PrismaClient, "dailyReport">,
    studentId: string,
    date: CivilDate,
  ): Promise<void> {
    const report = await tx.dailyReport.findUnique({
      where: { studentId_reportDate: { studentId, reportDate: toDbDate(date) } },
    });
    if (report?.status === "EVALUATED") throw new LockedDayError(date);
  }

  return {
    async create(input) {
      if (!isWeekday(input.date)) throw new WeekendAbsenceError(input.date);
      return prisma.$transaction(async (tx) => {
        await lockStudentDay(tx, input.studentId, input.date);
        await assertNotLocked(tx, input.studentId, input.date);
        const entryCount = await tx.entry.count({
          where: { studentId: input.studentId, entryDate: toDbDate(input.date) },
        });
        if (entryCount > 0) throw new EntryConflictError(input.date);
        try {
          const row = await tx.absenceRecord.create({
            data: { studentId: input.studentId, date: toDbDate(input.date), reason: input.reason },
          });
          return { id: row.id, studentId: row.studentId, date: fromDbDate(row.date), reason: row.reason };
        } catch (err) {
          if (isUniqueViolation(err)) throw new AbsenceExistsError(input.date);
          throw err;
        }
      });
    },

    async remove(studentId, date) {
      return prisma.$transaction(async (tx) => {
        await lockStudentDay(tx, studentId, date);
        await assertNotLocked(tx, studentId, date);
        const row = await tx.absenceRecord.findUnique({
          where: { studentId_date: { studentId, date: toDbDate(date) } },
        });
        if (row === null) throw new AbsenceNotFoundError(date);
        await tx.absenceRecord.delete({ where: { id: row.id } });
        return { id: row.id, studentId: row.studentId, date: fromDbDate(row.date), reason: row.reason };
      });
    },

    async listForStudent(studentId, from, to) {
      const rows = await prisma.absenceRecord.findMany({
        where: { studentId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
        orderBy: { date: "asc" },
      });
      return rows.map((r) => ({ id: r.id, studentId: r.studentId, date: fromDbDate(r.date), reason: r.reason }));
    },
  };
}
