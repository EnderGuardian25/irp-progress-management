import type { FastifyPluginAsync } from "fastify";
import { canSubmitFor, civilDate } from "@irp/core";
import type { components } from "@irp/types";
import type { AbsenceRepo, AbsenceRecordShape } from "../db/absence-repo.js";
import { AbsenceWindowClosedError } from "../domain/errors.js";
import { requireStudent } from "./entries.js";
import { ABSENCE_CREATE_BODY, DATE_PARAM } from "./schemas.js";

type ApiAbsence = components["schemas"]["Absence"];

function toApiAbsence(a: AbsenceRecordShape): ApiAbsence {
  return { id: a.id, date: a.date, reason: a.reason };
}

/** FR-16 time rule: absence is editable exactly while the window is open. */
function assertWindowOpen(date: string, now: Date): void {
  if (!canSubmitFor(civilDate(date), now)) throw new AbsenceWindowClosedError(date);
}

// eslint-disable-next-line @typescript-eslint/require-await
export const absenceRoutes: FastifyPluginAsync<{ absenceRepo: AbsenceRepo }> = async (app, opts) => {
  app.post<{ Body: components["schemas"]["AbsenceCreate"] }>(
    "/api/v1/absences",
    { schema: { body: ABSENCE_CREATE_BODY }, preHandler: [app.authenticate] },
    async (req): Promise<ApiAbsence> => {
      requireStudent(req);
      assertWindowOpen(req.body.date, new Date());
      const rec = await opts.absenceRepo.create({
        studentId: req.user!.id,
        date: civilDate(req.body.date),
        reason: req.body.reason,
      });
      return toApiAbsence(rec);
    },
  );

  app.delete<{ Params: { date: string } }>(
    "/api/v1/absences/:date",
    { schema: { params: DATE_PARAM }, preHandler: [app.authenticate] },
    async (req): Promise<ApiAbsence> => {
      requireStudent(req);
      assertWindowOpen(req.params.date, new Date());
      const rec = await opts.absenceRepo.remove(req.user!.id, civilDate(req.params.date));
      return toApiAbsence(rec);
    },
  );
};
