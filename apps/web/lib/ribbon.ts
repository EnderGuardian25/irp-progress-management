import type { DayMark, RibbonDay } from "@/components/cycle-ribbon/cycle-ribbon";
import type { DayStatus } from "@irp/client";

/** The subset of DayCompliance the mark rule reads. Structural, so either the SDK type or a literal satisfies it. */
export interface DayComplianceLike {
  date: string;
  enrolled: number;
  submitted: number;
  late: number;
  absent: number;
  missed: number;
  pending: number;
}

/**
 * Domain status to visual mark, for ONE student's day.
 *
 * `pending` becomes an outline rather than a mark of its own: the grace window
 * is still open, so nothing has gone wrong and drawing a filled bar would
 * claim work that has not been recorded. The design system has no pending
 * mark (§7 lists six), and inventing a seventh colour was rejected there for
 * the same reason it was rejected for Extra.
 *
 * `extra` and `none` also fall through to the outline. Neither should reach
 * here — callers pass required days only — but a total function that claims
 * nothing is a better failure than a crash on a screen a mentor is reading.
 */
export function studentDayMark(status: DayStatus): DayMark {
  switch (status) {
    case "onTime": return "ok";
    case "late": return "late";
    case "absent": return "absent";
    case "missed": return "missed";
    default: return "future";
  }
}

/**
 * Batch compliance for one day to a single mark, worst unresolved outcome
 * first: missed, then late, then absent, then partial, then ok.
 *
 * A mentor scanning the strip needs the failure before the warning and the
 * warning before the excused absence. `partial` ranks below all three because
 * pending work is not yet a problem — it is simply an afternoon that has not
 * finished. `fill` is set on `partial` alone; it is the only mark CycleRibbon
 * renders proportionally (see its MARK_COLOR comment).
 */
export function batchDayMark(day: Omit<DayComplianceLike, "date">): { mark: DayMark; fill?: number } {
  // `late` is deliberately absent from this sum: the API's `submitted`
  // ALREADY includes late submissions (a late entry is still submitted), and
  // `late` only reports how many of them were. Adding it would double-count
  // and make a fully-late day read as over-subscribed. If `DayCompliance`
  // ever makes `late` a disjoint bucket instead, this line breaks silently —
  // no current test pairs a nonzero `late` with a nonzero `pending`.
  const reached = day.submitted + day.absent + day.missed + day.pending;
  if (day.enrolled === 0 || reached === 0) return { mark: "future" };
  if (day.missed > 0) return { mark: "missed" };
  if (day.late > 0) return { mark: "late" };
  if (day.absent > 0) return { mark: "absent" };
  if (day.submitted >= day.enrolled) return { mark: "ok" };
  return { mark: "partial", fill: day.submitted / day.enrolled };
}

/**
 * `isToday` is set only when today is actually in the series — a weekend, or
 * a date outside the cycle, leaves every bar unringed. The ring is a
 * decoration drawn OVER the real mark, never a substitute for it.
 */
export function toStudentRibbonDays(
  days: { date: string; status: DayStatus }[],
  today: string,
): RibbonDay[] {
  return days.map((d) => ({
    date: d.date,
    mark: studentDayMark(d.status),
    ...(d.date === today && { isToday: true }),
  }));
}

export function toBatchRibbonDays(days: DayComplianceLike[], today: string): RibbonDay[] {
  return days.map((d) => ({
    date: d.date,
    ...batchDayMark(d),
    ...(d.date === today && { isToday: true }),
  }));
}
