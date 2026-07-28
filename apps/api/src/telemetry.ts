import type { Span } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import fp from "fastify-plugin";
import type { FastifyRequest } from "fastify";

const INVALID_TRACE_ID = "0".repeat(32);

declare module "fastify" {
  interface FastifyRequest {
    span?: Span;
  }
}

export function createTracerProvider(exporter: SpanExporter): NodeTracerProvider {
  return new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "irp-api" }),
    // SimpleSpanProcessor exports on span end — deterministic for tests.
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
}

export const tracingPlugin = fp<{ tracerProvider: NodeTracerProvider }>(
  (app, opts, done) => {
    const tracer = opts.tracerProvider.getTracer("irp-api");
    app.addHook("onRequest", (req, _reply, hookDone) => {
      const name = `${req.method} ${req.routeOptions.url ?? req.url}`;
      req.span = tracer.startSpan(name);
      hookDone();
    });
    app.addHook("onError", (req, _reply, err, hookDone) => {
      req.span?.recordException(err);
      hookDone();
    });
    app.addHook("onResponse", (req, reply, hookDone) => {
      req.span?.setAttribute("http.status_code", reply.statusCode);
      req.span?.end();
      hookDone();
    });
    done();
  },
  { name: "tracing" },
);

export function currentTraceId(request: FastifyRequest): string | undefined {
  const ctx = request.span?.spanContext();
  if (!ctx || ctx.traceId === INVALID_TRACE_ID) return undefined;
  return ctx.traceId;
}
