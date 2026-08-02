import {
  compareDates,
  cycleContaining,
  firstEvaluatedCycleStart,
  shiftCycle,
  type CivilDate,
} from "@irp/core";
import type { PrismaClient } from "../generated/prisma/client.js";
import { fromDbDate, toDbDate } from "./civil-date-map.js";

export interface CycleRecord {
  id: string;
  batchId: string;
  seq: number;
  startDate: CivilDate;
  endDate: CivilDate;
}

export interface CycleRepo {
  /**
   * Materialise every cycle from the batch's first evaluated cycle up to and
   * including the one containing `through`. Idempotent: existing (batchId,
   * seq) rows are left untouched, so an Evaluation FK can never be orphaned
   * by a re-run. The ENGINE owns the arithmetic; these rows are its cache
   * (spec §3).
   */
  ensureCycles(batchId: string, through: CivilDate): Promise<CycleRecord[]>;
  listForBatch(batchId: string): Promise<CycleRecord[]>;
}

export function createCycleRepo(prisma: PrismaClient): CycleRepo {
  async function listForBatch(batchId: string): Promise<CycleRecord[]> {
    const rows = await prisma.cycle.findMany({ where: { batchId }, orderBy: { seq: "asc" } });
    return rows.map((c) => ({
      id: c.id,
      batchId: c.batchId,
      seq: c.seq,
      startDate: fromDbDate(c.startDate),
      endDate: fromDbDate(c.endDate),
    }));
  }

  return {
    async ensureCycles(batchId, through) {
      const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
      const admission = fromDbDate(batch.startDate);
      const lastWanted = cycleContaining(through).start;

      let start = firstEvaluatedCycleStart(admission);
      let seq = 1;
      const wanted: { seq: number; start: CivilDate }[] = [];
      while (compareDates(start, lastWanted) <= 0) {
        wanted.push({ seq, start });
        start = shiftCycle(start, 1);
        seq += 1;
      }

      await prisma.$transaction(
        wanted.map((w) =>
          prisma.cycle.upsert({
            where: { batchId_seq: { batchId, seq: w.seq } },
            update: {},
            create: {
              batchId,
              seq: w.seq,
              startDate: toDbDate(w.start),
              endDate: toDbDate(cycleContaining(w.start).end),
            },
          }),
        ),
      );
      return listForBatch(batchId);
    },

    listForBatch,
  };
}
