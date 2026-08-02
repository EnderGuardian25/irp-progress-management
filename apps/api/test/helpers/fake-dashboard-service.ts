import type { DashboardService } from "../../src/services/dashboard-service.js";

/**
 * A stub for suites that construct `buildServer` without a database
 * connection (auth/plumbing tests). No dashboard route is exercised in those
 * files, so every method throws if it is ever reached — that is a test bug,
 * not a legitimate call path. Same pattern as `unusedRosterService`.
 */
export function unusedDashboardService(): DashboardService {
  const unused = () => {
    throw new Error("unused: dashboardService was not expected to be called in this suite");
  };
  return { batchToday: unused, batchSummary: unused };
}
