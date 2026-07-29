import { describe, expect, it } from "vitest";
import { isEntraConfigured } from "@/auth.config";

// Registering MicrosoftEntraId with an empty `issuer` makes Auth.js throw
// InvalidEndpoints on EVERY auth request, including requests targeting a
// different provider — so an unconfigured Entra provider takes the whole auth
// handler down, dev bypass included. That is how CI failed on the first run
// after Plan 3 merged. It passed locally only because .env.example shipped a
// NON-EMPTY placeholder issuer, which satisfied the old unconditional
// registration with a bogus value.
describe("isEntraConfigured", () => {
  const complete = {
    AUTH_MICROSOFT_ENTRA_ID_ID: "client-id",
    AUTH_MICROSOFT_ENTRA_ID_SECRET: "client-secret",
    AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/tenant/v2.0",
  };

  it("is true only when all three variables are present and non-empty", () => {
    expect(isEntraConfigured(complete)).toBe(true);
  });

  it("is false when nothing is set — the CI and fresh-clone case", () => {
    expect(isEntraConfigured({})).toBe(false);
  });

  it("is false when any single variable is missing", () => {
    for (const key of Object.keys(complete)) {
      const partial = { ...complete };
      delete partial[key as keyof typeof complete];
      expect(isEntraConfigured(partial), `missing ${key}`).toBe(false);
    }
  });

  it("treats an EMPTY STRING as unconfigured, not as configured", () => {
    // The distinction that matters: `?? ""` fallbacks made an unset variable
    // look like a configured-but-empty one, which is what broke CI.
    for (const key of Object.keys(complete)) {
      expect(isEntraConfigured({ ...complete, [key]: "" }), `empty ${key}`).toBe(false);
    }
  });

  it("does not treat a whitespace-only value as configured", () => {
    expect(isEntraConfigured({ ...complete, AUTH_MICROSOFT_ENTRA_ID_ISSUER: "   " })).toBe(false);
  });
});
