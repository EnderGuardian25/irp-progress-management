import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createTracerProvider, tracingPlugin, currentTraceId } from "../src/telemetry.js";

describe("tracing", () => {
  it("records exactly one span per request, carrying the status code", async () => {
    const exporter = new InMemorySpanExporter();
    const provider = createTracerProvider(exporter);
    const app = Fastify();
    await app.register(tracingPlugin, { tracerProvider: provider });
    let seenTraceId: string | undefined;
    app.get("/probe", (req) => {
      seenTraceId = currentTraceId(req);
      return { ok: true };
    });

    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(200);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes["http.status_code"]).toBe(200);
    // The id the handler saw is a real 32-hex trace id and matches the exported span.
    expect(seenTraceId).toMatch(/^[0-9a-f]{32}$/);
    expect(seenTraceId).toBe(spans[0]?.spanContext().traceId);

    await app.close();
    await provider.shutdown();
  });
});
