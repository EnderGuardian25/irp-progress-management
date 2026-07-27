import { civilDate, type CivilDate } from "./civil-date.js";
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
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  // Before the 10th means we are still inside the cycle that opened last month.
  const startMonth = day < CYCLE_START_DAY ? month - 1 : month;
  const start = build(year, startMonth, CYCLE_START_DAY);
  const [startYear, startMonthNormalised] = start.split("-").map(Number) as [number, number];
  const end = build(startYear, startMonthNormalised + 1, CYCLE_END_DAY);
  return { start, end };
}

/** Move a cycle start forward or backward by whole cycles. */
export function shiftCycle(start: CivilDate, months: number): CivilDate {
  const [year, month] = start.split("-").map(Number) as [number, number];
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
 * FR-27: a student who joins partway through a cycle is not evaluated for it.
 * So admission counts only when it lands exactly on a cycle start (the 10th);
 * otherwise evaluation begins with the following cycle.
 */
export function firstEvaluatedCycleStart(admission: CivilDate): CivilDate {
  const { start } = cycleContaining(admission);
  return admission === start ? start : shiftCycle(start, 1);
}

/** Whole cycles between two cycle starts. */
function cyclesBetween(from: CivilDate, to: CivilDate): number {
  const [fromYear, fromMonth] = from.split("-").map(Number) as [number, number];
  const [toYear, toMonth] = to.split("-").map(Number) as [number, number];
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/**
 * The evaluated cycle that `date` falls in, for a student admitted on
 * `admission`. Returns null when `date` precedes the first evaluated cycle.
 */
export function cycleFor(date: CivilDate, admission: CivilDate): Cycle | null {
  const first = firstEvaluatedCycleStart(admission);
  const bounds = cycleContaining(date);
  if (bounds.start < first) {
    return null;
  }
  return { ...bounds, index: cyclesBetween(first, bounds.start) + 1 };
}
