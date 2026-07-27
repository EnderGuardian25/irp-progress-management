import { civilDate, compareDates, dateParts, type CivilDate } from "./civil-date.js";
import { workingDaysBetween } from "./weekday.js";

/** Cycles run the 10th of one month to the 9th of the next (FR-9). */
const CYCLE_START_DAY = 10;
const CYCLE_END_DAY = 9;

export interface CycleBounds {
  readonly start: CivilDate;
  readonly end: CivilDate;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function pad4(value: number): string {
  return String(value).padStart(4, "0");
}

/** Build a CivilDate from year/month/day numbers, normalising month overflow. */
function build(year: number, month: number, day: number): CivilDate {
  let y = year;
  let m = month;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return civilDate(`${pad4(y)}-${pad2(m)}-${pad2(day)}`);
}

/** The 10th-to-9th cycle that `date` falls inside. */
export function cycleContaining(date: CivilDate): CycleBounds {
  const { year, month, day } = dateParts(date);
  // Before the 10th means we are still inside the cycle that opened last month.
  const startMonth = day < CYCLE_START_DAY ? month - 1 : month;
  // build() already normalises month over/underflow, so the end month can be
  // derived from the same unnormalised inputs rather than re-parsing `start`.
  return {
    start: build(year, startMonth, CYCLE_START_DAY),
    end: build(year, startMonth + 1, CYCLE_END_DAY),
  };
}

/** Move a cycle start forward or backward by whole cycles. */
export function shiftCycle(start: CivilDate, months: number): CivilDate {
  const { year, month } = dateParts(start);
  return build(year, month + months, CYCLE_START_DAY);
}

/** Every weekday inside a cycle. Weekends are absent, not marked (FR-12). */
export function cycleWorkingDays(bounds: CycleBounds): CivilDate[] {
  return workingDaysBetween(bounds.start, bounds.end);
}

export interface Cycle extends CycleBounds {
  /** 1-based position within the student's programme. */
  readonly index: number;
}

/**
 * The first cycle a student is actually evaluated for.
 *
 * This implements only the JOINING half of FR-27. The full requirement is
 * that a student who joins *or leaves* partway through a cycle is not
 * evaluated for that cycle; here, admission counts only when it lands exactly
 * on a cycle start (the 10th), and otherwise evaluation begins with the
 * following cycle.
 *
 * Departure is not modelled at all. There is no enrolment record to hang a
 * departure date on until the data-model plan lands, and `cycleFor` takes no
 * departure argument. A caller must NOT treat `cycleFor` as FR-27-complete:
 * it will happily return a cycle for a student who left halfway through it.
 */
export function firstEvaluatedCycleStart(admission: CivilDate): CivilDate {
  const { start } = cycleContaining(admission);
  return admission === start ? start : shiftCycle(start, 1);
}

/** Whole cycles between two cycle starts. */
function cyclesBetween(from: CivilDate, to: CivilDate): number {
  const fromParts = dateParts(from);
  const toParts = dateParts(to);
  return (toParts.year - fromParts.year) * 12 + (toParts.month - fromParts.month);
}

/**
 * The evaluated cycle that `date` falls in, for a student admitted on
 * `admission`. Returns null when `date` precedes the first evaluated cycle.
 */
export function cycleFor(date: CivilDate, admission: CivilDate): Cycle | null {
  const first = firstEvaluatedCycleStart(admission);
  const bounds = cycleContaining(date);
  if (compareDates(bounds.start, first) < 0) {
    return null;
  }
  return { ...bounds, index: cyclesBetween(first, bounds.start) + 1 };
}
