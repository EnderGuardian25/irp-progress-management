import { civilDate, type CivilDate } from "@irp/core";

const COLOMBO_OFFSET_MINUTES = 5 * 60 + 30;

/** CivilDate -> the UTC-midnight Date Prisma stores in a DATE column. */
export function toDbDate(date: CivilDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** The UTC-midnight Date Prisma returns for a DATE column -> CivilDate. */
export function fromDbDate(value: Date): CivilDate {
  return civilDate(value.toISOString().slice(0, 10));
}

/**
 * The UTC instant at which a Colombo wall clock shows `time` ("HH:MM") on
 * `date`. The seed uses this to write historically honest submittedAt
 * instants; nothing in this module consults the machine's own timezone.
 */
export function colomboInstant(date: CivilDate, time: string): Date {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`colomboInstant: bad time "${time}" — expected HH:MM`);
  const base = toDbDate(date).getTime();
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return new Date(base + (minutes - COLOMBO_OFFSET_MINUTES) * 60_000);
}
