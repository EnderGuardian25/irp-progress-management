import { describe, expect, it, vi } from "vitest";
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

  // The AUTH_DEV_BYPASS comparison is exact (above); the NODE_ENV comparison
  // must be the opposite — case-insensitive — so the guard fires MORE often,
  // not less. A container setting NODE_ENV to "Production" must still trip
  // it; an exact-match check here would let a live bypass through.
  it("throws when NODE_ENV is 'Production' (mixed case)", () => {
    expect(() =>
      assertBypassNotInProduction({ NODE_ENV: "Production", AUTH_DEV_BYPASS: "true" }),
    ).toThrow(/AUTH_DEV_BYPASS/);
  });

  it("throws when NODE_ENV is 'PRODUCTION' (upper case)", () => {
    expect(() =>
      assertBypassNotInProduction({ NODE_ENV: "PRODUCTION", AUTH_DEV_BYPASS: "true" }),
    ).toThrow(/AUTH_DEV_BYPASS/);
  });

  // proxy.ts imports auth.config.ts directly, never through auth.ts. The
  // guard must therefore also run as a module-scope side effect of importing
  // auth.config.ts itself, not only when a caller explicitly invokes the
  // exported function — otherwise a request path that only loads proxy.ts
  // (e.g. a health check) would boot clean with a live bypass in production.
  it("throws merely by importing auth.config.ts when the bypass is set in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEV_BYPASS", "true");

    try {
      await expect(import("@/auth.config")).rejects.toThrow(/AUTH_DEV_BYPASS/);
    } finally {
      // vi.unstubAllEnvs() restores every stubbed var to its pre-stub value,
      // captured automatically by vitest at stub time.
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
