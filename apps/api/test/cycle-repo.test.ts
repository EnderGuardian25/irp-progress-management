import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { civilDate } from "@irp/core";
import { createPrismaClient } from "../src/db/client.js";
import { createCycleRepo } from "../src/db/cycle-repo.js";
import { resetDb } from "./helpers/db.js";
import { dbUrl } from "./helpers/require-db.js";

describe.skipIf(!dbUrl)("createCycleRepo", () => {
  const prisma = createPrismaClient(dbUrl!);
  const repo = createCycleRepo(prisma);

  beforeEach(async () => { await resetDb(prisma); });
  afterAll(async () => { await prisma.$disconnect(); });

  async function batch(name: string, start: string) {
    return prisma.batch.create({
      data: { name, startDate: new Date(`${start}T00:00:00Z`), endDate: new Date("2027-01-09T00:00:00Z") },
    });
  }

  it("materialises cycles from an on-boundary admission (the 10th)", async () => {
    const b = await batch("On", "2026-05-10");
    const cycles = await repo.ensureCycles(b.id, civilDate("2026-08-02"));
    // 10 May–9 Jun, 10 Jun–9 Jul, 10 Jul–9 Aug
    expect(cycles.map((c) => [c.seq, c.startDate, c.endDate])).toEqual([
      [1, "2026-05-10", "2026-06-09"],
      [2, "2026-06-10", "2026-07-09"],
      [3, "2026-07-10", "2026-08-09"],
    ]);
  });

  it("a mid-cycle admission starts numbering at the NEXT cycle (FR-27 joining half)", async () => {
    const b = await batch("Mid", "2026-05-20");
    const cycles = await repo.ensureCycles(b.id, civilDate("2026-07-15"));
    expect(cycles[0]!.startDate).toBe("2026-06-10"); // not 10 May
    expect(cycles[0]!.seq).toBe(1);
  });

  it("is idempotent — a second call adds nothing and renumbers nothing", async () => {
    const b = await batch("Idem", "2026-05-10");
    await repo.ensureCycles(b.id, civilDate("2026-08-02"));
    const again = await repo.ensureCycles(b.id, civilDate("2026-08-02"));
    expect(again).toHaveLength(3);
    expect(await prisma.cycle.count()).toBe(3);
  });

  it("extends forward when `through` moves into a later cycle", async () => {
    const b = await batch("Ext", "2026-05-10");
    await repo.ensureCycles(b.id, civilDate("2026-06-15"));
    const extended = await repo.ensureCycles(b.id, civilDate("2026-08-15"));
    expect(extended).toHaveLength(4); // through 10 Aug–9 Sep
  });
});
