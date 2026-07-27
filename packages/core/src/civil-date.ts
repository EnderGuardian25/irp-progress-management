/**
 * A calendar date with no time and no timezone, as `YYYY-MM-DD`.
 *
 * Every piece of calendar arithmetic in this engine runs on CivilDate rather
 * than Date. A Date is an instant, and doing "add one day" to an instant is
 * how timezone bugs get in. ISO date strings also compare lexicographically,
 * so ordering is free.
 */
export type CivilDate = string & { readonly __brand: "CivilDate" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse and validate an ISO calendar date. Throws RangeError if not real. */
export function civilDate(value: string): CivilDate {
  const match = ISO_DATE.exec(value);
  if (match === null) {
    throw new RangeError(`Not an ISO calendar date (expected YYYY-MM-DD): ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Date.UTC normalises out-of-range parts, so round-tripping detects
  // impossible dates such as 2026-02-30.
  //
  // Date.UTC remaps years 0-99 to 1900-1999, which would falsely reject
  // "0099-01-01". setUTCFullYear has no such special case.
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(`Not a real calendar date: ${value}`);
  }
  return value as CivilDate;
}

/**
 * A CivilDate is `YYYY-MM-DD` by construction — civilDate() is the only way
 * to make one — so fixed-offset slicing is safe and needs no assertion. Do
 * not re-run the regex here: that would require a non-null assertion on
 * exec(), which is both a lint violation and a smell.
 */
function toUtcMidnight(date: CivilDate): Date {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtcMidnight(instant: Date): CivilDate {
  return instant.toISOString().slice(0, 10) as CivilDate;
}

/** Shift a calendar date by whole days. Negative shifts backwards. */
export function addDays(date: CivilDate, days: number): CivilDate {
  const instant = toUtcMidnight(date);
  instant.setUTCDate(instant.getUTCDate() + days);
  return fromUtcMidnight(instant);
}

/** Day of week: 0 Sunday … 6 Saturday. */
export function dayOfWeek(date: CivilDate): number {
  return toUtcMidnight(date).getUTCDay();
}

/** -1 if a is earlier, 0 if equal, 1 if a is later. */
export function compareDates(a: CivilDate, b: CivilDate): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
