import type { FastifyRequest } from "fastify";
import { HttpError } from "../errors.js";

/**
 * Mentor-only endpoints (spec §Batches: every operation is 403 for a
 * STUDENT token). A plain function, not a Fastify decoration — nothing
 * here needs app-level state, and route handlers call it as the first
 * line of the body, the same shape `requireStudent` (routes/entries.ts)
 * uses for the opposite gate.
 */
export function requireAdmin(req: FastifyRequest): void {
  if (req.user?.role !== "ADMIN") {
    throw new HttpError(
      403,
      "https://irp.bistec.example/problems/admin-only",
      "Admin access required",
      "This endpoint is for mentors.",
    );
  }
}
