import { describe, expect, it } from "vitest";
import { batchDayMark, studentDayMark, toBatchRibbonDays, toStudentRibbonDays } from "@/lib/ribbon";

const day = (over: Partial<Parameters<typeof batchDayMark>[0]> = {}) => ({
  enrolled: 10, submitted: 10, late: 0, absent: 0, missed: 0, pending: 0, ...over,
});

describe("studentDayMark", () => {
  it("maps each settled status onto its own mark", () => {
    expect(studentDayMark("onTime")).toBe("ok");
    expect(studentDayMark("late")).toBe("late");
    expect(studentDayMark("absent")).toBe("absent");
    expect(studentDayMark("missed")).toBe("missed");
  });

  it("draws pending as an outline, not a failure — the grace window is still open", () => {
    expect(studentDayMark("pending")).toBe("future");
  });

  it("draws future and none as outlines", () => {
    expect(studentDayMark("future")).toBe("future");
    expect(studentDayMark("none")).toBe("future");
  });

  it("never returns a mark for extra — weekend work is a slot, not a day bar (FR-33)", () => {
    // `extra` can only reach here through a caller that failed to filter
    // weekends out. An outline is the safe rendering: it claims nothing.
    expect(studentDayMark("extra")).toBe("future");
  });
});

describe("batchDayMark", () => {
  it("is ok only when everyone submitted and nobody was late", () => {
    expect(batchDayMark(day())).toEqual({ mark: "ok" });
  });

  it("ranks missed above late, late above absent, and absent above partial", () => {
    expect(batchDayMark(day({ submitted: 8, late: 1, absent: 1, missed: 1 })).mark).toBe("missed");
    expect(batchDayMark(day({ submitted: 9, late: 1, absent: 1 })).mark).toBe("late");
    expect(batchDayMark(day({ submitted: 9, absent: 1 })).mark).toBe("absent");
    expect(batchDayMark(day({ submitted: 6, pending: 4 })).mark).toBe("partial");
  });

  it("fills partial proportionally, and only partial", () => {
    expect(batchDayMark(day({ submitted: 6, pending: 4 }))).toEqual({ mark: "partial", fill: 0.6 });
    expect(batchDayMark(day({ submitted: 9, absent: 1 })).fill).toBeUndefined();
  });

  it("draws a day nobody has reached, and a day with nobody enrolled, as an outline", () => {
    expect(batchDayMark(day({ submitted: 0, pending: 0 }))).toEqual({ mark: "future" });
    expect(batchDayMark(day({ enrolled: 0, submitted: 0 }))).toEqual({ mark: "future" });
  });
});

describe("toStudentRibbonDays / toBatchRibbonDays", () => {
  it("rings today without replacing its real mark", () => {
    const days = toStudentRibbonDays(
      [{ date: "2026-08-03", status: "missed" }, { date: "2026-08-04", status: "onTime" }],
      "2026-08-03",
    );
    expect(days[0]).toEqual({ date: "2026-08-03", mark: "missed", isToday: true });
    expect(days[1]!.isToday).toBeUndefined();
  });

  it("carries fill through for a partial batch day and rings today there too", () => {
    const days = toBatchRibbonDays(
      [{ date: "2026-08-03", enrolled: 10, submitted: 5, late: 0, absent: 0, missed: 0, pending: 5 }],
      "2026-08-03",
    );
    expect(days[0]).toEqual({ date: "2026-08-03", mark: "partial", fill: 0.5, isToday: true });
  });

  it("leaves isToday off entirely when today falls outside the series — a weekend", () => {
    const days = toBatchRibbonDays(
      [{ date: "2026-07-31", enrolled: 1, submitted: 1, late: 0, absent: 0, missed: 0, pending: 0 }],
      "2026-08-01",
    );
    expect(days.every((d) => d.isToday === undefined)).toBe(true);
  });
});
