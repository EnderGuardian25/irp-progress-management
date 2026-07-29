// @vitest-environment node
//
// jose's WebCrypto path does `instanceof Uint8Array` against values produced
// in Node's realm; jsdom runs in its own VM realm where that check fails
// cross-realm ("plaintext must be an instance of Uint8Array"). Same fix as
// test/dev-identity.test.ts.
import { describe, expect, it } from "vitest";
import { encode } from "next-auth/jwt";
import { SESSION_COOKIE_NAMES, readAccessToken, resolveSessionToken } from "@/lib/api-client";

const SECRET = "test-secret-at-least-32-bytes-long-xx";
const [PREFIXED_NAME, BARE_NAME] = SESSION_COOKIE_NAMES;

async function makeCookie(payload: Record<string, unknown>, salt: string): Promise<string> {
  return encode({ token: payload, secret: SECRET, salt });
}

// A fake jar backed by a plain map — no need to mock next/headers's
// `cookies()` to exercise the lookup.
function jarWith(entries: Record<string, string>): { get(name: string): { value: string } | undefined } {
  return {
    get(name: string) {
      const value = entries[name];
      return value === undefined ? undefined : { value };
    },
  };
}

describe("readAccessToken", () => {
  it("recovers the access token from an encrypted session cookie", async () => {
    process.env.AUTH_SECRET = SECRET;
    const cookie = await makeCookie({ accessToken: "the-bearer-token", sub: "u1" }, BARE_NAME);
    await expect(readAccessToken(cookie, BARE_NAME)).resolves.toBe("the-bearer-token");
  });

  it("throws when there is no cookie at all", async () => {
    process.env.AUTH_SECRET = SECRET;
    await expect(readAccessToken(undefined, BARE_NAME)).rejects.toThrow(/no session/i);
  });

  it("throws when the cookie decrypts but carries no access token", async () => {
    process.env.AUTH_SECRET = SECRET;
    const cookie = await makeCookie({ sub: "u1" }, BARE_NAME);
    await expect(readAccessToken(cookie, BARE_NAME)).rejects.toThrow(/no access token/i);
  });

  it("throws rather than proceeding unauthenticated when the cookie is corrupt", async () => {
    process.env.AUTH_SECRET = SECRET;
    await expect(readAccessToken("not-a-jwe", BARE_NAME)).rejects.toThrow();
  });

  it("fails when the cookie was encrypted under a different name than it is read with", async () => {
    // Proves salt and cookie name genuinely have to agree: the HKDF salt is
    // the cookie name, so decrypting under the wrong name must not succeed.
    process.env.AUTH_SECRET = SECRET;
    const cookie = await makeCookie({ accessToken: "the-bearer-token", sub: "u1" }, BARE_NAME);
    await expect(readAccessToken(cookie, PREFIXED_NAME)).rejects.toThrow();
  });
});

describe("resolveSessionToken", () => {
  it("uses the prefixed cookie when only it is present", async () => {
    process.env.AUTH_SECRET = SECRET;
    const cookie = await makeCookie({ accessToken: "prefixed-token" }, PREFIXED_NAME);
    const jar = jarWith({ [PREFIXED_NAME]: cookie });
    await expect(resolveSessionToken(jar)).resolves.toBe("prefixed-token");
  });

  it("uses the bare cookie when only it is present", async () => {
    process.env.AUTH_SECRET = SECRET;
    const cookie = await makeCookie({ accessToken: "bare-token" }, BARE_NAME);
    const jar = jarWith({ [BARE_NAME]: cookie });
    await expect(resolveSessionToken(jar)).resolves.toBe("bare-token");
  });

  it("prefers the prefixed cookie when both are present", async () => {
    process.env.AUTH_SECRET = SECRET;
    const prefixedCookie = await makeCookie({ accessToken: "prefixed-token" }, PREFIXED_NAME);
    const bareCookie = await makeCookie({ accessToken: "bare-token" }, BARE_NAME);
    const jar = jarWith({ [PREFIXED_NAME]: prefixedCookie, [BARE_NAME]: bareCookie });
    await expect(resolveSessionToken(jar)).resolves.toBe("prefixed-token");
  });

  it("throws when neither cookie is present", async () => {
    process.env.AUTH_SECRET = SECRET;
    const jar = jarWith({});
    await expect(resolveSessionToken(jar)).rejects.toThrow(/no session/i);
  });
});
