import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createMentorRecordRepo } from "../src/db/mentor-record-repo.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

const MONDAY = civilDate("2026-08-03");

describe.skipIf(!dbUrl)("createMentorRecordRepo", () => {
  const prisma = createPrismaClient(dbUrl!);
  const repo = createMentorRecordRepo(prisma);

  beforeEach(async () => { await resetDb(prisma); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("upserts a record for a day with no entries — FR-19 is independent of submissions", async () => {
    const s = await prisma.user.create({
      data: { externalId: "m-1", email: "m-1@dev.local", displayName: "S", role: "STUDENT" },
    });
    const mentor = await prisma.user.create({
      data: { externalId: "m-2", email: "m-2@dev.local", displayName: "M", role: "ADMIN" },
    });
    const first = await repo.upsert({
      studentId: s.id, date: MONDAY, attended: true, tasksCompleted: false, recordedById: mentor.id,
    });
    expect(first.attended).toBe(true);

    const second = await repo.upsert({
      studentId: s.id, date: MONDAY, attended: true, tasksCompleted: true,
      note: "caught up by evening", recordedById: mentor.id,
    });
    expect(second.id).toBe(first.id); // updated, not duplicated
    expect(second.tasksCompleted).toBe(true);
    expect(await repo.get(s.id, MONDAY)).not.toBeNull();
  });
});
