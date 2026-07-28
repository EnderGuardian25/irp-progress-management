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
  traceId?: string;
}

function send(reply: FastifyReply, req: FastifyRequest, body: Omit<ProblemBody, "traceId">) {
  const traceId = currentTraceId(req);
  reply
    .status(body.status)
    .header("content-type", "application/problem+json")
    .send({ ...body, ...(traceId ? { traceId } : {}) });
}

export const problemDetailsPlugin = fp(
  (app, opts, done) => {
    app.setErrorHandler((err: FastifyError, req, reply) => {
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
