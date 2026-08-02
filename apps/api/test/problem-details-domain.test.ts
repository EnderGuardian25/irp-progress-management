import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createTracerProvider, tracingPlugin } from "../src/telemetry.js";
import { problemDetailsPlugin } from "../src/plugins/problem-details.js";
import { LockedDayError } from "../src/domain/errors.js";
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

const validate = buildAjv().compile(problemSchema);

describe("problem-details handler — DomainError (ADR-0015)", () => {
  it("maps a LockedDayError to a 409 Problem body with the domain-specific type", async () => {
    const provider = createTracerProvider(new InMemorySpanExporter());
    const app = Fastify();
    await app.register(tracingPlugin, { tracerProvider: provider });
    await app.register(problemDetailsPlugin);
    // Not async: the handler always throws synchronously — see problem-details.test.ts.
    app.get("/boom", () => { throw new LockedDayError("2026-08-03"); });

    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(409);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json<ProblemLike>();
    expect(body.type).toBe("https://irp.bistec.example/problems/day-locked");
    expect(body.title).toBe("Day is locked");
    expect(body.status).toBe(409);
    expect(body.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(validate(body)).toBe(true);
    await app.close();
  });
});
