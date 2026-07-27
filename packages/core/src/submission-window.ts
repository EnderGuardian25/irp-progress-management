import { addDays, compareDates, type CivilDate } from "./civil-date.js";
import { endOfProgrammeDay, toProgrammeDate } from "./programme-time.js";
import { nextWeekday, previousWeekday } from "./weekday.js";

export interface SubmissionWindow {
  /** Dates an entry may target right now. Most recent first. */
  readonly targetDates: CivilDate[];
  /** When the oldest currently-open target expires. */
  readonly graceClosesAt: Date;
}

/**
 * The last instant an entry for `target` is accepted.
 *
 * One rule covers required and optional days alike: grace runs to the end of
 * the next WEEKDAY. Friday, Saturday and Sunday all resolve to Monday night.
 *
 * ASSUMPTION: O-10. FR-13 says "one further day"; FR-15 says an entry may
 * target the current or immediately preceding weekday. They disagree on
 * Monday. This implements the FR-15 reading. Weekend work is optional
 * (FR-12, FR-33), so closing Friday's grace on Saturday night would force a
 * weekend login to protect a weekday submission — making optional work
 * effectively mandatory. Needs mentor confirmation.
 */
export function graceDeadlineFor(target: CivilDate): Date {
  return endOfProgrammeDay(nextWeekday(target));
}

/**
 * Whether an entry targeting `target` is accepted at instant `now`
 * (FR-14, FR-15, FR-33).
 *
 * No weekday guard: weekends are optional days that may hold Extra entries.
 */
export function canSubmitFor(target: CivilDate, now: Date): boolean {
  if (target > toProgrammeDate(now)) {
    return false;
  }
  return now.getTime() <= graceDeadlineFor(target).getTime();
}

/**
 * Every date a student may submit for at instant `now`, most recent first.
 *
 * Candidates run from the previous weekday to today inclusive, which sweeps
 * up any intervening weekend. Each is then filtered by canSubmitFor, so the
 * grace rule stays in exactly one place.
 */
export function submissionWindow(now: Date): SubmissionWindow {
  const today = toProgrammeDate(now);
  const targetDates: CivilDate[] = [];

  let cursor = previousWeekday(today);
  while (compareDates(cursor, today) <= 0) {
    if (canSubmitFor(cursor, now)) {
      targetDates.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  targetDates.reverse();

  return { targetDates, graceClosesAt: endOfProgrammeDay(today) };
}
