import { describe, expect, it } from "vitest";
import { civilDate } from "./civil-date.js";
import { cycleContaining, cycleWorkingDays, shiftCycle } from "./cycle.js";
import { isWeekday } from "./weekday.js";

describe("cycleContaining", () => {
  it("puts the 10th at the start of its own cycle", () => {
    expect(cycleContaining(civilDate("2026-08-10"))).toEqual({
      start: "2026-08-10",
      end: "2026-09-09",
    });
  });

  it("puts the 9th at the end of the previous cycle", () => {
    expect(cycleContaining(civilDate("2026-09-09"))).toEqual({
      start: "2026-08-10",
      end: "2026-09-09",
    });
  });

  it("places a mid-cycle date correctly", () => {
    expect(cycleContaining(civilDate("2026-08-25"))).toEqual({
      start: "2026-08-10",
      end: "2026-09-09",
    });
  });

  it("handles a date before the 10th in January", () => {
    expect(cycleContaining(civilDate("2026-01-05"))).toEqual({
      start: "2025-12-10",
      end: "2026-01-09",
    });
  });

  it("handles a short February", () => {
    expect(cycleContaining(civilDate("2026-02-20"))).toEqual({
      start: "2026-02-10",
      end: "2026-03-09",
    });
  });

  it("handles the December to January rollover", () => {
    expect(cycleContaining(civilDate("2026-12-15"))).toEqual({
      start: "2026-12-10",
      end: "2027-01-09",
    });
  });
});

describe("shiftCycle", () => {
  it("advances one cycle", () => {
    expect(shiftCycle(civilDate("2026-08-10"), 1)).toBe("2026-09-10");
  });

  it("advances across a year boundary", () => {
    expect(shiftCycle(civilDate("2026-12-10"), 1)).toBe("2027-01-10");
  });

  it("advances six cycles, the full programme length", () => {
    expect(shiftCycle(civilDate("2026-08-10"), 6)).toBe("2027-02-10");
  });

  it("goes backwards", () => {
    expect(shiftCycle(civilDate("2026-01-10"), -1)).toBe("2025-12-10");
  });
});

describe("cycleWorkingDays", () => {
  it("contains only weekdays", () => {
    const days = cycleWorkingDays({
      start: civilDate("2026-08-10"),
      end: civilDate("2026-09-09"),
    });
    for (const day of days) {
      expect(isWeekday(day)).toBe(true);
    }
  });

  it("starts on or after the cycle start and ends on or before the cycle end", () => {
    const days = cycleWorkingDays({
      start: civilDate("2026-08-10"),
      end: civilDate("2026-09-09"),
    });
    expect(days.at(0)).toBe("2026-08-10");
    expect(days.at(-1)).toBe("2026-09-09");
  });

  it("returns between 20 and 24 working days for a typical cycle", () => {
    const days = cycleWorkingDays({
      start: civilDate("2026-08-10"),
      end: civilDate("2026-09-09"),
    });
    expect(days.length).toBeGreaterThanOrEqual(20);
    expect(days.length).toBeLessThanOrEqual(24);
  });
});
