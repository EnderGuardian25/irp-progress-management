import type { CivilDate } from "@irp/core";
import type { PrismaClient } from "../generated/prisma/client.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";

export interface MentorDayRecordShape {
  id: string;
  studentId: string;
  date: CivilDate;
  attended: boolean;
  tasksCompleted: boolean;
  note: string | null;
  recordedById: string;
}

export interface MentorRecordRepo {
  upsert(input: {
    studentId: string;
    date: CivilDate;
    attended: boolean;
    tasksCompleted: boolean;
    note?: string;
    recordedById: string;
  }): Promise<MentorDayRecordShape>;
  get(studentId: string, date: CivilDate): Promise<MentorDayRecordShape | null>;
}

interface DbRecord {
  id: string; studentId: string; date: Date; attended: boolean;
  tasksCompleted: boolean; note: string | null; recordedById: string;
}

function map(r: DbRecord): MentorDayRecordShape {
  return { ...r, date: fromDbDate(r.date) };
}

export function createMentorRecordRepo(prisma: PrismaClient): MentorRecordRepo {
  return {
    async upsert(input) {
      const where = { studentId_date: { studentId: input.studentId, date: toDbDate(input.date) } };
      const data = {
        attended: input.attended,
        tasksCompleted: input.tasksCompleted,
        note: input.note ?? null,
        recordedById: input.recordedById,
      };
      const row = await prisma.mentorDayRecord.upsert({
        where,
        update: data,
        create: { studentId: input.studentId, date: toDbDate(input.date), ...data },
      });
      return map(row);
    },

    async get(studentId, date) {
      const row = await prisma.mentorDayRecord.findUnique({
        where: { studentId_date: { studentId, date: toDbDate(date) } },
      });
      return row ? map(row) : null;
    },
  };
}
