import { describe, it, expect } from "vitest";
import { civilDate } from "@irp/core";
import { colomboInstant, fromDbDate, toDbDate } from "../src/db/civil-date-map.js";

describe("civil-date-map", () => {
  it("round-trips a CivilDate through the DATE representation", () => {
    const d = civilDate("2026-08-02");
    expect(fromDbDate(toDbDate(d))).toBe(d);
  });

  it("toDbDate is UTC midnight — Prisma's DATE convention", () => {
    expect(toDbDate(civilDate("2026-08-02")).toISOString()).toBe("2026-08-02T00:00:00.000Z");
  });

  it("fromDbDate never shifts a day regardless of local timezone", () => {
    // Prisma returns DATE columns as UTC midnight. Reading via UTC parts is
    // what makes this correct on any machine; .getDate() would be wrong west
    // of Greenwich.
    expect(fromDbDate(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
  });

  it("colomboInstant builds the UTC instant for a Colombo wall-clock time", () => {
    // 17:30 in Colombo (UTC+05:30) is 12:00Z.
    expect(colomboInstant(civilDate("2026-08-03"), "17:30").toISOString())
      .toBe("2026-08-03T12:00:00.000Z");
    // 03:00 Colombo is the previous UTC day — the offset must be subtracted,
    // not clamped.
    expect(colomboInstant(civilDate("2026-08-03"), "03:00").toISOString())
      .toBe("2026-08-02T21:30:00.000Z");
  });

  it("colomboInstant handles both edges of the Colombo day", () => {
    // Colombo midnight is 18:30Z the previous day.
    expect(colomboInstant(civilDate("2026-08-03"), "00:00").toISOString())
      .toBe("2026-08-02T18:30:00.000Z");
    // 23:59 Colombo is the last accepted minute; still 18:29Z same rule.
    expect(colomboInstant(civilDate("2026-08-03"), "23:59").toISOString())
      .toBe("2026-08-03T18:29:00.000Z");
  });

  it("colomboInstant rejects anything that is not strict HH:MM", () => {
    const bad = ["24:00", "12:60", "9:30", "09:5", "0930", "", "09:30:00", "aa:bb"];
    for (const time of bad) {
      expect(() => colomboInstant(civilDate("2026-08-03"), time)).toThrow(
        `colomboInstant: bad time "${time}" — expected HH:MM`,
      );
    }
  });
});
