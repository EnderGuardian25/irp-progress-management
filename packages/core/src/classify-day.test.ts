import { describe, expect, it } from "vitest";
import { civilDate } from "./civil-date.js";
import { classifyDay, type DayFacts } from "./classify-day.js";

const none: DayFacts = { hasEntry: false, firstEntryAt: null, hasAbsence: false };
const tuesday = civilDate("2026-07-28");
const tuesdayMidday = new Date("2026-07-28T06:00:00Z");
const thursdayAfter = new Date("2026-07-30T06:00:00Z");

describe("classifyDay", () => {
  it("returns future for a date after today", () => {
    expect(classifyDay(civilDate("2026-07-30"), none, tuesdayMidday)).toBe("future");
  });

  it("returns pending for today with no entry yet", () => {
    expect(classifyDay(tuesday, none, tuesdayMidday)).toBe("pending");
  });

  it("returns submitted when the entry landed on the day itself", () => {
    const facts: DayFacts = {
      hasEntry: true,
      firstEntryAt: new Date("2026-07-28T10:00:00Z"),
      hasAbsence: false,
    };
    expect(classifyDay(tuesday, facts, thursdayAfter)).toBe("submitted");
  });

  it("returns late when the entry landed after the day ended but inside grace", () => {
    const facts: DayFacts = {
      hasEntry: true,
      firstEntryAt: new Date("2026-07-29T06:00:00Z"),
      hasAbsence: false,
    };
    expect(classifyDay(tuesday, facts, thursdayAfter)).toBe("late");
  });

  it("returns absent when marked absent, even with no entry", () => {
    const facts: DayFacts = { hasEntry: false, firstEntryAt: null, hasAbsence: true };
    expect(classifyDay(tuesday, facts, thursdayAfter)).toBe("absent");
  });

  it("prefers absent over missed", () => {
    const facts: DayFacts = { hasEntry: false, firstEntryAt: null, hasAbsence: true };
    expect(classifyDay(civilDate("2026-07-20"), facts, thursdayAfter)).toBe("absent");
  });

  it("returns missed once grace has closed with nothing recorded", () => {
    expect(classifyDay(civilDate("2026-07-20"), none, thursdayAfter)).toBe("missed");
  });

  it("returns pending while grace is still open with nothing recorded", () => {
    // Monday 27th, judged on Tuesday 28th — grace runs to end of Tuesday.
    expect(classifyDay(civilDate("2026-07-27"), none, tuesdayMidday)).toBe("pending");
  });

  it("returns extra for a weekend day with an entry (FR-33)", () => {
    const facts: DayFacts = {
      hasEntry: true,
      firstEntryAt: new Date("2026-08-01T10:00:00Z"),
      hasAbsence: false,
    };
    const laterThatWeek = new Date("2026-08-05T06:00:00Z");
    expect(classifyDay(civilDate("2026-08-01"), facts, laterThatWeek)).toBe("extra");
  });

  it("returns none for a weekend day with no entry — never missed", () => {
    const laterThatWeek = new Date("2026-08-05T06:00:00Z");
    expect(classifyDay(civilDate("2026-08-01"), none, laterThatWeek)).toBe("none");
  });

  it("never returns late for a weekend, however long after the entry landed", () => {
    const facts: DayFacts = {
      hasEntry: true,
      firstEntryAt: new Date("2026-08-03T10:00:00Z"), // Monday, after Saturday ended
      hasAbsence: false,
    };
    const laterThatWeek = new Date("2026-08-05T06:00:00Z");
    expect(classifyDay(civilDate("2026-08-01"), facts, laterThatWeek)).toBe("extra");
  });

  it("ignores an absence record on a weekend", () => {
    const facts: DayFacts = { hasEntry: false, firstEntryAt: null, hasAbsence: true };
    const laterThatWeek = new Date("2026-08-05T06:00:00Z");
    expect(classifyDay(civilDate("2026-08-01"), facts, laterThatWeek)).toBe("none");
  });

  it("returns future for a weekend still ahead", () => {
    expect(classifyDay(civilDate("2026-08-01"), none, tuesdayMidday)).toBe("future");
  });
});
