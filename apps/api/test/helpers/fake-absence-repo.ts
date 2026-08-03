import type { AbsenceRepo } from "../../src/db/absence-repo.js";

/**
 * A stub for suites that construct `buildServer` without a database
 * connection (auth/plumbing tests). `/api/v1/absences` is never exercised in
 * those files, so every method throws if it is ever reached — that is a test
 * bug, not a legitimate call path. Same pattern as `unusedEntryRepo`.
 */
export function unusedAbsenceRepo(): AbsenceRepo {
  const unused = () => {
    throw new Error("unused: absenceRepo was not expected to be called in this suite");
  };
  return {
    create: unused,
    remove: unused,
    listForStudent: unused,
    listForStudents: unused,
  };
}
