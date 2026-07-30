import { NextResponse } from "next/server";
import { assertBypassNotInProduction } from "@/auth.config";

/**
 * Publishes the dev public key so apps/api can validate dev-minted tokens
 * through createRemoteJWKSet — the same code path production uses.
 *
 * Returns 404 when the bypass is off, so this endpoint does not exist in a
 * normal build.
 *
 * This is the THIRD of FOUR entry points into the bypass. The others are
 * auth.ts and proxy.ts (both covered by auth.config.ts's own module-scope
 * call) and instrumentation.ts, which makes its own explicit call because a
 * containerised `next start` loads route modules lazily and so reaches none
 * of the other three at boot. See CLAUDE.md for the full list.
 *
 * This route goes through none of them: it imports lib/dev-identity directly
 * and never pulls auth.config.ts in any other way, so nothing there was
 * covering it. A Plan 3 whole-branch review proved that gap: with the bypass
 * flag on in a production build, `next start` correctly 500s on `/` and
 * `/api/auth/session` (the guard firing via auth.config.ts's module-scope
 * call) but returned a live JWKS — a freshly generated RSA key — from this
 * route with 200. The guard's coverage is per-entry-point, not automatic;
 * any new module that imports lib/dev-identity directly, or that is a new
 * process-level entry point, must call assertBypassNotInProduction itself,
 * exactly as done below.
 */
assertBypassNotInProduction(process.env);

export async function GET() {
  if (process.env.AUTH_DEV_BYPASS !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const { devJwks } = await import("@/lib/dev-identity");
  return NextResponse.json(await devJwks(), {
    headers: { "cache-control": "no-store" },
  });
}
