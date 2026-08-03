import { describe, expect, it } from "vitest";
import { civilDate } from "./civil-date.js";
import {
  cycleContaining,
  cycleFor,
  cycleWorkingDays,
  firstEvaluatedCycleStart,
  PROGRAMME_MONTHS,
  shiftCycle,
} from "./cycle.js";
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

describe("firstEvaluatedCycleStart", () => {
  it("uses the same cycle when admitted exactly on the 10th", () => {
    expect(firstEvaluatedCycleStart(civilDate("2026-08-10"))).toBe("2026-08-10");
  });

  it("skips to the next cycle when admitted mid-cycle (FR-27)", () => {
    expect(firstEvaluatedCycleStart(civilDate("2026-08-22"))).toBe("2026-09-10");
  });

  it("skips to the next cycle when admitted on the 9th", () => {
    expect(firstEvaluatedCycleStart(civilDate("2026-09-09"))).toBe("2026-09-10");
  });

  it("handles admission before the 10th in January", () => {
    expect(firstEvaluatedCycleStart(civilDate("2026-01-05"))).toBe("2026-01-10");
  });
});

describe("cycleFor", () => {
  const admission = civilDate("2026-08-22");

  it("returns null for a date inside the skipped partial cycle", () => {
    expect(cycleFor(civilDate("2026-08-25"), admission)).toBeNull();
  });

  it("returns index 1 for the first evaluated cycle", () => {
    expect(cycleFor(civilDate("2026-09-15"), admission)).toEqual({
      start: "2026-09-10",
      end: "2026-10-09",
      index: 1,
    });
  });

  it("returns index 2 for the second evaluated cycle", () => {
    expect(cycleFor(civilDate("2026-10-15"), admission)).toEqual({
      start: "2026-10-10",
      end: "2026-11-09",
      index: 2,
    });
  });

  it("returns index 6 for the final programme cycle", () => {
    expect(cycleFor(civilDate("2027-02-15"), admission)?.index).toBe(6);
  });

  it("counts from the admission cycle when admitted exactly on the 10th", () => {
    expect(cycleFor(civilDate("2026-08-15"), civilDate("2026-08-10"))?.index).toBe(1);
  });

  it("returns null for a date before admission entirely", () => {
    expect(cycleFor(civilDate("2026-07-01"), admission)).toBeNull();
  });
});

describe("PROGRAMME_MONTHS", () => {
  it("is the six-cycle programme length FR-29 reports against", () => {
    expect(PROGRAMME_MONTHS).toBe(6);
  });
});
