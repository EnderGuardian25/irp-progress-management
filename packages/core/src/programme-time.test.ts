import { describe, expect, it } from "vitest";
import { civilDate } from "./civil-date.js";
import { endOfProgrammeDay, toProgrammeDate } from "./programme-time.js";

describe("toProgrammeDate", () => {
  it("maps a mid-day UTC instant to the same Colombo date", () => {
    expect(toProgrammeDate(new Date("2026-07-28T06:00:00Z"))).toBe("2026-07-28");
  });

  it("maps late UTC evening to the NEXT Colombo date", () => {
    // 20:00 UTC is 01:30 the following day in Colombo (+05:30).
    expect(toProgrammeDate(new Date("2026-07-28T20:00:00Z"))).toBe("2026-07-29");
  });

  it("maps just before Colombo midnight to the earlier date", () => {
    // 18:29 UTC is 23:59 the same day in Colombo.
    expect(toProgrammeDate(new Date("2026-07-28T18:29:00Z"))).toBe("2026-07-28");
  });

  it("maps exactly Colombo midnight to the new date", () => {
    // 18:30 UTC is 00:00 the following day in Colombo.
    expect(toProgrammeDate(new Date("2026-07-28T18:30:00Z"))).toBe("2026-07-29");
  });
});

describe("endOfProgrammeDay", () => {
  it("returns the UTC instant for 23:59:59.999 Colombo", () => {
    // 23:59:59.999 on 2026-07-28 in Colombo is 18:29:59.999Z the same day.
    expect(endOfProgrammeDay(civilDate("2026-07-28")).toISOString()).toBe(
      "2026-07-28T18:29:59.999Z",
    );
  });

  it("round-trips: the instant it returns still belongs to that date", () => {
    const date = civilDate("2026-07-28");
    expect(toProgrammeDate(endOfProgrammeDay(date))).toBe(date);
  });

  it("round-trips one millisecond later into the next date", () => {
    const end = endOfProgrammeDay(civilDate("2026-07-28"));
    expect(toProgrammeDate(new Date(end.getTime() + 1))).toBe("2026-07-29");
  });

  // civilDate() accepts years 0-99, so the deadline arithmetic must handle
  // them too. Date.UTC remaps 0-99 to 1900-1999, which would land this on
  // 1999-01-01. The round-trip is the real invariant and exercises both
  // timezone-aware functions at once.
  it("stays in the first century instead of remapping to 1900-1999", () => {
    const date = civilDate("0099-01-01");
    expect(toProgrammeDate(endOfProgrammeDay(date))).toBe(date);
  });
});
