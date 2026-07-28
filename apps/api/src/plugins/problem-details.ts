import { STATUS_CODES } from "node:http";
import fp from "fastify-plugin";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { HttpError } from "../errors.js";
import { currentTraceId } from "../telemetry.js";

interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  // Required, not optional: spec/openapi.yaml declares `required: [type, title,
  // status, traceId]`, and "quote this when reporting a problem" only works if
  // the field is always there. `send` substitutes the sentinel below when no
  // valid span is in scope, rather than omitting the member.
  traceId: string;
}

// Emitted in place of a trace id when `currentTraceId` finds no valid span.
// Not reachable via the HTTP pipeline today (the tracing plugin's onRequest
// hook always starts one), but it keeps the contract's `required` honest
// instead of relying on that remaining true.
const TRACE_ID_UNAVAILABLE = "unavailable";

function send(reply: FastifyReply, req: FastifyRequest, body: Omit<ProblemBody, "traceId">) {
  reply
    .status(body.status)
    .header("content-type", "application/problem+json")
    .send({ ...body, traceId: currentTraceId(req) ?? TRACE_ID_UNAVAILABLE });
}

/**
 * Fastify's `setErrorHeaders` reads `err.headers` — but it is called only from
 * inside `defaultErrorHandler`, which `setErrorHandler` replaces wholesale
 * (fastify 5.10.0, `lib/error-handler.js:124`). Anything carrying `Retry-After`
 * or `WWW-Authenticate` loses it unless we re-apply it here.
 *
 * `FastifyError` does not declare `headers`, hence the narrowing read.
 */
function errorHeaders(err: FastifyError): Record<string, string> | undefined {
  const headers = (err as { headers?: unknown }).headers;
  return typeof headers === "object" && headers !== null
    ? (headers as Record<string, string>)
    : undefined;
}

export const problemDetailsPlugin = fp(
  (app, opts, done) => {
    app.setErrorHandler((err: FastifyError, req, reply) => {
      const headers = errorHeaders(err);
      if (headers) reply.headers(headers);

      if (err instanceof HttpError) {
        return send(reply, req, {
          type: err.problemType,
          title: err.title,
          status: err.statusCode,
          detail: err.message,
          instance: req.url,
        });
      }
      if (err.validation) {
        return send(reply, req, {
          type: "https://irp.bistec.example/problems/validation-failed",
          title: "Request validation failed",
          status: 400,
          detail: err.message,
          instance: req.url,
        });
      }
      // Fastify's own 4xx errors — FST_ERR_CTP_INVALID_JSON (400),
      // FST_ERR_CTP_EMPTY_JSON_BODY (400), FST_ERR_CTP_INVALID_MEDIA_TYPE (415),
      // FST_ERR_REQ_BODY_TOO_LARGE (413). `setErrorHandler` replaces Fastify's
      // `defaultErrorHandler` wholesale, and `setErrorStatusCode` runs only
      // inside that default, so without this branch every one of them would
      // reach the client as a 500: wrong for the caller, and a 5xx that is not
      // a server fault against the "200 RPS burst, zero 5xx" NFR.
      // Their messages are Fastify's own and safe to surface. 5xx keeps
      // falling through to the opaque handler below.
      const status = err.statusCode;
      if (status !== undefined && status >= 400 && status < 500) {
        return send(reply, req, {
          type: "about:blank",
          title: STATUS_CODES[status] ?? "Request Error",
          status,
          detail: err.message,
          instance: req.url,
        });
      }

      // Unexpected: log server-side, never leak the message to the client.
      req.log.error({ err }, "unhandled error");
      return send(reply, req, {
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred.",
        instance: req.url,
      });
    });

    app.setNotFoundHandler((req, reply) => {
      send(reply, req, {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "No route matches this path.",
        instance: req.url,
      });
    });

    done();
  },
  { name: "problem-details", dependencies: ["tracing"] },
);
