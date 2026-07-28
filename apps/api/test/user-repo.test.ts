import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createPrismaClient } from "../src/db/client.js";
import { createUserRepo } from "../src/db/user-repo.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

describe.skipIf(!dbUrl)("createUserRepo", () => {
  const prisma = createPrismaClient(dbUrl!);
  const repo = createUserRepo(prisma);

  beforeEach(async () => { await resetDb(prisma); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("finds an active user by externalId", async () => {
    await prisma.user.create({
      data: { externalId: "oid-1", email: "a@bistecglobal.com", displayName: "Amaya", role: "STUDENT" },
    });
    const found = await repo.findByExternalId("oid-1");
    expect(found?.email).toBe("a@bistecglobal.com");
    expect(found?.role).toBe("STUDENT");
  });

  it("returns null for an unknown externalId", async () => {
    expect(await repo.findByExternalId("nobody")).toBeNull();
  });

  it("hides a soft-deleted user (FR-5) — treated as unregistered", async () => {
    await prisma.user.create({
      data: { externalId: "oid-2", email: "b@bistecglobal.com", displayName: "Ben", role: "ADMIN", deletedAt: new Date() },
    });
    expect(await repo.findByExternalId("oid-2")).toBeNull();
  });
});
