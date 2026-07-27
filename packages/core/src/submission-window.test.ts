import { describe, expect, it } from "vitest";
import { civilDate } from "./civil-date.js";
import {
  canSubmitFor,
  graceDeadlineFor,
  submissionWindow,
} from "./submission-window.js";

// Colombo is UTC+05:30. 2026-07-28 is a Tuesday, 2026-07-31 a Friday,
// 2026-08-01 a Saturday, 2026-08-03 a Monday.
const tuesdayMorning = new Date("2026-07-28T04:00:00Z"); // 09:30 Tue in Colombo
const saturdayMorning = new Date("2026-08-01T04:00:00Z"); // 09:30 Sat in Colombo
const mondayMorning = new Date("2026-08-03T04:00:00Z"); // 09:30 Mon in Colombo

describe("submissionWindow", () => {
  it("allows today and the previous weekday on a mid-week day", () => {
    expect(submissionWindow(tuesdayMorning).targetDates).toEqual([
      "2026-07-28",
      "2026-07-27",
    ]);
  });

  it("allows Saturday itself plus the prior Friday, since weekends are optional work", () => {
    expect(submissionWindow(saturdayMorning).targetDates).toEqual([
      "2026-08-01",
      "2026-07-31",
    ]);
  });

  it("on Monday still allows the whole weekend and the prior Friday", () => {
    // Friday, Saturday and Sunday all have Monday as their next weekday,
    // so all three remain inside grace until Monday night.
    expect(submissionWindow(mondayMorning).targetDates).toEqual([
      "2026-08-03",
      "2026-08-02",
      "2026-08-01",
      "2026-07-31",
    ]);
  });

  it("drops the weekend again once Monday has passed", () => {
    const tuesdayAfter = new Date("2026-08-04T04:00:00Z");
    expect(submissionWindow(tuesdayAfter).targetDates).toEqual([
      "2026-08-04",
      "2026-08-03",
    ]);
  });

  it("closes grace at end of the current Colombo day mid-week", () => {
    expect(submissionWindow(tuesdayMorning).graceClosesAt.toISOString()).toBe(
      "2026-07-28T18:29:59.999Z",
    );
  });
});

describe("graceDeadlineFor", () => {
  it("gives a mid-week target until the end of the next day", () => {
    expect(graceDeadlineFor(civilDate("2026-07-28")).toISOString()).toBe(
      "2026-07-29T18:29:59.999Z",
    );
  });

  it("gives a Friday target until the end of the following Monday", () => {
    expect(graceDeadlineFor(civilDate("2026-07-31")).toISOString()).toBe(
      "2026-08-03T18:29:59.999Z",
    );
  });
});

describe("canSubmitFor", () => {
  it("allows the current weekday", () => {
    expect(canSubmitFor(civilDate("2026-07-28"), tuesdayMorning)).toBe(true);
  });

  it("allows the previous weekday inside grace", () => {
    expect(canSubmitFor(civilDate("2026-07-27"), tuesdayMorning)).toBe(true);
  });

  it("rejects a day whose grace has closed", () => {
    expect(canSubmitFor(civilDate("2026-07-24"), tuesdayMorning)).toBe(false);
  });

  it("rejects a future date", () => {
    expect(canSubmitFor(civilDate("2026-07-29"), tuesdayMorning)).toBe(false);
  });

  it("accepts a weekend target as optional Extra work (FR-33)", () => {
    expect(canSubmitFor(civilDate("2026-08-01"), mondayMorning)).toBe(true);
  });

  it("accepts submitting for Saturday while it is still Saturday", () => {
    expect(canSubmitFor(civilDate("2026-08-01"), saturdayMorning)).toBe(true);
  });

  it("rejects a weekend target once its grace has closed", () => {
    const tuesdayAfter = new Date("2026-08-04T04:00:00Z");
    expect(canSubmitFor(civilDate("2026-08-01"), tuesdayAfter)).toBe(false);
  });

  it("still allows Friday on the following Monday (ASSUMPTION O-10)", () => {
    expect(canSubmitFor(civilDate("2026-07-31"), mondayMorning)).toBe(true);
  });

  it("rejects Friday once Monday has ended", () => {
    const tuesdayAfter = new Date("2026-08-04T04:00:00Z");
    expect(canSubmitFor(civilDate("2026-07-31"), tuesdayAfter)).toBe(false);
  });

  // Boundary is inclusive to the last millisecond of the Colombo day.
  it("accepts at the exact final millisecond of grace", () => {
    const lastInstant = new Date("2026-07-29T18:29:59.999Z");
    expect(canSubmitFor(civilDate("2026-07-28"), lastInstant)).toBe(true);
  });

  it("rejects one millisecond after grace closes", () => {
    const justAfter = new Date("2026-07-29T18:30:00.000Z");
    expect(canSubmitFor(civilDate("2026-07-28"), justAfter)).toBe(false);
  });
});
