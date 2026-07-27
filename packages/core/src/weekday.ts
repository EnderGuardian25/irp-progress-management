import { addDays, compareDates, dayOfWeek, type CivilDate } from "./civil-date.js";

const MONDAY = 1;
const FRIDAY = 5;

/** Monday to Friday. Weekends have no submission slot at all (FR-12). */
export function isWeekday(date: CivilDate): boolean {
  const day = dayOfWeek(date);
  return day >= MONDAY && day <= FRIDAY;
}

/** The nearest weekday strictly before `date`. Monday yields the prior Friday. */
export function previousWeekday(date: CivilDate): CivilDate {
  let cursor = addDays(date, -1);
  while (!isWeekday(cursor)) {
    cursor = addDays(cursor, -1);
  }
  return cursor;
}

/** The nearest weekday strictly after `date`. Friday yields the following Monday. */
export function nextWeekday(date: CivilDate): CivilDate {
  let cursor = addDays(date, 1);
  while (!isWeekday(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/** Every weekday from `start` to `end` inclusive. Empty if end precedes start. */
export function workingDaysBetween(start: CivilDate, end: CivilDate): CivilDate[] {
  const days: CivilDate[] = [];
  let cursor = start;
  while (compareDates(cursor, end) <= 0) {
    if (isWeekday(cursor)) {
      days.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return days;
}
