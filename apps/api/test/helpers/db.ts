import type { PrismaClient } from "../../src/generated/prisma/client.js";

export async function resetDb(prisma: PrismaClient): Promise<void> {
  // CASCADE reaches every table referencing these two roots: Enrolment,
  // Entry, DailyReport, MentorDayRecord, AbsenceRecord, Cycle, Evaluation,
  // Override, Award.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "User", "Batch" RESTART IDENTITY CASCADE',
  );
}
