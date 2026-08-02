import { addDays, compareDates, type CivilDate } from "@irp/core";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import {
  DuplicateBatchNameError, InvalidTransferDateError, NoOpenEnrolmentError, OpenEnrolmentExistsError,
} from "../domain/errors.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

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

export interface RosterMember {
  studentId: string;
  displayName: string;
  email: string;
}

/** One enrolment interval plus the student's identity — the batch-dashboard membership read. */
export interface RosterEnrolment {
  studentId: string;
  displayName: string;
  email: string;
  startDate: CivilDate;
  endDate: CivilDate | null;
}

export interface BatchRepo {
  create(input: { name: string; startDate: CivilDate; endDate: CivilDate }): Promise<BatchRecord>;
  list(): Promise<BatchRecord[]>;
  getBatch(id: string): Promise<BatchRecord | null>;
  enrol(studentId: string, batchId: string, startDate: CivilDate): Promise<EnrolmentRecord>;
  transfer(studentId: string, toBatchId: string, effectiveDate: CivilDate): Promise<EnrolmentRecord>;
  openEnrolment(studentId: string): Promise<EnrolmentRecord | null>;
  firstEnrolmentStart(studentId: string): Promise<CivilDate | null>;
  listEnrolments(studentId: string): Promise<EnrolmentRecord[]>;
  /**
   * Students enrolled in `batchId` on `date`: startDate <= date AND
   * (endDate IS NULL OR endDate >= date), excluding soft-deleted users,
   * ordered by displayName. ADR-0017's disjoint intervals guarantee at
   * most one batch per student-day, so this never double-counts a
   * transfer's boundary.
   */
  rosterMembers(batchId: string, date: CivilDate): Promise<RosterMember[]>;
  /** Every interval belonging to any of `studentIds`, start date ascending. The batched sibling of listEnrolments (ADR-0018). */
  listEnrolmentsForStudents(studentIds: string[]): Promise<EnrolmentRecord[]>;
  /**
   * Enrolments in `batchId` overlapping [from, to] — startDate <= to AND
   * (endDate IS NULL OR endDate >= from) — excluding soft-deleted users,
   * ordered by displayName. One query in place of a rosterMembers call per
   * date (ADR-0018); per-day membership is then decided in memory.
   */
  enrolmentsInRange(batchId: string, from: CivilDate, to: CivilDate): Promise<RosterEnrolment[]>;
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
      try {
        const b = await prisma.batch.create({
          data: { name: input.name, startDate: toDbDate(input.startDate), endDate: toDbDate(input.endDate) },
        });
        return mapBatch(b);
      } catch (err) {
        // Batch has exactly one unique constraint besides its PK (`name`),
        // so a blanket P2002 mapping to DuplicateBatchNameError is safe here.
        if (isUniqueViolation(err)) throw new DuplicateBatchNameError(input.name);
        throw err;
      }
    },

    async list() {
      const rows = await prisma.batch.findMany({ orderBy: { startDate: "asc" } });
      return rows.map(mapBatch);
    },

    async getBatch(id) {
      const b = await prisma.batch.findUnique({ where: { id } });
      return b ? mapBatch(b) : null;
    },

    async enrol(studentId, batchId, startDate) {
      try {
        const e = await prisma.enrolment.create({
          data: { studentId, batchId, startDate: toDbDate(startDate) },
        });
        return mapEnrolment(e);
      } catch (err) {
        if (isUniqueViolation(err)) throw new OpenEnrolmentExistsError(studentId);
        throw err;
      }
    },

    // FR-8 in one transaction: the partial unique index makes "two open
    // enrolments" impossible even under a concurrent double-submit — the
    // second insert violates the index and the transaction rolls back.
    async transfer(studentId, toBatchId, effectiveDate) {
      return prisma.$transaction(async (tx) => {
        const open = await tx.enrolment.findFirst({ where: { studentId, endDate: null } });
        if (!open) throw new NoOpenEnrolmentError(studentId);
        if (compareDates(effectiveDate, fromDbDate(open.startDate)) <= 0) {
          throw new InvalidTransferDateError(effectiveDate);
        }
        await tx.enrolment.update({
          where: { id: open.id },
          // ADR-0017: the new batch owns the effective date.
          data: { endDate: toDbDate(addDays(effectiveDate, -1)) },
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

    async listEnrolments(studentId) {
      const rows = await prisma.enrolment.findMany({
        where: { studentId },
        orderBy: { startDate: "asc" },
      });
      return rows.map(mapEnrolment);
    },

    async rosterMembers(batchId, date) {
      const rows = await prisma.enrolment.findMany({
        where: {
          batchId,
          startDate: { lte: toDbDate(date) },
          OR: [{ endDate: null }, { endDate: { gte: toDbDate(date) } }],
          student: { deletedAt: null },
        },
        include: { student: { select: { id: true, displayName: true, email: true } } },
        orderBy: { student: { displayName: "asc" } },
      });
      return rows.map((r) => ({
        studentId: r.student.id,
        displayName: r.student.displayName,
        email: r.student.email,
      }));
    },

    async listEnrolmentsForStudents(studentIds) {
      if (studentIds.length === 0) return [];
      const rows = await prisma.enrolment.findMany({
        where: { studentId: { in: studentIds } },
        orderBy: { startDate: "asc" },
      });
      return rows.map(mapEnrolment);
    },

    async enrolmentsInRange(batchId, from, to) {
      const rows = await prisma.enrolment.findMany({
        where: {
          batchId,
          startDate: { lte: toDbDate(to) },
          OR: [{ endDate: null }, { endDate: { gte: toDbDate(from) } }],
          student: { deletedAt: null },
        },
        include: { student: { select: { id: true, displayName: true, email: true } } },
        orderBy: { student: { displayName: "asc" } },
      });
      return rows.map((r) => ({
        studentId: r.student.id,
        displayName: r.student.displayName,
        email: r.student.email,
        startDate: fromDbDate(r.startDate),
        endDate: r.endDate === null ? null : fromDbDate(r.endDate),
      }));
    },
  };
}
