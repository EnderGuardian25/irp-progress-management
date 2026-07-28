import { defineConfig, env } from "prisma/config";

// Prisma 7 removed `url` from the schema's datasource block. The CLI (migrate,
// introspect) reads the connection URL from here instead; the runtime client
// gets it via a driver adapter in src/db/client.ts. See ADR-0008.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
