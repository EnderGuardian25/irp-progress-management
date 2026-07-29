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
// Promise<Response | undefined>`, per the exported `NextAuthMiddleware`
// type this same package declares.
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
    const response = await (middleware as unknown as MiddlewareInvocation)(
      request,
      {} as NextFetchEvent,
    );
    expect(response?.status).toBe(307);
    const location = response?.headers.get("location");
    expect(location).toContain("/signin");
  });
});
