// Student-facing date labels get the weekday name (§11's copy voice: "Monday",
// not "2026-07-31"). ISO strings stay the wire format everywhere else --
// <option> values, hidden inputs, API calls -- this is presentation only.
const WEEKDAY_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * "Friday, 31 July" for an ISO calendar date ("YYYY-MM-DD").
 *
 * Built from a UTC-midnight instant carrying the exact year/month/day, then
 * formatted in Asia/Colombo. That zone's offset is positive (+05:30), so
 * converting a UTC-midnight instant only ever moves the wall clock LATER
 * within the same calendar day (00:00 UTC -> 05:30 Colombo) -- never
 * backward across midnight -- so this can never display the wrong day.
 */
export function formatCivilDateLabel(isoDate: string): string {
  const parts = isoDate.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return WEEKDAY_DATE_FORMAT.format(new Date(Date.UTC(year, month - 1, day)));
}

/** Just the weekday name ("Friday"), for short inline copy. */
export function formatWeekdayName(isoDate: string): string {
  const parts = isoDate.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    weekday: "long",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
