import type { CivilDate } from "./civil-date.js";
import { endOfProgrammeDay, toProgrammeDate } from "./programme-time.js";
import { graceDeadlineFor } from "./submission-window.js";
import { isWeekday } from "./weekday.js";

/**
 * The state of one day for one student.
 *
 * Required days (weekdays) resolve to the first five. Optional days
 * (weekends) resolve to "extra" or "none" — never missed, never late,
 * because you cannot be late for work that was never required.
 *
 * There is no "rejected" — the review flow runs Submitted to In Review to
 * Evaluated with no reject step, and that is a confirmed non-goal.
 */
export type DayStatus =
  | "submitted"
  | "late"
  | "absent"
  | "missed"
  | "pending"
  | "extra"
  | "none"
  | "future";

/**
 * What is on record for one day.
 *
 * A discriminated union rather than three independent fields. `hasEntry: true`
 * alongside `firstEntryAt: null` is not a state this system can be in, and
 * leaving it representable means a later fact-builder could produce a day that
 * holds a real entry but classifies as `missed` — a silent, wrong figure on
 * the mentor's dashboard. Making it unrepresentable costs nothing here.
 */
export type DayFacts =
  | {
      readonly hasEntry: true;
      /** When the earliest entry for this date was created. */
      readonly firstEntryAt: Date;
      readonly hasAbsence: boolean;
    }
  | {
      readonly hasEntry: false;
      readonly firstEntryAt: null;
      readonly hasAbsence: boolean;
    };

/**
 * Classify one day.
 *
 * Order matters twice over. Future is checked first so an unreached day is
 * never reported as a gap. On required days, absence wins over missed because
 * absence is explicitly recorded with a reason and carries no penalty, while
 * missed is a silence.
 */
export function classifyDay(date: CivilDate, facts: DayFacts, now: Date): DayStatus {
  if (date > toProgrammeDate(now)) {
    return "future";
  }

  // Optional day (FR-33). Recorded work is Extra; silence is nothing at all.
  // An absence record here is meaningless — there was nothing to be absent
  // from — so it is ignored rather than treated as a state.
  if (!isWeekday(date)) {
    return facts.hasEntry ? "extra" : "none";
  }

  // The union narrows firstEntryAt to Date here — no null check needed.
  if (facts.hasEntry) {
    const dayEnded = endOfProgrammeDay(date).getTime();
    return facts.firstEntryAt.getTime() <= dayEnded ? "submitted" : "late";
  }

  if (facts.hasAbsence) {
    return "absent";
  }

  // Nothing recorded. Still open until grace closes; final afterwards (FR-14).
  return now.getTime() <= graceDeadlineFor(date).getTime() ? "pending" : "missed";
}
