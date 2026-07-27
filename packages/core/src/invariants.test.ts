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

  it("submissionWindow always offers today as a target", () => {
    // Today can never be out of grace, weekday or weekend.
    for (const date of all) {
      const noon = new Date(`${date}T06:00:00Z`);
      expect(submissionWindow(noon).targetDates).toContain(date);
    }
  });

  it("submissionWindow never offers a future date", () => {
    for (const date of all) {
      const noon = new Date(`${date}T06:00:00Z`);
      for (const target of submissionWindow(noon).targetDates) {
        expect(target <= date).toBe(true);
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

  it("a weekday is never extra or none", () => {
    const facts: DayFacts = { hasEntry: false, firstEntryAt: null, hasAbsence: false };
    const wellAfter = new Date("2029-06-01T06:00:00Z");
    for (const date of all) {
      if (!isWeekday(civilDate(date))) continue;
      const status = classifyDay(civilDate(date), facts, wellAfter);
      expect(status).not.toBe("extra");
      expect(status).not.toBe("none");
    }
  });
});
