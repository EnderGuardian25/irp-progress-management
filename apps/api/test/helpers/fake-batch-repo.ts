import type { BatchRepo } from "../../src/db/batch-repo.js";

/**
 * A stub for suites that construct `buildServer` without a database
 * connection (auth/plumbing tests). No `/api/v1/batches*` route is exercised
 * in those files, so every method throws if it is ever reached — that is a
 * test bug, not a legitimate call path. Same pattern as `unusedAbsenceRepo`.
 */
export function unusedBatchRepo(): BatchRepo {
  const unused = () => {
    throw new Error("unused: batchRepo was not expected to be called in this suite");
  };
  return {
    create: unused,
    list: unused,
    getBatch: unused,
    enrol: unused,
    transfer: unused,
    openEnrolment: unused,
    firstEnrolmentStart: unused,
    listEnrolments: unused,
    rosterMembers: unused,
  };
}
