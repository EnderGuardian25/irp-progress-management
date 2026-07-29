import { describe, expect, it } from "vitest";
import { authConfig, jwtCallback, sessionCallback } from "@/auth.config";

// A token that carries BOTH secrets the session must never surface. If the
// session callback ever copies from the token, these tests go red.
const LOADED_TOKEN = {
  sub: "dev-admin-1",
  name: "Dev Mentor",
  email: "mentor@dev.local",
  accessToken: "eyJhbGciOiJSUzI1NiJ9.super-secret-bearer-token.sig",
  role: "ADMIN",
};

const BARE_SESSION = {
  user: { name: "Dev Mentor", email: "mentor@dev.local" },
  expires: "2026-08-01T00:00:00.000Z",
};

function invokeSession(token: Record<string, unknown>): unknown {
  // The callback's real signature carries more fields than we supply; the cast
  // narrows to what this invariant depends on.
  return (sessionCallback as (args: unknown) => unknown)({
    session: structuredClone(BARE_SESSION),
    token,
    user: undefined,
    newSession: undefined,
    trigger: "update",
  });
}

describe("the browser-visible session", () => {
  it("does not surface the access token even when the token carries one", () => {
    const serialised = JSON.stringify(invokeSession(LOADED_TOKEN));
    expect(serialised).not.toMatch(/accessToken/i);
    expect(serialised).not.toMatch(/\beyJ[A-Za-z0-9_-]{8,}/); // a JWT
    expect(serialised).not.toContain("super-secret-bearer-token");
  });

  it("does not surface a role — the User row is the only source of truth", () => {
    const serialised = JSON.stringify(invokeSession(LOADED_TOKEN));
    expect(serialised).not.toMatch(/role/i);
    expect(serialised).not.toContain("ADMIN");
  });

  it("still returns the user identity the app needs to render", () => {
    const result = invokeSession(LOADED_TOKEN) as typeof BARE_SESSION;
    expect(result.user.name).toBe("Dev Mentor");
    expect(result.user.email).toBe("mentor@dev.local");
  });
});

describe("the jwt callback", () => {
  it("stores a provider access token on the encrypted token", () => {
    const result = (jwtCallback as (args: unknown) => Record<string, unknown>)({
      token: { sub: "u1" },
      account: { access_token: "from-entra" },
      user: undefined,
    });
    expect(result.accessToken).toBe("from-entra");
  });

  it("stores the dev provider's minted token, which arrives on user not account", () => {
    const result = (jwtCallback as (args: unknown) => Record<string, unknown>)({
      token: { sub: "u1" },
      account: null,
      user: { devAccessToken: "from-dev-provider" },
    });
    expect(result.accessToken).toBe("from-dev-provider");
  });
});

describe("authConfig", () => {
  it("keeps the sign-in page pointed at our own route, not a provider URL", () => {
    expect(authConfig.pages?.signIn).toBe("/signin");
  });
});
