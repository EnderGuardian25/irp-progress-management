import { createPrismaClient } from "../src/db/client.js";
import { runSeed } from "../src/seed/run-seed.js";

try {
  process.loadEnvFile(); // picks up apps/api/.env locally
} catch {
  /* CI provides DATABASE_URL via the environment; no .env file exists there */
}

// Same posture as the dev-bypass guard: demo data never enters production,
// and the comparison is case-insensitive so NODE_ENV=Production still trips.
// Loading .env FIRST and guarding ONCE, after, covers both cases: Node's
// loadEnvFile never overrides an already-set variable, so a shell-exported
// NODE_ENV=production is untouched by the load, and a .env-file-set
// NODE_ENV=production is visible by the time this check runs. Guarding
// before the load would miss the .env case entirely.
if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
  console.error("[seed] refusing to run with NODE_ENV=production — demo data never enters production.");
  process.exit(1);
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
