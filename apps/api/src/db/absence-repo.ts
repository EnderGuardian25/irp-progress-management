import { isWeekday, type CivilDate } from "@irp/core";
import { EntryConflictError, LockedDayError, WeekendAbsenceError } from "../domain/errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";

export interface AbsenceRecordShape {
  id: string;
  studentId: string;
  date: CivilDate;
  reason: string;
}

export interface AbsenceRepo {
  create(input: { studentId: string; date: CivilDate; reason: string }): Promise<AbsenceRecordShape>;
  remove(studentId: string, date: CivilDate): Promise<void>;
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
        await assertNotLocked(tx, input.studentId, input.date);
        const entryCount = await tx.entry.count({
          where: { studentId: input.studentId, entryDate: toDbDate(input.date) },
        });
        if (entryCount > 0) throw new EntryConflictError(input.date);
        const row = await tx.absenceRecord.create({
          data: { studentId: input.studentId, date: toDbDate(input.date), reason: input.reason },
        });
        return { id: row.id, studentId: row.studentId, date: fromDbDate(row.date), reason: row.reason };
      });
    },

    async remove(studentId, date) {
      await prisma.$transaction(async (tx) => {
        await assertNotLocked(tx, studentId, date);
        await tx.absenceRecord.deleteMany({ where: { studentId, date: toDbDate(date) } });
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
