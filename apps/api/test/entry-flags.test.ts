import { describe, it, expect } from "vitest";
import { civilDate } from "@irp/core";
import { decideEntryFlags } from "../src/domain/entry-flags.js";
import { SubmissionWindowClosedError } from "../src/domain/errors.js";

// 2026-08-03 is a Monday; 2026-08-01 a Saturday. Times below are UTC:
// Colombo midnight is 18:30Z the previous day.

describe("decideEntryFlags", () => {
  it("same-day weekday submission is on time", () => {
    // Monday 17:00 Colombo = 11:30Z
    expect(decideEntryFlags(civilDate("2026-08-03"), new Date("2026-08-03T11:30:00Z")))
      .toEqual({ isLate: false, isExtra: false });
  });

  it("next-weekday submission inside grace is late", () => {
    // For Monday's date, Tuesday 09:40 Colombo = Tuesday 04:10Z
    expect(decideEntryFlags(civilDate("2026-08-03"), new Date("2026-08-04T04:10:00Z")))
      .toEqual({ isLate: true, isExtra: false });
  });

  it("weekend submission is extra, never late", () => {
    // Saturday entry submitted Sunday is inside Saturday's grace (next
    // weekday is Monday) and still extra/not-late.
    expect(decideEntryFlags(civilDate("2026-08-01"), new Date("2026-08-02T10:00:00Z")))
      .toEqual({ isLate: false, isExtra: true });
  });

  it("a closed window throws, evaluated at the submission instant", () => {
    // Monday's grace closes Tuesday 23:59:59 Colombo; Thursday is far out.
    expect(() => decideEntryFlags(civilDate("2026-08-03"), new Date("2026-08-06T04:00:00Z")))
      .toThrow(SubmissionWindowClosedError);
  });

  it("a future-dated target throws", () => {
    expect(() => decideEntryFlags(civilDate("2026-08-04"), new Date("2026-08-03T11:30:00Z")))
      .toThrow(SubmissionWindowClosedError);
  });

  // Boundary instants. Monday 2026-08-03 ends at 18:29:59.999Z (23:59:59.999
  // Colombo); its grace closes at the same wall-clock instant on Tuesday.
  it("the last millisecond of the target day is on time; the next is late", () => {
    expect(decideEntryFlags(civilDate("2026-08-03"), new Date("2026-08-03T18:29:59.999Z")))
      .toEqual({ isLate: false, isExtra: false });
    expect(decideEntryFlags(civilDate("2026-08-03"), new Date("2026-08-03T18:30:00.000Z")))
      .toEqual({ isLate: true, isExtra: false });
  });

  it("the exact grace-deadline instant is accepted (late); one ms later throws", () => {
    expect(decideEntryFlags(civilDate("2026-08-03"), new Date("2026-08-04T18:29:59.999Z")))
      .toEqual({ isLate: true, isExtra: false });
    expect(() => decideEntryFlags(civilDate("2026-08-03"), new Date("2026-08-04T18:30:00.000Z")))
      .toThrow(SubmissionWindowClosedError);
  });
});
