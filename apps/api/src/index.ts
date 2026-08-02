import { createRemoteJWKSet } from "jose";
import { bootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { createPrismaClient } from "./db/client.js";
import { createUserRepo } from "./db/user-repo.js";
import { createEntryRepo } from "./db/entry-repo.js";
import { createAbsenceRepo } from "./db/absence-repo.js";
import { createBatchRepo } from "./db/batch-repo.js";
import { selectSpanExporter } from "./exporter.js";
import { buildServer } from "./server.js";
import { registerShutdown } from "./shutdown.js";
import { createTracerProvider } from "./telemetry.js";
import { createDayService } from "./services/day-service.js";

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig(process.env);
const prisma = createPrismaClient(config.databaseUrl);

const rawTimeout = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? DEFAULT_SHUTDOWN_TIMEOUT_MS);
const timeoutMs =
  Number.isInteger(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_SHUTDOWN_TIMEOUT_MS;

await bootstrap({
  start: async () => {
    const userRepo = createUserRepo(prisma);
    const entryRepo = createEntryRepo(prisma);
    const absenceRepo = createAbsenceRepo(prisma);
    const batchRepo = createBatchRepo(prisma);
    const dayService = createDayService({ entryRepo, absenceRepo, batchRepo });
    const getKey = createRemoteJWKSet(new URL(config.jwksUri));
    const tracerProvider = createTracerProvider(selectSpanExporter(process.env));
    const app = await buildServer({
      config, userRepo, entryRepo, absenceRepo, dayService, getKey, tracerProvider,
    });

    registerShutdown({
      close: () => app.close(),
      disconnect: () => prisma.$disconnect(),
      exit: (code) => {
        process.exit(code);
      },
      log: (event, err) => {
        if (err === undefined) {
          app.log.info(event);
        } else {
          app.log.error({ err }, event);
        }
      },
      timeoutMs,
      signals: ["SIGTERM", "SIGINT"],
      on: (signal, handler) => {
        process.on(signal, handler);
      },
    });

    await app.listen({ port: config.port, host: "0.0.0.0" });
  },
  disconnect: () => prisma.$disconnect(),
  // No app.log here on purpose: if buildServer rejected there is no app.
  fatal: (err) => {
    console.error(err);
    process.exit(1);
  },
});
