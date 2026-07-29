import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestServer } from "./helpers/build-test-server.js";
import { dbUrl } from "./helpers/require-db.js";
import { signToken } from "./helpers/keys.js";

describe("the global fail-closed hook", () => {
  let app: FastifyInstance;
  let prisma: Awaited<ReturnType<typeof buildTestServer>>["prisma"];

  beforeAll(async () => {
    ({ app, prisma } = await buildTestServer(dbUrl!));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("rejects an unauthenticated request to a registered /api/ route", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an unauthenticated request to an UNREGISTERED /api/ path", async () => {
    // The point of a global hook: a route nobody remembered to protect, and a
    // path that does not exist at all, must both fail closed rather than 404
    // with information about what is there.
    const res = await app.inject({ method: "GET", url: "/api/v1/anything-at-all" });
    expect(res.statusCode).toBe(401);
  });

  it("leaves /health public — it is a liveness probe taking no credentials", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("returns RFC 7807 Problem Details carrying a traceId", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me" });
    const body = res.json<{ type: string; title: string; traceId?: string }>();
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(body.type).toContain("unauthorized");
    expect(body.traceId).toBeTypeOf("string");
  });

  it("authenticates ONCE per request, not once per layer", async () => {
    // /api/v1/me sits behind BOTH the global hook and its own preHandler. Both
    // call app.authenticate. Without idempotency that is two JWT verifications
    // and two findByExternalId round-trips per request — a measurable cost
    // against NFR-1 (p95 < 250 ms at 50 RPS) and NFR-2's burst target.
    const spy = vi.spyOn(prisma.user, "findFirst");
    spy.mockClear();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${await signToken({ oid: "dev-admin-1" })}` },
    });

    expect(res.statusCode).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
