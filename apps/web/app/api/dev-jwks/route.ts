import { NextResponse } from "next/server";
import { assertBypassNotInProduction } from "@/auth.config";

/**
 * Publishes the dev public key so apps/api can validate dev-minted tokens
 * through createRemoteJWKSet — the same code path production uses.
 *
 * Returns 404 when the bypass is off, so this endpoint does not exist in a
 * normal build.
 *
 * This is a THIRD entry point into the bypass, alongside auth.ts and
 * middleware.ts (via auth.config.ts) — and it does not go through either of
 * those. auth.config.ts's own module-scope call guards auth.ts and
 * middleware.ts, but this route imports lib/dev-identity directly and never
 * pulls auth.config.ts in any other way, so nothing there was covering it.
 * A whole-branch review proved that gap: with the bypass flag off, a
 * production `next start` correctly 500s on `/` and `/api/auth/session`
 * (the guard firing via auth.config.ts's module-scope call) but returned a
 * live JWKS — a freshly generated RSA key — from this route with 200. The
 * guard's coverage is per-entry-point, not automatic; any new module that
 * imports lib/dev-identity directly must call assertBypassNotInProduction
 * itself, exactly as done below.
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
