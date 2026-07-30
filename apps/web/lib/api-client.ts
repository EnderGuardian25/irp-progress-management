import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decode } from "next-auth/jwt";
import { createClient, createConfig, type Client } from "@irp/client/client";
import { getCurrentUser } from "@irp/client";

/**
 * Both names Auth.js may write. The __Secure- prefix is only ever set over
 * https, so if the prefixed cookie exists it is authoritative — check it first.
 *
 * We deliberately do NOT derive the name from an env var. Auth.js resolves
 * AUTH_URL ?? NEXTAUTH_URL and falls back to `x-forwarded-proto` and then to
 * "https" (@auth/core/lib/utils/env.js). Any local re-derivation is a guess
 * that can disagree with what Auth.js actually wrote, and a disagreement means
 * every signed-in user gets a 500. Reading the jar removes the guess.
 */
export const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
] as const;

export type SessionCookieName = (typeof SESSION_COOKIE_NAMES)[number];

const NO_SESSION_COOKIE_MESSAGE = "No session cookie — the caller is not signed in.";

interface CookieJar {
  get(name: string): { value: string } | undefined;
}

/**
 * Finds whichever of Auth.js's two possible session cookies is actually
 * present, checking the __Secure- prefixed name first. Auth.js writes exactly
 * one of the two per request depending on the resolved protocol, so this is
 * the lookup, not a guess about which one it picked.
 */
function findSessionCookie(
  jar: CookieJar,
): { name: SessionCookieName; value: string } | undefined {
  for (const name of SESSION_COOKIE_NAMES) {
    const cookie = jar.get(name);
    if (cookie !== undefined) return { name, value: cookie.value };
  }
  return undefined;
}

/**
 * Reads the access token out of the ENCRYPTED, HTTP-ONLY session cookie.
 *
 * Deliberately NOT from the Auth.js session object: that object is what the
 * browser's GET /api/auth/session returns, so putting a bearer token in it
 * would defeat the whole design. See spec §4.1.
 *
 * Throws rather than returning undefined. A caller that silently proceeded
 * without a token would call the API unauthenticated and get a confusing 401.
 *
 * The cookie name IS the HKDF salt in Auth.js v5, so `salt` must be the name
 * the value was actually read from — never a separately-derived constant.
 */
export async function readAccessToken(
  cookieValue: string | undefined,
  salt: string,
): Promise<string> {
  if (cookieValue === undefined || cookieValue === "") {
    throw new Error(NO_SESSION_COOKIE_MESSAGE);
  }

  const secret = process.env.AUTH_SECRET;
  if (secret === undefined || secret === "") {
    throw new Error("AUTH_SECRET is not set — the session cookie cannot be decrypted.");
  }

  const payload = await decode({
    token: cookieValue,
    secret,
    salt,
  });

  const accessToken = payload?.accessToken;
  if (typeof accessToken !== "string" || accessToken === "") {
    throw new Error("The session carries no access token.");
  }
  return accessToken;
}

/**
 * Resolves the caller's access token by checking the cookie jar for whichever
 * of Auth.js's two possible session-cookie names is actually present, then
 * decrypting with that same name as the salt. Exported so the prefixed/bare
 * lookup and the salt-agreement invariant are directly testable against a
 * fake jar, without mocking next/headers's `cookies()`.
 */
export async function resolveSessionToken(jar: CookieJar): Promise<string> {
  const found = findSessionCookie(jar);
  if (found === undefined) {
    throw new Error(NO_SESSION_COOKIE_MESSAGE);
  }
  return readAccessToken(found.value, found.name);
}

/**
 * A FRESH client per request. The generated @irp/client exports a module-level
 * singleton; attaching a per-user token to it would leak tokens across
 * concurrent requests in a Next.js server process. Building a new one makes
 * that impossible by construction rather than by care.
 */
export async function apiClient(): Promise<Client> {
  const jar = await cookies();
  const token = await resolveSessionToken(jar);

  const baseUrl = process.env.API_BASE_URL;
  if (baseUrl === undefined || baseUrl === "") {
    throw new Error("API_BASE_URL is not set.");
  }

  return createClient(
    createConfig({ baseUrl, headers: { Authorization: `Bearer ${token}` } }),
  );
}

export interface WebUser {
  id: string;
  email: string;
  displayName: string;
  role: "Admin" | "Student";
}

/**
 * Four distinct states, not two. Routing a 403 to /signin loops forever: the
 * session is valid, so proxy.ts sends the user straight back. See spec §8.
 */
export async function getCurrentUserOrRedirect(): Promise<WebUser> {
  const client = await apiClient();
  const { data, error, response } = await getCurrentUser({ client });

  if (data !== undefined) return data;

  if (response.status === 403) redirect("/not-registered");
  if (response.status === 401) redirect("/signin?reason=expired");

  throw new Error(
    `GET /api/v1/me failed with ${String(response.status)}: ${JSON.stringify(error)}`,
  );
}
