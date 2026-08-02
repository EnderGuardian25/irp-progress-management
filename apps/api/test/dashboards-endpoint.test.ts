import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { civilDate } from "@irp/core";
import { createBatchRepo } from "../src/db/batch-repo.js";
import { buildTestServer } from "./helpers/build-test-server.js";
import { resetDb } from "./helpers/db.js";
import { signToken } from "./helpers/keys.js";
import { dbUrl } from "./helpers/require-db.js";

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

interface ProblemLike { type: string; title: string; status: number; detail?: string }
interface TodayLike {
  batchId: string; batchName: string; date: string; isFallbackDay: boolean; dayNumber: number;
  cycle: { seq: number | null; startDate: string; endDate: string; requiredDayCount: number };
  counts: { enrolled: number; submitted: number; late: number; absent: number; missed: number; pending: number };
  extraCount: number; days: { date: string }[]; extraAfter: string[];
}

describe.skipIf(!dbUrl)("Dashboards: GET /api/v1/batches/{id}/dashboard/today", () => {
  let app: FastifyInstance;
  let prisma: Awaited<ReturnType<typeof buildTestServer>>["prisma"];

  beforeAll(async () => {
    ({ app, prisma } = await buildTestServer(dbUrl!));
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function mentor(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "ADMIN" },
    });
  }
  async function student(externalId: string) {
    return prisma.user.create({
      data: { externalId, email: `${externalId}@dev.local`, displayName: externalId, role: "STUDENT" },
    });
  }
  async function batch(name: string) {
    return createBatchRepo(prisma).create({
      name, startDate: civilDate("2026-05-10"), endDate: civilDate("2027-01-09"),
    });
  }

  it("rejects a student token with 403 admin-only", async () => {
    await student("dash-ep-student");
    const b = await batch("Batch Dash 403");

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/batches/${b.id}/dashboard/today`,
      headers: bearer(await signToken({ oid: "dash-ep-student" })),
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json<ProblemLike>().type).toBe("https://irp.bistec.example/problems/admin-only");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const b = await batch("Batch Dash 401");
    const res = await app.inject({ method: "GET", url: `/api/v1/batches/${b.id}/dashboard/today` });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a non-uuid batch id with 400 validation-failed", async () => {
    await mentor("dash-ep-mentor-400");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/batches/not-a-uuid/dashboard/today",
      headers: bearer(await signToken({ oid: "dash-ep-mentor-400" })),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ProblemLike>().type).toBe("https://irp.bistec.example/problems/validation-failed");
  });

  it("rejects an unknown batch id with 404 batch-not-found", async () => {
    await mentor("dash-ep-mentor-404");
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/batches/00000000-0000-0000-0000-000000000000/dashboard/today",
      headers: bearer(await signToken({ oid: "dash-ep-mentor-404" })),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<ProblemLike>().type).toBe("https://irp.bistec.example/problems/batch-not-found");
  });

  it("returns the dashboard for a mentor token, with counts agreeing with the day series", async () => {
    await mentor("dash-ep-mentor-200");
    const b = await batch("Batch Dash 200");
    const s = await student("dash-ep-enrolled");
    await createBatchRepo(prisma).enrol(s.id, b.id, civilDate("2026-05-10"));

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/batches/${b.id}/dashboard/today`,
      headers: bearer(await signToken({ oid: "dash-ep-mentor-200" })),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<TodayLike>();
    expect(body.batchId).toBe(b.id);
    expect(body.batchName).toBe("Batch Dash 200");
    expect(body.days).toHaveLength(body.cycle.requiredDayCount);
    expect(body.counts.enrolled).toBe(1);
    expect(body.days[body.dayNumber - 1]!.date).toBe(body.date);
  });
});
