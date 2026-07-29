import { describe, expect, it } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import { config } from "@/middleware";

// `middleware` is typed against next-auth's `WithAuthArgs` union of call
// shapes (a middleware invocation, a Pages API-route invocation, a
// getServerSideProps invocation, ...). Calling it with a bare NextRequest
// makes TS try to match the NextApiRequest/NextApiResponse tuple instead —
// the one Next.js's actual middleware runtime never uses — and fail on
// mismatched member types. This local alias asserts the one shape Next.js
// really invokes: `(request: NextRequest, event: NextFetchEvent) =>
// Promise<Response | undefined>`, matching the shape of next-auth's own
// `NextAuthMiddleware` type (lib/index.d.ts) structurally.
//
// `NextAuthMiddleware` itself is NOT reachable: next-auth@5.0.0-beta.32's
// public entry (index.d.ts) re-exports only `NextAuthConfig` and
// `NextAuthRequest` as types — confirmed by probing
// `import type { NextAuthMiddleware } from "next-auth"`, which fails with
// TS2614 ("has no exported member"). So this local alias is the closest
// available substitute, not an import of the real thing.
type MiddlewareInvocation = (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response | undefined>;

// Anchored, unlike a naive `new RegExp(pattern).test(pathname)`: the matcher
// pattern's negative lookahead only guards the START of the path. Tested
// unanchored, "/api/auth/signin" and "/_next/static/chunk.js" both false-
// -positive as guarded, because the engine finds a second "/" further into
// the string (e.g. the one before "auth" in "/api/auth/signin") from which
// the lookahead no longer sees "api/auth" and so passes. Next.js's own
// matcher compiler anchors the pattern before using it; this helper must
// mirror that or it verifies nothing.
function matches(pathname: string): boolean {
  return config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
}

describe("middleware matcher", () => {
  it("guards application routes", () => {
    for (const path of ["/", "/roster", "/review", "/cycles/2"]) {
      expect(matches(path)).toBe(true);
    }
  });

  it("does not guard the Auth.js routes, or sign-in would be unreachable", () => {
    expect(matches("/api/auth/signin")).toBe(false);
    expect(matches("/api/auth/callback/dev-identity")).toBe(false);
  });

  it("does not guard any /api route, including dev-jwks — jose's createRemoteJWKSet fetches with redirect: 'manual' and throws on any non-200 response, so a redirected JWKS endpoint breaks dev sign-in end to end", () => {
    expect(matches("/api/dev-jwks")).toBe(false);
    expect(matches("/api/auth/signin")).toBe(false);
    expect(matches("/api/anything-else")).toBe(false);
  });

  it("does not guard /signin", () => {
    expect(matches("/signin")).toBe(false);
  });

  it("does not guard /not-registered, which must stay terminal", () => {
    // Guarding it means an expired session bounces the user to /signin from a
    // page whose whole purpose is to be an endpoint, not a waypoint.
    expect(matches("/not-registered")).toBe(false);
  });

  it("does not guard Next internals or static assets", () => {
    for (const path of ["/_next/static/chunk.js", "/favicon.ico"]) {
      expect(matches(path)).toBe(false);
    }
  });
});

describe("middleware behavior", () => {
  it("redirects an unauthenticated request to / rather than letting it reach the page", async () => {
    // The matcher covering "/" is necessary but not sufficient: this proves
    // the exported middleware itself, invoked the way Next.js invokes it,
    // actually redirects an unauthenticated hit rather than falling through
    // to render the page (which would throw on the missing session cookie,
    // per lib/api-client.ts's readAccessToken, and surface as a 500).
    const { middleware } = await import("@/middleware");
    // NextAuth's `auth()` wrapper reads `request.nextUrl`, a NextRequest-only
    // convenience the plain web Request does not have — a bare Request makes
    // it crash before it even reaches the authorized() check, which would
    // look like a false pass/fail unrelated to the redirect behavior under
    // test.
    const request = new NextRequest("http://localhost:3000/");
    // Unavoidable double assertion, not a stylistic one: `auth`'s declared
    // type is an intersection of five overload branches (NextApiRequest/
    // NextApiResponse, no-args, GetServerSidePropsContext, an
    // AppRouteHandlerFn wrapper, and a NextAuthMiddleware wrapper), and none
    // of them structurally matches `(NextRequest, NextFetchEvent) =>
    // Promise<Response | undefined>` closely enough for a direct `as
    // MiddlewareInvocation` — tsc rejects it with TS2352 ("neither type
    // sufficiently overlaps with the other") and names the `unknown` hop
    // itself as the fix. What this gives up: TypeScript will NOT catch a
    // signature change to next-auth's `auth()` export (e.g. a reordered or
    // added parameter, a changed return type) at this call site — the
    // runtime assertions below (response.status, the redirect location) are
    // the only thing standing in for that check.
    const response = await (middleware as unknown as MiddlewareInvocation)(
      request,
      {} as NextFetchEvent,
    );
    expect(response?.status).toBe(307);
    const location = response?.headers.get("location");
    expect(location).toContain("/signin");
  });
});
