import { describe, expect, it } from "vitest";
import {
  addDays,
  civilDate,
  classifyDay,
  cycleContaining,
  cycleWorkingDays,
  isWeekday,
  nextWeekday,
  previousWeekday,
  submissionWindow,
  toProgrammeDate,
  type DayFacts,
} from "./index.js";

/** Every date from 2026-01-01 for three years. */
function everyDateForThreeYears(): string[] {
  const dates: string[] = [];
  let cursor = civilDate("2026-01-01");
  const stop = civilDate("2029-01-01");
  while (cursor < stop) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

describe("invariants across three years of dates", () => {
  const all = everyDateForThreeYears();

  it("previousWeekday never returns a weekend", () => {
    for (const date of all) {
      expect(isWeekday(previousWeekday(civilDate(date)))).toBe(true);
    }
  });

  it("nextWeekday never returns a weekend", () => {
    for (const date of all) {
      expect(isWeekday(nextWeekday(civilDate(date)))).toBe(true);
    }
  });

  it("cycleWorkingDays never contains a weekend", () => {
    for (const date of all) {
      for (const day of cycleWorkingDays(cycleContaining(civilDate(date)))) {
        expect(isWeekday(day)).toBe(true);
      }
    }
  });

  it("every cycle runs from a 10th to a 9th", () => {
    for (const date of all) {
      const { start, end } = cycleContaining(civilDate(date));
      expect(start.endsWith("-10")).toBe(true);
      expect(end.endsWith("-09")).toBe(true);
    }
  });

  it("every cycle contains the date that produced it", () => {
    for (const date of all) {
      const { start, end } = cycleContaining(civilDate(date));
      expect(start <= date && date <= end).toBe(true);
    }
  });

  // A single mid-day instant per date exercises the calendar arithmetic
  // thoroughly and the timezone boundary not at all. 18:29:59.999Z is the
  // last millisecond of a Colombo day and 18:30:00.000Z the first of the
  // next, so each date is also probed either side of the rollover — where a
  // UTC-vs-Colombo mixup would show up as an off-by-one day.
  const instantsFor = (date: string): Date[] => [
    new Date(`${date}T06:00:00Z`),
    new Date(`${date}T18:29:59.999Z`),
    new Date(`${date}T18:30:00.000Z`),
  ];

  it("submissionWindow always offers today as a target, including across the Colombo midnight boundary", () => {
    // Today can never be out of grace, weekday or weekend. "Today" is the
    // Colombo date at that instant, which past 18:30Z is the NEXT UTC date.
    for (const date of all) {
      for (const instant of instantsFor(date)) {
        const today = toProgrammeDate(instant);
        expect(submissionWindow(instant).targetDates).toContain(today);
      }
    }
  });

  it("submissionWindow never offers a future date, including across the Colombo midnight boundary", () => {
    for (const date of all) {
      for (const instant of instantsFor(date)) {
        const today = toProgrammeDate(instant);
        for (const target of submissionWindow(instant).targetDates) {
          expect(target <= today).toBe(true);
        }
      }
    }
  });

  it("a weekend is never missed, late, absent or pending (FR-12, FR-33)", () => {
    const withEntry: DayFacts = {
      hasEntry: true,
      firstEntryAt: new Date("2026-01-01T00:00:00Z"),
      hasAbsence: true,
    };
    const withoutEntry: DayFacts = {
      hasEntry: false,
      firstEntryAt: null,
      hasAbsence: true,
    };
    const wellAfter = new Date("2029-06-01T06:00:00Z");
    for (const date of all) {
      if (isWeekday(civilDate(date))) continue;
      expect(classifyDay(civilDate(date), withEntry, wellAfter)).toBe("extra");
      expect(classifyDay(civilDate(date), withoutEntry, wellAfter)).toBe("none");
    }
  });

  // Asserting the exact status, not just "not extra and not none" — the
  // negative form would pass for six different statuses and so proves very
  // little. Every date in this sweep is a past weekday with nothing on
  // record and grace long closed, which is exactly "missed".
  it("a weekday with nothing recorded and grace closed is always missed", () => {
    const facts: DayFacts = { hasEntry: false, firstEntryAt: null, hasAbsence: false };
    const wellAfter = new Date("2029-06-01T06:00:00Z");
    for (const date of all) {
      if (!isWeekday(civilDate(date))) continue;
      expect(classifyDay(civilDate(date), facts, wellAfter)).toBe("missed");
    }
  });
});
