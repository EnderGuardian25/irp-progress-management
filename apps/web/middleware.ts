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
  // `_next` is likewise excluded WHOLESALE rather than just `_next/static` and
  // `_next/image`: nothing under /_next is ever a route a human signs in to, so
  // enumerating subpaths only invites missing one (the dev HMR socket lives at
  // /_next/webpack-hmr, for instance).
  //
  // Honesty note for future readers: this was changed while chasing a
  // hydration failure that broke the Playwright suite, and it was NOT the
  // cause. The real cause was driving the browser at 127.0.0.1 — Next
  // canonicalises loopback hostnames to `localhost`, so its dev server treated
  // /_next/* requests as cross-origin and 403'd them. Fixed in
  // playwright.config.ts, which documents it. This exclusion is kept because
  // it is more correct, not because it fixed anything.
  matcher: ["/((?!api|signin|not-registered|_next|favicon.ico).*)"],
};
