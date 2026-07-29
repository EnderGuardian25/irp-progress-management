import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decode } from "next-auth/jwt";
import { createClient, createConfig, type Client } from "@irp/client/client";
import { getCurrentUser } from "@irp/client";

/**
 * In Auth.js v5 the session cookie's name IS the encryption salt.
 * The __Secure- prefix applies when cookies are marked secure, i.e. production.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

/**
 * Reads the access token out of the ENCRYPTED, HTTP-ONLY session cookie.
 *
 * Deliberately NOT from the Auth.js session object: that object is what the
 * browser's GET /api/auth/session returns, so putting a bearer token in it
 * would defeat the whole design. See spec §4.1.
 *
 * Throws rather than returning undefined. A caller that silently proceeded
 * without a token would call the API unauthenticated and get a confusing 401.
 */
export async function readAccessToken(cookieValue: string | undefined): Promise<string> {
  if (cookieValue === undefined || cookieValue === "") {
    throw new Error("No session cookie — the caller is not signed in.");
  }

  const secret = process.env.AUTH_SECRET;
  if (secret === undefined || secret === "") {
    throw new Error("AUTH_SECRET is not set — the session cookie cannot be decrypted.");
  }

  const payload = await decode({
    token: cookieValue,
    secret,
    salt: SESSION_COOKIE_NAME,
  });

  const accessToken = payload?.accessToken;
  if (typeof accessToken !== "string" || accessToken === "") {
    throw new Error("The session carries no access token.");
  }
  return accessToken;
}

/**
 * A FRESH client per request. The generated @irp/client exports a module-level
 * singleton; attaching a per-user token to it would leak tokens across
 * concurrent requests in a Next.js server process. Building a new one makes
 * that impossible by construction rather than by care.
 */
export async function apiClient(): Promise<Client> {
  const jar = await cookies();
  const token = await readAccessToken(jar.get(SESSION_COOKIE_NAME)?.value);

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
 * session is valid, so middleware sends the user straight back. See spec §8.
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
