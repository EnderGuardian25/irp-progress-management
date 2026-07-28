import type { FastifyPluginAsync } from "fastify";
import type { components } from "@irp/types";
import type { UserRecord } from "../db/user-repo.js";

type ApiUser = components["schemas"]["User"];

export function toApiUser(record: UserRecord): ApiUser {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role === "ADMIN" ? "Admin" : "Student",
  };
}

// eslint-disable-next-line @typescript-eslint/require-await
export const meRoutes: FastifyPluginAsync = async (app) => {
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get("/api/v1/me", { preHandler: [app.authenticate] }, async (req): Promise<ApiUser> => {
    return toApiUser(req.user!);
  });
};
