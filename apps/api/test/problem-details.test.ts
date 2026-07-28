import { describe, it, expect } from "vitest";
import Fastify, { type FastifyError } from "fastify";
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

/**
 * A stand-in for the errors Fastify itself throws (`FST_ERR_CTP_INVALID_JSON`,
 * `FST_ERR_CTP_INVALID_MEDIA_TYPE`, ...). Built by hand rather than imported so
 * the `headers` case can be exercised: `setErrorHandler` replaces Fastify's
 * `defaultErrorHandler` wholesale, and `setErrorStatusCode`/`setErrorHeaders`
 * live *inside* that default — so honouring both is entirely our job.
 */
function fastifyError(
  code: string,
  statusCode: number,
  message: string,
  headers?: Record<string, string>,
): FastifyError {
  const err = new Error(message) as FastifyError & { headers?: Record<string, string> };
  err.code = code;
  err.statusCode = statusCode;
  if (headers) err.headers = headers;
  return err;
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

  it("honours a Fastify 4xx error's own status instead of collapsing it to 500", async () => {
    const app = await appWith(() => {
      throw fastifyError(
        "FST_ERR_CTP_INVALID_MEDIA_TYPE",
        415,
        "Unsupported Media Type: text/plain",
      );
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(415);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json<ProblemLike>();
    expect(body.status).toBe(415);
    expect(body.title).toBe("Unsupported Media Type");
    expect(body.detail).toContain("text/plain");
    expect(validate(body)).toBe(true);
    await app.close();
  });

  it("applies headers carried on a Fastify error rather than dropping them", async () => {
    const app = await appWith(() => {
      throw fastifyError("FST_ERR_TOO_MANY_REQUESTS", 429, "Rate limit exceeded", {
        "retry-after": "30",
      });
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBe("30");
    expect(validate(res.json())).toBe(true);
    await app.close();
  });

  it("returns 400, not 500, for a malformed JSON body (real FST_ERR_CTP_INVALID_JSON)", async () => {
    // The end-to-end proof: no hand-built error, Fastify's own content-type
    // parser raises this. Latent until Plan 6 ships a POST; the NFR is
    // "200 RPS burst, zero 5xx", and a bad body is not a server fault.
    const app = await appWith(() => { throw new Error("unused"); });
    app.post("/echo", () => ({ ok: true }));
    const res = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json<ProblemLike>().status).toBe(400);
    expect(validate(res.json())).toBe(true);
    await app.close();
  });

  it("still hides the message of an unexpected 5xx that carries a statusCode", async () => {
    const app = await appWith(() => {
      throw fastifyError("FST_ERR_SOMETHING", 503, "secret db string");
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json<ProblemLike>().detail).not.toContain("secret db string");
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
