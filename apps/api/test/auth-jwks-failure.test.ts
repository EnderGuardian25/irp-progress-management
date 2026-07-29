import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createPrismaClient } from "../src/db/client.js";
import { createUserRepo } from "../src/db/user-repo.js";
import { createTracerProvider } from "../src/telemetry.js";
import { buildServer } from "../src/server.js";
import { signToken, testIssuer, testAudience } from "./helpers/keys.js";
import { dbUrl } from "./helpers/require-db.js";

describe.skipIf(!dbUrl)("when the JWKS endpoint is unreachable", () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof createPrismaClient>;

  beforeAll(async () => {
    prisma = createPrismaClient(dbUrl!);
    app = await buildServer({
      config: {
        port: 3001, databaseUrl: dbUrl!, jwksUri: "unused",
        jwtIssuer: testIssuer, jwtAudience: testAudience,
        version: "0.0.0", nodeEnv: "test",
      },
      userRepo: createUserRepo(prisma),
      // Stands in for createRemoteJWKSet against a dead endpoint.
      getKey: () => {
        throw new Error("ECONNREFUSED: the JWKS endpoint is unreachable");
      },
      tracerProvider: createTracerProvider(new InMemorySpanExporter()),
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("returns 503, not 401 — the token is fine, our key source is down", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(503);
  });

  it("does not tell the user their token is invalid", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    const body = res.json<{ title: string; detail: string }>();
    expect(body.detail).not.toMatch(/invalid|expired/i);
    expect(body.title).toMatch(/unavailable/i);
  });

  it("still returns 401 for a genuinely malformed token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: "Bearer not-a-jwt" },
    });
    // Malformed input fails before the key-getter is ever consulted.
    expect(res.statusCode).toBe(401);
  });
});
