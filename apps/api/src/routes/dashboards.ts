import type { FastifyPluginAsync } from "fastify";
import type { components } from "@irp/types";
import type {
  BatchTodayView, CycleView, DayCompliance, DashboardService,
} from "../services/dashboard-service.js";
import { requireAdmin } from "../plugins/roles.js";
import { UUID_PARAM } from "./schemas.js";

type ApiBatchToday = components["schemas"]["BatchTodayDashboard"];

/**
 * Domain views are already the wire shape field-for-field, so these mappers
 * are structural copies rather than translations. They exist anyway: the
 * explicit return type is what makes a spec change that the service has not
 * followed a compile error instead of a silently wrong payload.
 */
function toApiCycle(c: CycleView): components["schemas"]["CycleView"] {
  return { seq: c.seq, startDate: c.startDate, endDate: c.endDate, requiredDayCount: c.requiredDayCount };
}

function toApiDayCompliance(d: DayCompliance): components["schemas"]["DayCompliance"] {
  return {
    date: d.date, enrolled: d.enrolled, submitted: d.submitted,
    late: d.late, absent: d.absent, missed: d.missed, pending: d.pending,
  };
}

function toApiBatchToday(v: BatchTodayView): ApiBatchToday {
  return {
    batchId: v.batch.id,
    batchName: v.batch.name,
    date: v.date,
    isFallbackDay: v.isFallbackDay,
    dayNumber: v.dayNumber,
    cycle: toApiCycle(v.cycle),
    counts: toApiDayCompliance(v.counts),
    extraCount: v.extraCount,
    days: v.days.map(toApiDayCompliance),
    extraAfter: [...v.extraAfter],
  };
}

export const dashboardRoutes: FastifyPluginAsync<{
  dashboardService: DashboardService;
  // eslint-disable-next-line @typescript-eslint/require-await
}> = async (app, opts) => {
  app.get<{ Params: { id: string } }>(
    "/api/v1/batches/:id/dashboard/today",
    { schema: { params: UUID_PARAM }, preHandler: [app.authenticate] },
    async (req): Promise<ApiBatchToday> => {
      requireAdmin(req);
      return toApiBatchToday(await opts.dashboardService.batchToday(req.params.id, new Date()));
    },
  );
};
