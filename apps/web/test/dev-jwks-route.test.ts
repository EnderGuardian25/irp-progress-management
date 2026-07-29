// @vitest-environment node
//
// This route dynamically imports lib/dev-identity.ts when the bypass is on,
// which calls jose functions. jose's WebCrypto build fails an
// `instanceof Uint8Array` check across jsdom's separate VM realm (see
// dev-identity.test.ts), so this file runs under the plain Node environment.
import { afterEach, describe, expect, it, vi } from "vitest";

// A whole-branch review found this route had NEITHER guard: middleware.ts
// excludes /api wholesale, and this file imported lib/dev-identity directly
// without ever pulling in auth.config.ts, so a production process with
// AUTH_DEV_BYPASS=true served a live, freshly generated JWKS with 200 while
// sign-in itself correctly 500'd. These tests pin the fix: the route now
// calls assertBypassNotInProduction(process.env) at module scope, imported
// from auth.config.ts, exactly like auth.ts and middleware.ts.
//
// Each test imports the route module fresh (vi.resetModules() first) with a
// literal specifier — a literal import() specifier is statically analyzable,
// so TypeScript types the result properly, unlike importing via a variable.
describe("GET /api/dev-jwks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns 404 when the bypass flag is off", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_DEV_BYPASS", "false");
    vi.stubEnv("NODE_ENV", "test");
    const { GET } = await import("@/app/api/dev-jwks/route");
    const response = await GET();
    expect(response.status).toBe(404);
  });

  it("publishes exactly one public RS256 key with no private material when the bypass is on outside production", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_DEV_BYPASS", "true");
    vi.stubEnv("NODE_ENV", "development");
    const { GET } = await import("@/app/api/dev-jwks/route");
    const response = await GET();
    expect(response.status).toBe(200);

    const body = (await response.json()) as { keys: Record<string, unknown>[] };
    expect(body.keys).toHaveLength(1);
    const key = body.keys[0]!;
    expect(key.alg).toBe("RS256");
    expect(key.use).toBe("sig");
    // A private RSA key would carry these. Publishing one would let anyone
    // mint tokens our own API trusts.
    for (const priv of ["d", "p", "q", "dp", "dq", "qi"]) {
      expect(key).not.toHaveProperty(priv);
    }
  });

  // Proves the guard is actually wired into THIS module, not just present
  // somewhere else in the codebase: importing the route module itself, with
  // the bypass set in a production environment, must throw — the same
  // assertion middleware.test.ts makes for auth.config.ts's own module-scope
  // call. Before the fix, this import succeeded and GET() returned 200.
  it("throws via assertBypassNotInProduction merely by being imported when the bypass is set in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEV_BYPASS", "true");

    await expect(import("@/app/api/dev-jwks/route")).rejects.toThrow(/AUTH_DEV_BYPASS/);
  });
});
