import { NextResponse } from "next/server";

/**
 * Publishes the dev public key so apps/api can validate dev-minted tokens
 * through createRemoteJWKSet — the same code path production uses.
 *
 * Returns 404 when the bypass is off, so this endpoint does not exist in a
 * normal build.
 */
export async function GET() {
  if (process.env.AUTH_DEV_BYPASS !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const { devJwks } = await import("@/lib/dev-identity");
  return NextResponse.json(await devJwks(), {
    headers: { "cache-control": "no-store" },
  });
}
