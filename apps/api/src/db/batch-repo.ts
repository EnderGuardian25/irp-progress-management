import type { CivilDate } from "@irp/core";
import type { PrismaClient } from "../generated/prisma/client.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";

export interface BatchRecord {
  id: string;
  name: string;
  startDate: CivilDate;
  endDate: CivilDate;
}

export interface EnrolmentRecord {
  id: string;
  studentId: string;
  batchId: string;
  startDate: CivilDate;
  endDate: CivilDate | null;
}

export interface BatchRepo {
  create(input: { name: string; startDate: CivilDate; endDate: CivilDate }): Promise<BatchRecord>;
  list(): Promise<BatchRecord[]>;
  enrol(studentId: string, batchId: string, startDate: CivilDate): Promise<EnrolmentRecord>;
  transfer(studentId: string, toBatchId: string, effectiveDate: CivilDate): Promise<EnrolmentRecord>;
  openEnrolment(studentId: string): Promise<EnrolmentRecord | null>;
  firstEnrolmentStart(studentId: string): Promise<CivilDate | null>;
}

interface DbBatch { id: string; name: string; startDate: Date; endDate: Date }
interface DbEnrolment { id: string; studentId: string; batchId: string; startDate: Date; endDate: Date | null }

function mapBatch(b: DbBatch): BatchRecord {
  return { id: b.id, name: b.name, startDate: fromDbDate(b.startDate), endDate: fromDbDate(b.endDate) };
}

function mapEnrolment(e: DbEnrolment): EnrolmentRecord {
  return {
    id: e.id,
    studentId: e.studentId,
    batchId: e.batchId,
    startDate: fromDbDate(e.startDate),
    endDate: e.endDate === null ? null : fromDbDate(e.endDate),
  };
}

export function createBatchRepo(prisma: PrismaClient): BatchRepo {
  return {
    async create(input) {
      const b = await prisma.batch.create({
        data: { name: input.name, startDate: toDbDate(input.startDate), endDate: toDbDate(input.endDate) },
      });
      return mapBatch(b);
    },

    async list() {
      const rows = await prisma.batch.findMany({ orderBy: { startDate: "asc" } });
      return rows.map(mapBatch);
    },

    async enrol(studentId, batchId, startDate) {
      const e = await prisma.enrolment.create({
        data: { studentId, batchId, startDate: toDbDate(startDate) },
      });
      return mapEnrolment(e);
    },

    // FR-8 in one transaction: the partial unique index makes "two open
    // enrolments" impossible even under a concurrent double-submit — the
    // second insert violates the index and the transaction rolls back.
    async transfer(studentId, toBatchId, effectiveDate) {
      return prisma.$transaction(async (tx) => {
        const open = await tx.enrolment.findFirst({ where: { studentId, endDate: null } });
        if (!open) throw new Error(`transfer: student ${studentId} has no open enrolment`);
        await tx.enrolment.update({
          where: { id: open.id },
          data: { endDate: toDbDate(effectiveDate) },
        });
        const next = await tx.enrolment.create({
          data: { studentId, batchId: toBatchId, startDate: toDbDate(effectiveDate) },
        });
        return mapEnrolment(next);
      });
    },

    async openEnrolment(studentId) {
      const e = await prisma.enrolment.findFirst({ where: { studentId, endDate: null } });
      return e ? mapEnrolment(e) : null;
    },

    async firstEnrolmentStart(studentId) {
      const e = await prisma.enrolment.findFirst({
        where: { studentId },
        orderBy: { startDate: "asc" },
      });
      return e ? fromDbDate(e.startDate) : null;
    },
  };
}
