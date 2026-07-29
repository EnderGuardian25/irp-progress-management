import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * A UX redirect, NOT the security boundary.
 *
 * Next.js middleware has had bypass CVEs, and layouts are cached across
 * navigations, so neither is a control. The boundary is apps/api: a global
 * fail-closed onRequest hook, jose validation against the JWKS, and 403 for a
 * valid token with no User row.
 *
 * Uses authConfig (edge-safe) rather than auth.ts, which pulls in Node-only
 * modules the Edge runtime cannot load.
 */
const { auth } = NextAuth(authConfig);

export { auth as middleware };

export const config = {
  // `api` is excluded wholesale, not just `api/auth`. Redirecting *any* API
  // route to an HTML sign-in page is wrong on principle: a machine caller
  // (fetch/curl/jose's JWKS client) cannot consume a sign-in page, and
  // apps/api is the actual security boundary for /api/* anyway — it runs its
  // own fail-closed auth check. A prior version excluded only `api/auth`,
  // which left `/api/dev-jwks` guarded: middleware redirected it to
  // /signin (307), createRemoteJWKSet's fetch (redirect: 'manual') threw on
  // the non-200 response, and every dev-minted token failed validation —
  // dev sign-in was broken end to end.
  matcher: ["/((?!api|signin|not-registered|_next/static|_next/image|favicon.ico).*)"],
};
