// @vitest-environment node
//
// jose's WebCrypto path does `instanceof Uint8Array` against values produced
// in Node's realm; jsdom runs in its own VM realm where that check fails
// cross-realm ("plaintext must be an instance of Uint8Array"). Same fix as
// test/dev-identity.test.ts.
import { describe, expect, it } from "vitest";
import { encode } from "next-auth/jwt";
import { SESSION_COOKIE_NAME, deriveSessionCookieName, readAccessToken } from "@/lib/api-client";

const SECRET = "test-secret-at-least-32-bytes-long-xx";

async function makeCookie(payload: Record<string, unknown>): Promise<string> {
  return encode({ token: payload, secret: SECRET, salt: SESSION_COOKIE_NAME });
}

describe("readAccessToken", () => {
  it("recovers the access token from an encrypted session cookie", async () => {
    process.env.AUTH_SECRET = SECRET;
    const cookie = await makeCookie({ accessToken: "the-bearer-token", sub: "u1" });
    await expect(readAccessToken(cookie)).resolves.toBe("the-bearer-token");
  });

  it("throws when there is no cookie at all", async () => {
    process.env.AUTH_SECRET = SECRET;
    await expect(readAccessToken(undefined)).rejects.toThrow(/no session/i);
  });

  it("throws when the cookie decrypts but carries no access token", async () => {
    process.env.AUTH_SECRET = SECRET;
    const cookie = await makeCookie({ sub: "u1" });
    await expect(readAccessToken(cookie)).rejects.toThrow(/no access token/i);
  });

  it("throws rather than proceeding unauthenticated when the cookie is corrupt", async () => {
    process.env.AUTH_SECRET = SECRET;
    await expect(readAccessToken("not-a-jwe")).rejects.toThrow();
  });
});

describe("deriveSessionCookieName", () => {
  // Vitest runs with NODE_ENV=test, so the readAccessToken tests above only
  // ever exercise the bare-name branch. These pin the prefix derivation
  // directly against the URL protocol, independent of NODE_ENV.

  it("uses the __Secure- prefix for an https AUTH_URL", () => {
    expect(deriveSessionCookieName("https://irp.example.com")).toBe(
      "__Secure-authjs.session-token",
    );
  });

  it("uses the bare name for an http AUTH_URL", () => {
    expect(deriveSessionCookieName("http://localhost:3000")).toBe("authjs.session-token");
  });

  it("fails safe to the bare name when AUTH_URL is unset", () => {
    expect(deriveSessionCookieName(undefined)).toBe("authjs.session-token");
  });

  // A naive `startsWith("https")` without the colon would wrongly treat
  // "httpsomething://" as secure. These prove the check is on the `https:`
  // scheme, not a loose prefix match.
  it("does not treat a bare 'https' string as secure", () => {
    expect(deriveSessionCookieName("https")).toBe("authjs.session-token");
  });

  it("does not treat a non-https protocol that merely starts with 'https' as secure", () => {
    expect(deriveSessionCookieName("httpsomething://x")).toBe("authjs.session-token");
  });
});
