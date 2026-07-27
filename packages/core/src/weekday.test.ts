import { describe, expect, it } from "vitest";
import { civilDate } from "./civil-date.js";
import {
  isWeekday,
  nextWeekday,
  previousWeekday,
  workingDaysBetween,
} from "./weekday.js";

// 2026-07-27 is a Monday. 2026-08-01 is a Saturday, 2026-08-02 a Sunday.

describe("isWeekday", () => {
  it("is true for Monday", () => {
    expect(isWeekday(civilDate("2026-07-27"))).toBe(true);
  });

  it("is true for Friday", () => {
    expect(isWeekday(civilDate("2026-07-31"))).toBe(true);
  });

  it("is false for Saturday", () => {
    expect(isWeekday(civilDate("2026-08-01"))).toBe(false);
  });

  it("is false for Sunday", () => {
    expect(isWeekday(civilDate("2026-08-02"))).toBe(false);
  });
});

describe("previousWeekday", () => {
  it("returns Friday for a Monday", () => {
    expect(previousWeekday(civilDate("2026-08-03"))).toBe("2026-07-31");
  });

  it("returns the prior day mid-week", () => {
    expect(previousWeekday(civilDate("2026-07-29"))).toBe("2026-07-28");
  });

  it("returns Friday when called on a Saturday", () => {
    expect(previousWeekday(civilDate("2026-08-01"))).toBe("2026-07-31");
  });

  it("returns Friday when called on a Sunday", () => {
    expect(previousWeekday(civilDate("2026-08-02"))).toBe("2026-07-31");
  });

  it("crosses a month boundary", () => {
    expect(previousWeekday(civilDate("2026-09-01"))).toBe("2026-08-31");
  });
});

describe("nextWeekday", () => {
  it("returns Monday for a Friday", () => {
    expect(nextWeekday(civilDate("2026-07-31"))).toBe("2026-08-03");
  });

  it("returns Monday for a Saturday", () => {
    expect(nextWeekday(civilDate("2026-08-01"))).toBe("2026-08-03");
  });

  it("returns the next day mid-week", () => {
    expect(nextWeekday(civilDate("2026-07-28"))).toBe("2026-07-29");
  });
});

describe("workingDaysBetween", () => {
  it("excludes the weekend in a full calendar week", () => {
    const days = workingDaysBetween(civilDate("2026-07-27"), civilDate("2026-08-02"));
    expect(days).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
    ]);
  });

  it("includes both endpoints when they are weekdays", () => {
    expect(workingDaysBetween(civilDate("2026-07-28"), civilDate("2026-07-28"))).toEqual([
      "2026-07-28",
    ]);
  });

  it("returns empty for a weekend-only span", () => {
    expect(workingDaysBetween(civilDate("2026-08-01"), civilDate("2026-08-02"))).toEqual([]);
  });

  it("returns empty when end precedes start", () => {
    expect(workingDaysBetween(civilDate("2026-07-31"), civilDate("2026-07-27"))).toEqual([]);
  });

  it("never includes a weekend across a long span", () => {
    const days = workingDaysBetween(civilDate("2026-07-10"), civilDate("2026-08-09"));
    for (const day of days) {
      expect(isWeekday(day)).toBe(true);
    }
  });
});
