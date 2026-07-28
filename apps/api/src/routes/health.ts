import type { FastifyPluginAsync } from "fastify";
import type { components } from "@irp/types";

type HealthStatus = components["schemas"]["HealthStatus"];

// eslint-disable-next-line @typescript-eslint/require-await
export const healthRoutes: FastifyPluginAsync = async (app) => {
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get("/health", async (): Promise<HealthStatus> => ({
    status: "ok",
    version: app.config.version,
  }));
};
