import Fastify, { type FastifyInstance } from "fastify";
import type { JWTVerifyGetKey } from "jose";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { AppConfig } from "./config.js";
import type { UserRepo } from "./db/user-repo.js";
import type { EntryRepo } from "./db/entry-repo.js";
import { createValidatorCompiler } from "./validation.js";
import { tracingPlugin } from "./telemetry.js";
import { problemDetailsPlugin } from "./plugins/problem-details.js";
import { authPlugin } from "./plugins/auth.js";
import { requireAuthPlugin } from "./plugins/require-auth.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { entryRoutes } from "./routes/entries.js";

export interface ServerDeps {
  config: AppConfig;
  userRepo: UserRepo;
  entryRepo: EntryRepo;
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
  // The compiler picks a strict instance for bodies and a coercing one for
  // querystring/params/headers — see validation.ts.
  app.setValidatorCompiler(createValidatorCompiler());

  await app.register(tracingPlugin, { tracerProvider: deps.tracerProvider });
  await app.register(problemDetailsPlugin);
  await app.register(authPlugin, {
    getKey: deps.getKey,
    issuer: deps.config.jwtIssuer,
    audience: deps.config.jwtAudience,
    userRepo: deps.userRepo,
  });
  // Fail-closed for /api/* before routing. Order is enforced by fastify-plugin's
  // dependency graph, not by convention — a wrong order throws at boot.
  await app.register(requireAuthPlugin);
  await app.register(healthRoutes);
  await app.register(meRoutes);
  await app.register(entryRoutes, { entryRepo: deps.entryRepo });

  await app.ready();
  return app;
}
