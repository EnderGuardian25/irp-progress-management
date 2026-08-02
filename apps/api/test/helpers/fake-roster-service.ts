import type { RosterService } from "../../src/services/roster-service.js";

/**
 * A stub for suites that construct `buildServer` without a database
 * connection (auth/plumbing tests). `/api/v1/batches/:id/roster` is never
 * exercised in those files, so the method throws if it is ever reached —
 * that is a test bug, not a legitimate call path. Same pattern as
 * `unusedDayService`.
 */
export function unusedRosterService(): RosterService {
  return {
    roster: () => {
      throw new Error("unused: rosterService was not expected to be called in this suite");
    },
  };
}
