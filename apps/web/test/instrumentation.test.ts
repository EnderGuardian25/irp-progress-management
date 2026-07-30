import { afterEach, describe, expect, it, vi } from "vitest";

// Next calls register() once per runtime at server boot. Task 7 of Plan 4A
// found that a containerised standalone `next start` never imports route
// modules at boot — so auth.config.ts's module-scope guard did not fire until
// the first request, and a container with AUTH_DEV_BYPASS=true started, said
// "Ready", and stayed Up 500ing everything instead of refusing to start.
// instrumentation.ts closes that: it is the only guard call on a path that
// runs when no request ever arrives.
//
// These tests assert process.exit(1) rather than a thrown error because
// throwing does not stop a Next server — Next catches the hook's rejection
// and its own unhandledRejection listener pre-empts Node's default crash. The
// exit call IS the guarantee, so it is what gets pinned here.
//
// The spies are created inline in each test rather than in a shared helper: a
// helper needs a return-type annotation, and `ReturnType<typeof vi.spyOn>`
// degrades to `any` because vi.spyOn is generic, which the repo's type-aware
// lint rejects under no-unsafe-assignment. process.exit is mocked to a no-op
// so the guard's exit does not take the test runner with it — nothing runs
// after process.exit(1) in the source, so a no-op is a faithful stand-in.
describe("instrumentation register()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Next invokes the export by that exact name. A rename or a default export
  // would silently never run — no error, just an unguarded boot — so the
  // shape is pinned, not assumed. This is the same class of failure as the
  // middleware.ts export-shape bug Plan 3 shipped for four tasks.
  it("exports a function named register", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AUTH_DEV_BYPASS", "false");

    const mod = await import("@/instrumentation");
    expect(typeof mod.register).toBe("function");
    expect(mod.register.name).toBe("register");
  });

  it("exits non-zero when the bypass is set in production", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEV_BYPASS", "true");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    // Collected into an `unknown[]` rather than asserted with
    // expect.objectContaining/stringMatching: those asymmetric matchers are
    // typed `any`, which the repo's type-aware lint rejects. Stringifying is
    // also the more faithful assertion — it checks what an operator actually
    // reads in `docker logs`, not the shape of the object behind it.
    const logged: unknown[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(...args);
    });

    const { register } = await import("@/instrumentation");
    await register();

    expect(exit).toHaveBeenCalledWith(1);
    // The operator has to be able to tell WHY the container died from the
    // logs alone; an exit code on its own is not diagnosable.
    const output = logged.map(String).join(" ");
    expect(output).toMatch(/AUTH_DEV_BYPASS/);
    expect(output).toMatch(/Refusing to start/);
  });

  // The container case specifically: the web image sets NODE_ENV itself, and
  // an image or platform that sets it capitalised must still trip the guard.
  it("exits non-zero when NODE_ENV is 'Production' (mixed case)", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "Production");
    vi.stubEnv("AUTH_DEV_BYPASS", "true");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { register } = await import("@/instrumentation");
    await register();

    expect(exit).toHaveBeenCalledWith(1);
  });

  // Proves register() performs the check itself rather than riding on
  // auth.config.ts's module-scope side effect: the module is imported under a
  // SAFE environment, so that side effect has already run harmlessly and the
  // module is cached. Only the explicit call inside register() can fire now.
  // If register()'s body were emptied, this test fails and the others pass.
  it("checks the environment at call time, not only at import time", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AUTH_DEV_BYPASS", "false");
    const { register } = await import("@/instrumentation");
    await import("@/auth.config"); // cache it while the environment is safe

    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEV_BYPASS", "true");
    await register();

    expect(exit).toHaveBeenCalledWith(1);
  });

  // The guard must not break a normal boot. register() runs on EVERY server
  // start, so a false positive here would take production down rather than
  // let a bypass through — the opposite failure, and just as bad.
  it("does not exit on a production boot without the bypass", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { register } = await import("@/instrumentation");

    for (const AUTH_DEV_BYPASS of [undefined, "", "false", "1", "TRUE", "yes"]) {
      vi.stubEnv("AUTH_DEV_BYPASS", AUTH_DEV_BYPASS);
      await register();
    }

    expect(exit).not.toHaveBeenCalled();
  });
});
