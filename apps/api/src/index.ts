import { createRemoteJWKSet } from "jose";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { loadConfig } from "./config.js";
import { createPrismaClient } from "./db/client.js";
import { createUserRepo } from "./db/user-repo.js";
import { createTracerProvider } from "./telemetry.js";
import { buildServer } from "./server.js";

const config = loadConfig(process.env);
const prisma = createPrismaClient(config.databaseUrl);
const userRepo = createUserRepo(prisma);
const getKey = createRemoteJWKSet(new URL(config.jwksUri));
const tracerProvider = createTracerProvider(new ConsoleSpanExporter());

const app = await buildServer({ config, userRepo, getKey, tracerProvider });

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}
