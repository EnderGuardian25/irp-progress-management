import { canSubmitFor, endOfProgrammeDay, isWeekday, type CivilDate } from "@irp/core";
import { SubmissionWindowClosedError } from "./errors.js";

export interface EntryFlags {
  isLate: boolean;
  isExtra: boolean;
}

/**
 * The single place isLate/isExtra are decided (spec §3: computed at
 * submission time and stored).
 *
 * Deliberately evaluated against `submittedAt`, NOT wall-clock now: flags
 * describe the submission instant, so replaying history (the seed) and
 * serving a live request (Plan 6, which passes new Date()) go through the
 * identical rule. A target whose window was closed AT THAT INSTANT throws —
 * the seed cannot fabricate an entry the system would never have accepted.
 */
export function decideEntryFlags(target: CivilDate, submittedAt: Date): EntryFlags {
  if (!canSubmitFor(target, submittedAt)) {
    throw new SubmissionWindowClosedError(target);
  }
  if (!isWeekday(target)) {
    return { isLate: false, isExtra: true }; // FR-33: optional days are never late
  }
  return {
    isLate: submittedAt.getTime() > endOfProgrammeDay(target).getTime(),
    isExtra: false,
  };
}
