import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { civilDate } from "@irp/core";
import { createBatchRepo } from "../src/db/batch-repo.js";
import { buildTestServer } from "./helpers/build-test-server.js";
import { resetDb } from "./helpers/db.js";
import { signToken } from "./helpers/keys.js";
import { dbUrl } from "./helpers/require-db.js";

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

interface ProblemLike {
  type: string;
  title: string;
  status: number;
  detail?: string;
}

interface BatchLike {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface RosterRowLike {
  student: { id: string; displayName: string; email: string };
  day: { date: string };
  hasMentorRecord: boolean;
  extraCountThisCycle: number;
}

// Same fixed Monday `absences-endpoint.test.ts` uses — 2026-08-03T10:00:00Z
// is 15:30 Asia/Colombo, still the same civil date, so it is deterministic
// regardless of the machine's real clock.
const FIXED_MONDAY = new Date("2026-08-03T10:00:00.000Z");
const FIXED_MONDAY_CIVIL = "2026-08-03";

describe.skipIf(!dbUrl)("Batches: GET/POST /api/v1/batches, GET /api/v1/batches/{id}/roster", () => {
  let app: FastifyInstance;
  let prisma: Awaited<ReturnType<typeof buildTestServer>>["prisma"];

  beforeAll(async () => {
    ({ app, prisma } = await buildTestServer(dbUrl!));
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function student(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "STUDENT" },
    });
  }

  async function mentor(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "ADMIN" },
    });
  }

  it("rejects a student token on GET /api/v1/batches with 403 admin-only", async () => {
    await student("batch-student-1");

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/batches",
      headers: bearer(await signToken({ oid: "batch-student-1" })),
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json<ProblemLike>();
    expect(body.type).toBe("https://irp.bistec.example/problems/admin-only");
  });

  it("rejects a student token on POST /api/v1/batches with 403 admin-only", async () => {
    await student("batch-student-2");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/batches",
      headers: bearer(await signToken({ oid: "batch-student-2" })),
      payload: { name: "Batch Nope", startDate: "2026-09-10", endDate: "2027-03-09" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json<ProblemLike>();
    expect(body.type).toBe("https://irp.bistec.example/problems/admin-only");
  });

  it("rejects a student token on GET /api/v1/batches/{id}/roster with 403 admin-only", async () => {
    await student("batch-student-3");
    await mentor("batch-mentor-for-3");
    const batchRes = await app.inject({
      method: "POST",
      url: "/api/v1/batches",
      headers: bearer(await signToken({ oid: "batch-mentor-for-3" })),
      payload: { name: "Batch For Roster 403", startDate: "2026-05-10", endDate: "2026-11-09" },
    });
    const batch = batchRes.json<BatchLike>();

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/batches/${batch.id}/roster`,
      headers: bearer(await signToken({ oid: "batch-student-3" })),
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json<ProblemLike>();
    expect(body.type).toBe("https://irp.bistec.example/problems/admin-only");
  });

  it("creates a batch for a mentor token (200)", async () => {
    await mentor("batch-mentor-1");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/batches",
      headers: bearer(await signToken({ oid: "batch-mentor-1" })),
      payload: { name: "Batch Cinder", startDate: "2026-09-10", endDate: "2027-03-09" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<BatchLike>();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe("Batch Cinder");
    expect(body.startDate).toBe("2026-09-10");
    expect(body.endDate).toBe("2027-03-09");
  });

  it("rejects endDate <= startDate with 400 invalid-batch-dates", async () => {
    await mentor("batch-mentor-2");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/batches",
      headers: bearer(await signToken({ oid: "batch-mentor-2" })),
      payload: { name: "Batch Backwards", startDate: "2026-09-10", endDate: "2026-09-10" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json<ProblemLike>();
    expect(body.type).toBe("https://irp.bistec.example/problems/invalid-batch-dates");
  });

  it("rejects an extra body property on create with 400", async () => {
    await mentor("batch-mentor-3");

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/batches",
      headers: bearer(await signToken({ oid: "batch-mentor-3" })),
      payload: { name: "Batch Extra", startDate: "2026-09-10", endDate: "2027-03-09", extra: 1 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json<ProblemLike>();
    expect(body.type).toBe("https://irp.bistec.example/problems/validation-failed");
  });

  it("rejects a duplicate batch name with 409 duplicate-batch-name", async () => {
    await mentor("batch-mentor-dup");

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/batches",
      headers: bearer(await signToken({ oid: "batch-mentor-dup" })),
      payload: { name: "Batch Repeat", startDate: "2026-09-10", endDate: "2027-03-09" },
    });
    expect(first.statusCode).toBe(200);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/batches",
      headers: bearer(await signToken({ oid: "batch-mentor-dup" })),
      payload: { name: "Batch Repeat", startDate: "2026-05-10", endDate: "2026-11-09" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json<ProblemLike>();
    expect(body.type).toBe("https://irp.bistec.example/problems/duplicate-batch-name");
  });

  it("rejects a roster request for an unknown batch id with 404 batch-not-found", async () => {
    await mentor("batch-mentor-4");

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/batches/00000000-0000-0000-0000-000000000000/roster",
      headers: bearer(await signToken({ oid: "batch-mentor-4" })),
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json<ProblemLike>();
    expect(body.type).toBe("https://irp.bistec.example/problems/batch-not-found");
  });

  it("defaults the roster date to today (Asia/Colombo) when omitted", async () => {
    await mentor("batch-mentor-5");
    const s = await student("batch-roster-student-5");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED_MONDAY);

    const batchRes = await app.inject({
      method: "POST",
      url: "/api/v1/batches",
      headers: bearer(await signToken({ oid: "batch-mentor-5" })),
      payload: { name: "Batch Default Date", startDate: "2026-05-10", endDate: "2026-11-09" },
    });
    expect(batchRes.statusCode).toBe(200);
    const batch = batchRes.json<BatchLike>();

    await createBatchRepo(prisma).enrol(s.id, batch.id, civilDate("2026-05-10"));

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/batches/${batch.id}/roster`,
      headers: bearer(await signToken({ oid: "batch-mentor-5" })),
    });

    expect(res.statusCode).toBe(200);
    const rows = res.json<RosterRowLike[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.student.id).toBe(s.id);
    expect(rows[0]!.day.date).toBe(FIXED_MONDAY_CIVIL);
  });
});
