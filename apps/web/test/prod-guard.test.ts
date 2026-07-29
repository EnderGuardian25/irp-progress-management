import { describe, expect, it } from "vitest";
import { assertBypassNotInProduction } from "@/auth.config";

describe("assertBypassNotInProduction", () => {
  it("throws when the bypass is enabled in a production build", () => {
    expect(() =>
      assertBypassNotInProduction({ NODE_ENV: "production", AUTH_DEV_BYPASS: "true" }),
    ).toThrow(/AUTH_DEV_BYPASS/);
  });

  it("names the variable and refuses to start, so the failure is unmistakable", () => {
    expect(() =>
      assertBypassNotInProduction({ NODE_ENV: "production", AUTH_DEV_BYPASS: "true" }),
    ).toThrow(/Refusing to start/);
  });

  it("permits the bypass outside production", () => {
    for (const NODE_ENV of ["development", "test"] as const) {
      expect(() =>
        assertBypassNotInProduction({ NODE_ENV, AUTH_DEV_BYPASS: "true" }),
      ).not.toThrow();
    }
  });

  it("permits production when the bypass is unset or not exactly 'true'", () => {
    for (const AUTH_DEV_BYPASS of [undefined, "", "false", "1", "TRUE", "yes"]) {
      expect(() =>
        assertBypassNotInProduction({ NODE_ENV: "production", AUTH_DEV_BYPASS }),
      ).not.toThrow();
    }
  });
});
