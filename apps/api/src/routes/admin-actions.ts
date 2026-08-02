import type { FastifyPluginAsync } from "fastify";
import { civilDate } from "@irp/core";
import type { components } from "@irp/types";
import type { UserRepo } from "../db/user-repo.js";
import type { BatchRepo, EnrolmentRecord } from "../db/batch-repo.js";
import { BatchNotFoundError, SelfArchiveError, UserNotFoundError } from "../domain/errors.js";
import { requireAdmin } from "../plugins/roles.js";
import { resolveStudent } from "./reviews.js";
import { ROLE_TO_API } from "./me.js";
import { TRANSFER_BODY, UUID_PARAM } from "./schemas.js";

type ApiEnrolment = components["schemas"]["Enrolment"];
type ApiUserDetail = components["schemas"]["UserDetail"];

function toApiEnrolment(e: EnrolmentRecord): ApiEnrolment {
  return {
    id: e.id,
    studentId: e.studentId,
    batchId: e.batchId,
    startDate: e.startDate,
    endDate: e.endDate,
  };
}

export const adminActionRoutes: FastifyPluginAsync<{
  userRepo: UserRepo;
  batchRepo: BatchRepo;
  // eslint-disable-next-line @typescript-eslint/require-await
}> = async (app, opts) => {
  app.post<{ Params: { id: string }; Body: components["schemas"]["TransferRequest"] }>(
    "/api/v1/students/:id/transfer",
    { schema: { params: UUID_PARAM, body: TRANSFER_BODY }, preHandler: [app.authenticate] },
    async (req): Promise<ApiEnrolment> => {
      requireAdmin(req);
      await resolveStudent(opts.userRepo, req.params.id);
      const batch = await opts.batchRepo.getBatch(req.body.toBatchId);
      if (!batch) throw new BatchNotFoundError(req.body.toBatchId);
      const effectiveDate = civilDate(req.body.effectiveDate);
      // Task 3's BatchRepo.transfer throws the rest: NoOpenEnrolmentError
      // (409) when the student has no open enrolment, InvalidTransferDateError
      // (400) when effectiveDate does not leave the previous enrolment a
      // single day (ADR-0017).
      const enrolment = await opts.batchRepo.transfer(req.params.id, req.body.toBatchId, effectiveDate);
      return toApiEnrolment(enrolment);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/users/:id",
    { schema: { params: UUID_PARAM }, preHandler: [app.authenticate] },
    async (req): Promise<ApiUserDetail> => {
      requireAdmin(req);
      if (req.user!.id === req.params.id) throw new SelfArchiveError();
      const target = await opts.userRepo.findById(req.params.id);
      if (!target) throw new UserNotFoundError(req.params.id);
      await opts.userRepo.archive(req.params.id, new Date());
      // Archive revokes ACCESS (findByExternalId filters deletedAt, so /me
      // 403s) and roster presence, not history — FR-5. `findById` is
      // deliberately unfiltered, so archived students remain reviewable
      // through the Task 8 review endpoints (GET /students/{id}/days etc.).
      const archived = await opts.userRepo.findById(req.params.id);
      return {
        id: archived!.id,
        email: archived!.email,
        displayName: archived!.displayName,
        role: ROLE_TO_API[archived!.role],
        archived: archived!.deletedAt !== null,
      };
    },
  );
};
