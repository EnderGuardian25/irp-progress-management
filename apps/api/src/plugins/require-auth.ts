import fp from "fastify-plugin";

/**
 * Fail-closed by default for everything under /api/.
 *
 * The OpenAPI document declares a document-level `security` requirement, which
 * is fail-closed. The implementation was opt-in per route, so a handler added
 * without `preHandler: [app.authenticate]` would be public — and would lint and
 * test clean. Plan 2B caught that with a route-discovery test; this closes it
 * structurally.
 *
 * onRequest, not preHandler, so it runs before routing and therefore also
 * covers /api/ paths with no registered route. Those return 401 rather than
 * 404, which is the correct posture: an unauthenticated caller learns nothing
 * about what exists.
 *
 * /health is deliberately outside /api/ — a container liveness probe that takes
 * no credentials.
 *
 * Matched against the path with the query string stripped, and the bare
 * `/api` path (no trailing slash) is covered deliberately: `startsWith("/api/")`
 * alone misses both `/api` and `/api?x=1`. No route is registered at exactly
 * `/api` today, so that gap is invisible — a 404 rather than a 401 — but a
 * future route landing there would otherwise be public, exactly the class of
 * bug this hook exists to close.
 */
export const requireAuthPlugin = fp(
  (app) => {
    app.addHook("onRequest", async (req, reply) => {
      const path = req.url.split("?")[0] ?? "";
      if (path !== "/api" && !path.startsWith("/api/")) return;
      await app.authenticate(req, reply);
    });
  },
  { name: "require-auth", dependencies: ["auth"] },
);
