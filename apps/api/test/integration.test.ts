import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestServer } from "./helpers/build-test-server.js";
import { createPrismaClient } from "../src/db/client.js";
import { resetDb } from "./helpers/db.js";
import { buildAjv } from "../src/validation.js";
import { problemSchema } from "./helpers/problem-schema.js";
import { signToken, signExpiredToken } from "./helpers/keys.js";
import { dbUrl } from "./helpers/require-db.js";

const validateProblem = buildAjv().compile(problemSchema);
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

// `res.json()` returns `unknown`, so every member access on it trips
// @typescript-eslint/no-unsafe-member-access and the repo lints at zero
// warnings. Pass the shape to `res.json<T>()` whenever you read a field —
// bare `res.json()` is fine only when handing the whole body to a validator
// or comparing it with toEqual/toMatchObject. This mirrors ProblemLike in
// test/problem-details.test.ts.
interface ProblemLike {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId?: string;
}

describe.skipIf(!dbUrl)("integration: spec → validated request → JWT → Prisma → traced response", () => {
  let app: FastifyInstance;
  let exporter: Awaited<ReturnType<typeof buildTestServer>>["exporter"];
  let prisma: ReturnType<typeof createPrismaClient>;

  beforeAll(async () => { ({ app, exporter, prisma } = await buildTestServer(dbUrl!)); });
  beforeEach(async () => { await resetDb(prisma); exporter.reset(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it("GET /health → 200", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe("ok");
  });

  it("GET /api/v1/me returns the caller identity for a valid token", async () => {
    await prisma.user.create({ data: { externalId: "oid-42", email: "m@bistecglobal.com", displayName: "Mentor", role: "ADMIN" } });
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: bearer(await signToken({ oid: "oid-42" })) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: "m@bistecglobal.com", role: "Admin" });
  });

  it("expired token → 401 with a Problem body", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: bearer(await signExpiredToken("oid-42")) });
    expect(res.statusCode).toBe(401);
    expect(validateProblem(res.json())).toBe(true);
  });

  it("valid token, unregistered user → 403 (spec §7)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: bearer(await signToken({ oid: "ghost" })) });
    expect(res.statusCode).toBe(403);
    expect(validateProblem(res.json())).toBe(true);
  });

  it("a soft-deleted user is treated as unregistered → 403 (FR-5)", async () => {
    await prisma.user.create({ data: { externalId: "oid-gone", email: "x@bistecglobal.com", displayName: "Gone", role: "STUDENT", deletedAt: new Date() } });
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: bearer(await signToken({ oid: "oid-gone" })) });
    expect(res.statusCode).toBe(403);
  });

  it("every error body validates against Problem and carries the span's traceId", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: bearer(await signToken({ oid: "ghost" })) });
    const body = res.json<ProblemLike>();
    expect(validateProblem(body)).toBe(true);
    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThan(0);
    expect(body.traceId).toBe(spans.at(-1)?.spanContext().traceId);
  });
});
