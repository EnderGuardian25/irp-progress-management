import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createTracerProvider, tracingPlugin } from "../src/telemetry.js";
import { problemDetailsPlugin } from "../src/plugins/problem-details.js";
import { UnauthorizedError, ForbiddenError } from "../src/errors.js";
import { buildAjv } from "../src/validation.js";
import { problemSchema } from "./helpers/problem-schema.js";

interface ProblemLike {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId?: string;
}

async function appWith(handler: () => never) {
  const provider = createTracerProvider(new InMemorySpanExporter());
  const app = Fastify();
  await app.register(tracingPlugin, { tracerProvider: provider });
  await app.register(problemDetailsPlugin);
  // Not async: the handler always throws synchronously, and Fastify catches
  // both synchronous throws and rejected promises the same way, so no
  // await is ever produced here (@typescript-eslint/require-await).
  app.get("/boom", () => handler());
  return app;
}

const validate = buildAjv().compile(problemSchema);

describe("problem-details handler", () => {
  it("maps UnauthorizedError to a 401 Problem body", async () => {
    const app = await appWith(() => { throw new UnauthorizedError("The bearer token has expired."); });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(401);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json<ProblemLike>();
    expect(body.status).toBe(401);
    expect(body.title).toBe("Authentication required");
    expect(body.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(body.instance).toBe("/boom");
    expect(validate(body)).toBe(true);
    await app.close();
  });

  it("maps ForbiddenError to a 403 Problem body", async () => {
    const app = await appWith(() => { throw new ForbiddenError(); });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(403);
    expect(res.json<ProblemLike>().status).toBe(403);
    expect(validate(res.json())).toBe(true);
    await app.close();
  });

  it("maps an unexpected error to 500 without leaking the message", async () => {
    const app = await appWith(() => { throw new Error("secret db string"); });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    const body = res.json<ProblemLike>();
    expect(body.detail).not.toContain("secret db string");
    expect(body.title).toBe("Internal Server Error");
    expect(validate(body)).toBe(true);
    await app.close();
  });

  it("returns a Problem-shaped 404 for unknown routes", async () => {
    const app = await appWith(() => { throw new Error("unused"); });
    const res = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(validate(res.json())).toBe(true);
    await app.close();
  });
});
