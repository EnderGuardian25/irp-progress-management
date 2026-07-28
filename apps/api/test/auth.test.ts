import { describe, it, expect, beforeAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { JWTVerifyGetKey } from "jose";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createTracerProvider, tracingPlugin } from "../src/telemetry.js";
import { problemDetailsPlugin } from "../src/plugins/problem-details.js";
import { authPlugin } from "../src/plugins/auth.js";
import { fakeUserRepo } from "./helpers/fake-user-repo.js";
import { getLocalKeySet, signToken, signExpiredToken, testIssuer, testAudience } from "./helpers/keys.js";

interface ProtectedResponse { email: string; }

let getKey: JWTVerifyGetKey;
beforeAll(async () => { getKey = await getLocalKeySet(); });

async function buildApp() {
  const app = Fastify();
  await app.register(tracingPlugin, { tracerProvider: createTracerProvider(new InMemorySpanExporter()) });
  await app.register(problemDetailsPlugin);
  await app.register(authPlugin, {
    getKey, issuer: testIssuer, audience: testAudience,
    userRepo: fakeUserRepo([
      { id: "u1", externalId: "oid-1", email: "a@bistecglobal.com", displayName: "Amaya", role: "STUDENT" },
    ]),
  });
  app.get("/protected", { preHandler: [app.authenticate] }, (req) => ({ email: req.user!.email }));
  return app;
}

function bearer(t: string) { return { authorization: `Bearer ${t}` }; }

describe("auth", () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });

  it("accepts a valid token and attaches the user", async () => {
    const res = await app.inject({ method: "GET", url: "/protected", headers: bearer(await signToken({ oid: "oid-1" })) });
    expect(res.statusCode).toBe(200);
    expect(res.json<ProtectedResponse>().email).toBe("a@bistecglobal.com");
  });

  it("rejects a missing Authorization header with 401", async () => {
    expect((await app.inject({ method: "GET", url: "/protected" })).statusCode).toBe(401);
  });

  it("rejects an expired token with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/protected", headers: bearer(await signExpiredToken()) });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a wrong-audience token with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/protected", headers: bearer(await signToken({ audience: "api://someone-else" })) });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a valid token whose oid has no user record with 403 (spec §7)", async () => {
    const res = await app.inject({ method: "GET", url: "/protected", headers: bearer(await signToken({ oid: "unknown-oid" })) });
    expect(res.statusCode).toBe(403);
  });
});
