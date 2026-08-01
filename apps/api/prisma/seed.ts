import { createPrismaClient } from "../src/db/client.js";
import { runSeed } from "../src/seed/run-seed.js";

// Same posture as the dev-bypass guard: demo data never enters production,
// and the comparison is case-insensitive so NODE_ENV=Production still trips.
if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
  console.error("[seed] refusing to run with NODE_ENV=production — demo data never enters production.");
  process.exit(1);
}

try {
  process.loadEnvFile(); // picks up apps/api/.env locally
} catch {
  /* CI provides DATABASE_URL via the environment; no .env file exists there */
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[seed] DATABASE_URL is not set.");
  process.exit(1);
}

const prisma = createPrismaClient(url);
try {
  await runSeed(prisma, new Date());
  console.log("[seed] done.");
} catch (error) {
  console.error("[seed] failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
