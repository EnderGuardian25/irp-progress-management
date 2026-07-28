import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { JWTVerifyGetKey } from "jose";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createTracerProvider } from "../src/telemetry.js";
import { buildServer } from "../src/server.js";
import { fakeUserRepo } from "./helpers/fake-user-repo.js";
import { getLocalKeySet, signToken, testIssuer, testAudience } from "./helpers/keys.js";

let app: FastifyInstance;
beforeAll(async () => {
  const getKey: JWTVerifyGetKey = await getLocalKeySet();
  app = await buildServer({
    config: {
      port: 3001, databaseUrl: "unused", jwksUri: "unused",
      jwtIssuer: testIssuer, jwtAudience: testAudience, version: "0.0.0", nodeEnv: "test",
    },
    userRepo: fakeUserRepo([{ id: "u1", externalId: "oid-1", email: "a@bistecglobal.com", displayName: "Amaya", role: "STUDENT" }]),
    getKey,
    tracerProvider: createTracerProvider(new InMemorySpanExporter()),
  });
});

describe("buildServer", () => {
  it("serves GET /health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", version: "0.0.0" });
  });

  it("serves GET /api/v1/me for a valid token and maps the role to API casing", async () => {
    const res = await app.inject({
      method: "GET", url: "/api/v1/me",
      headers: { authorization: `Bearer ${await signToken({ oid: "oid-1" })}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "u1", email: "a@bistecglobal.com", displayName: "Amaya", role: "Student" });
  });

  it("rejects GET /api/v1/me with no token (401)", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/me" })).statusCode).toBe(401);
  });
});
