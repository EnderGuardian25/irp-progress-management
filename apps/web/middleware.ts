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
  matcher: ["/((?!api/auth|signin|not-registered|_next/static|_next/image|favicon.ico).*)"],
};
