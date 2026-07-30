/**
 * Next calls register() once per runtime at SERVER BOOT. That is the whole
 * reason this file exists.
 *
 * This is a FOURTH entry point into the bypass guard, alongside auth.ts,
 * proxy.ts (both via auth.config.ts's module-scope call) and
 * app/api/dev-jwks/route.ts (its own explicit call). Unlike those three, this
 * one is not a request path — it is the process itself.
 *
 * WHY IT IS NEEDED — a containerised `next start` is a genuinely different
 * entry point, and Task 7 of Plan 4A proved it. `next build` imports every
 * route's module eagerly during static generation, so auth.config.ts's
 * module-scope call throws and the build dies, which is the behaviour the dev
 * bypass has always been documented as having. A standalone server does NOT:
 * server.js is a generic launcher that reads required-server-files.json and
 * opens a socket, and route modules are required lazily on the first matching
 * request. So with AUTH_DEV_BYPASS=true the container started, reported
 * "Ready", stayed Up indefinitely, and 500'd every request with the guard's
 * message once something actually touched a route.
 *
 * That is fail-closed, and no bypass session was ever reachable — but it is a
 * materially weaker guarantee than "refuses to start", and it depends on the
 * coincidence that every reachable route transitively imports the guard. That
 * coincidence is exactly what did NOT hold in Plan 3, when /api/dev-jwks
 * served a live JWKS while / and /api/auth/session correctly 500'd. Coverage
 * that happens to be total today is not the same as coverage that is
 * structural, so this makes it structural: one call, at boot, on a path no
 * route can route around.
 *
 * WHY IT CATCHES AND EXITS RATHER THAN JUST THROWING — this was measured, not
 * assumed. Throwing out of register() does NOT stop the server: Next wraps the
 * hook, logs "An error occurred while loading the instrumentation hook", and
 * surfaces the failure as an unhandledRejection. Next installs its own
 * process-level unhandledRejection listener, which pre-empts Node's default
 * crash-on-unhandled-rejection, so the container was observed to stay Up with
 * exit code 0 — the same non-exit this file was added to fix. Node's default
 * behaviour cannot be relied on here because Next has already overridden it.
 * An explicit exit is therefore the only thing that makes "refuses to start"
 * true for this runtime.
 *
 * A container sitting Up while failing everything also reads as healthy to any
 * orchestrator that has no route-level probe. Exiting non-zero does not.
 *
 * Do NOT remove this in the belief that auth.config.ts's module-scope call
 * already covers it. It does not — that call is per-module-load, this one is
 * per-process, and only the latter runs when no request ever arrives.
 */
export async function register(): Promise<void> {
  try {
    // Imported dynamically, INSIDE the try, on purpose. auth.config.ts runs
    // assertBypassNotInProduction at its own module scope, so a static import
    // at the top of this file would throw during module evaluation of
    // instrumentation.ts — before register() is entered, and therefore
    // outside any catch this function could install. Observed exactly that
    // way: the stack frame was "at module evaluation", not inside register().
    // Awaiting the import here puts BOTH the module-scope call and the
    // explicit one below under this handler.
    const { assertBypassNotInProduction } = await import("@/auth.config");
    assertBypassNotInProduction(process.env);
  } catch (error) {
    // Any failure to evaluate the auth configuration at boot is fatal by
    // design, not just the guard's own throw: a server that cannot load its
    // auth config cannot authenticate anyone, and staying up to serve errors
    // is strictly worse than being visibly dead.
    console.error(error);

    // The Edge runtime has no process.exit. Next only builds an Edge
    // instrumentation bundle when there is Edge runtime code — since ADR-0013
    // proxy.ts runs on Node, there is currently none — but this file must not
    // become the thing that breaks if that changes. Re-throwing is the best
    // available behaviour there; on Node it is exit(1) that makes the
    // container actually stop.
    if (typeof process.exit !== "function") {
      throw error;
    }
    process.exit(1);
  }
}
