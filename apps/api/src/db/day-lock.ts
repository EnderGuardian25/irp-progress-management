import type { CivilDate } from "@irp/core";
import type { Prisma } from "../generated/prisma/client.js";

/**
 * Serialise all writes for one student-day (ADR-0016). MUST be the first
 * await inside any transaction writing Entry / DailyReport / AbsenceRecord
 * for a (studentId, date) pair — the check-then-write bodies of those
 * transactions are only correct because this lock makes them mutually
 * exclusive. Transaction-scoped: released automatically at commit/rollback.
 *
 * One deliberate exemption: entry-repo.ts's `transition()` writes DailyReport
 * without taking this lock. It doesn't need it — its `updateMany` conditions
 * on the expected current status (`where: { id: reportId, status: expected
 * }`) in the same statement, which is its own atomic concurrency guard, not
 * a separate check-then-write. Two mentors racing the same transition both
 * issue that update; the database, not this lock, ensures only one sees
 * `count === 1`.
 *
 * $executeRaw, not $queryRaw: pg_advisory_xact_lock returns `void`, and
 * Prisma's $queryRaw result deserialiser has no mapping for that column
 * type — it throws "Failed to deserialize column of type 'void'" on every
 * call. $executeRaw does not attempt to decode returned rows, only a row
 * count, so it is unaffected.
 */
export async function lockStudentDay(
  tx: Prisma.TransactionClient,
  studentId: string,
  date: CivilDate,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${studentId}:${date}`}, 0))`;
}
