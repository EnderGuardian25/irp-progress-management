import Fastify, { type FastifyInstance } from "fastify";
import type { JWTVerifyGetKey } from "jose";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { AppConfig } from "./config.js";
import type { UserRepo } from "./db/user-repo.js";
import { buildAjv, createValidatorCompiler } from "./validation.js";
import { tracingPlugin } from "./telemetry.js";
import { problemDetailsPlugin } from "./plugins/problem-details.js";
import { authPlugin } from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";

export interface ServerDeps {
  config: AppConfig;
  userRepo: UserRepo;
  getKey: JWTVerifyGetKey;
  tracerProvider: NodeTracerProvider;
}

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.config.nodeEnv !== "test" });
  app.decorate("config", deps.config);
  // Wired now so the moment a request body lands (Plan 6) it is validated
  // against the spec's 2020-12 schema, not Fastify's draft-07 default.
  app.setValidatorCompiler(createValidatorCompiler(buildAjv()));

  await app.register(tracingPlugin, { tracerProvider: deps.tracerProvider });
  await app.register(problemDetailsPlugin);
  await app.register(authPlugin, {
    getKey: deps.getKey,
    issuer: deps.config.jwtIssuer,
    audience: deps.config.jwtAudience,
    userRepo: deps.userRepo,
  });
  await app.register(healthRoutes);
  await app.register(meRoutes);

  await app.ready();
  return app;
}
