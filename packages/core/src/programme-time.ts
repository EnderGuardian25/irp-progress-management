import { civilDate, dateParts, type CivilDate } from "./civil-date.js";

/**
 * Every deadline, cycle boundary and late determination is evaluated in this
 * zone (NFR-12, FR-9). The deploy region is not Sri Lanka, so the server's
 * local timezone is never consulted.
 */
export const PROGRAMME_TIME_ZONE = "Asia/Colombo";

const DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: PROGRAMME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const WALL_CLOCK_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: PROGRAMME_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPart["type"],
): string {
  const found = parts.find((p) => p.type === type);
  if (found === undefined) {
    throw new Error(`Intl did not return a "${type}" part`);
  }
  return found.value;
}

/** The Colombo calendar date that a UTC instant falls on. */
export function toProgrammeDate(instant: Date): CivilDate {
  const parts = DATE_PARTS.formatToParts(instant);
  // Intl emits the year unpadded — year 99 formats as "99", not "0099" —
  // which would fail civilDate()'s four-digit regex outright. Padding is a
  // no-op for every year from 1000 on.
  const year = part(parts, "year").padStart(4, "0");
  return civilDate(`${year}-${part(parts, "month")}-${part(parts, "day")}`);
}

/**
 * Milliseconds this zone is ahead of UTC at a given instant.
 *
 * Both sides of the subtraction are floored to the whole second. The
 * formatter emits no milliseconds, so the wall clock below is built with
 * ms = 0; subtracting an instant that carries milliseconds would skew the
 * offset by up to 999 ms and push every computed deadline off by nearly a
 * second. Zone offsets are always whole minutes, so discarding milliseconds
 * from both sides loses nothing.
 *
 * Epoch-seeded rather than `Date.UTC` for the same reason as toUtcMidnight:
 * Date.UTC would remap a year 0-99 to 1900-1999 and yield an offset wrong by
 * nineteen centuries.
 */
function zoneOffsetMs(instant: Date): number {
  const parts = WALL_CLOCK_PARTS.formatToParts(instant);
  const asIfUtc = new Date(0);
  asIfUtc.setUTCFullYear(
    Number(part(parts, "year")),
    Number(part(parts, "month")) - 1,
    Number(part(parts, "day")),
  );
  asIfUtc.setUTCHours(
    Number(part(parts, "hour")),
    Number(part(parts, "minute")),
    Number(part(parts, "second")),
    0,
  );
  return asIfUtc.getTime() - (instant.getTime() - instant.getUTCMilliseconds());
}

/**
 * The UTC instant of 23:59:59.999 Colombo on the given date — the submission
 * deadline for that weekday (FR-13).
 *
 * Two passes: the offset is derived at a first-guess instant, then re-derived
 * at the corrected instant. Sri Lanka has observed no DST since 2006 so one
 * pass would do today, but deriving the offset rather than hardcoding +05:30
 * means a future zone change cannot silently corrupt every deadline.
 */
export function endOfProgrammeDay(date: CivilDate): Date {
  const { year, month, day } = dateParts(date);
  // Seeded from epoch and set via setUTCFullYear for the same reason
  // toUtcMidnight does: Date.UTC remaps years 0-99 to 1900-1999, and
  // civilDate() accepts those years.
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  probe.setUTCHours(23, 59, 59, 999);
  const wallClock = probe.getTime();
  const firstGuess = new Date(wallClock - zoneOffsetMs(new Date(wallClock)));
  return new Date(wallClock - zoneOffsetMs(firstGuess));
}
