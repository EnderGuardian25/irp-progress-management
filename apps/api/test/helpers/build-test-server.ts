import type { FastifyInstance } from "fastify";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createPrismaClient } from "../../src/db/client.js";
import { createUserRepo } from "../../src/db/user-repo.js";
import { createEntryRepo } from "../../src/db/entry-repo.js";
import { createAbsenceRepo } from "../../src/db/absence-repo.js";
import { createBatchRepo } from "../../src/db/batch-repo.js";
import { createDayService } from "../../src/services/day-service.js";
import { createTracerProvider } from "../../src/telemetry.js";
import { buildServer } from "../../src/server.js";
import { getLocalKeySet, testIssuer, testAudience } from "./keys.js";

export async function buildTestServer(databaseUrl: string): Promise<{
  app: FastifyInstance;
  exporter: InMemorySpanExporter;
  prisma: ReturnType<typeof createPrismaClient>;
}> {
  const prisma = createPrismaClient(databaseUrl);
  const exporter = new InMemorySpanExporter();
  const entryRepo = createEntryRepo(prisma);
  const absenceRepo = createAbsenceRepo(prisma);
  const batchRepo = createBatchRepo(prisma);
  const app = await buildServer({
    config: {
      port: 3001, databaseUrl, jwksUri: "unused",
      jwtIssuer: testIssuer, jwtAudience: testAudience, version: "0.0.0", nodeEnv: "test",
    },
    userRepo: createUserRepo(prisma),
    entryRepo,
    dayService: createDayService({ entryRepo, absenceRepo, batchRepo }),
    getKey: await getLocalKeySet(),
    tracerProvider: createTracerProvider(exporter),
  });
  return { app, exporter, prisma };
}
