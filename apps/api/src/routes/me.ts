import type { FastifyPluginAsync } from "fastify";
import type { components } from "@irp/types";
import type { UserRecord } from "../db/user-repo.js";

type ApiUser = components["schemas"]["User"];

// A mapping object, not a ternary. `UserRecord["role"]` is compiler-checked
// against the generated Prisma enum at user-repo.ts, so a third Role member
// fails there — but the natural fix at that point is to widen the union, and a
// ternary would then map the new member to "Student" in silence. `Record<...>`
// makes this half of the chain exhaustive too: widening the union without
// adding a case here is a type error.
export const ROLE_TO_API: Record<UserRecord["role"], ApiUser["role"]> = {
  ADMIN: "Admin",
  STUDENT: "Student",
};

export function toApiUser(record: UserRecord): ApiUser {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: ROLE_TO_API[record.role],
  };
}

// eslint-disable-next-line @typescript-eslint/require-await
export const meRoutes: FastifyPluginAsync = async (app) => {
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get("/api/v1/me", { preHandler: [app.authenticate] }, async (req): Promise<ApiUser> => {
    return toApiUser(req.user!);
  });
};
