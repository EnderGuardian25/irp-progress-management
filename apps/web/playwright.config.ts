import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // No retries. A flaky end-to-end test that passes on retry teaches nothing,
  // and this repo has been bitten twice by gates that looked green.
  retries: 0,
  // `fullyParallel: false` orders tests WITHIN a file. It does NOT stop
  // Playwright distributing FILES across workers — that is `workers`, whose
  // default is 1 only when `process.env.CI` is set and half the logical cores
  // otherwise. So this suite ran serially in CI and 4-way parallel on a dev
  // machine, from the same config.
  //
  // There is no safe file-level parallelism here. All four spec files share one
  // Postgres database and one dev server, and they mutate it:
  // student-flows submits an entry and marks an absence for TODAY,
  // dashboard-flows asserts today's counts and cross-reads the Roster for the
  // same day, and mentor-flows' archive test calls reseed() — a full
  // `db:seed`, which wipes and rebuilds every seed persona MID-RUN. A reseed in
  // one worker while another is mid-assertion is not a race that can be tuned
  // away; the shared fixture is the whole design.
  //
  // Measured on 2026-08-04, same commit, same freshly seeded database:
  // 24/24, then 23/24, then 19/24. CI was green throughout, because CI was
  // serial. That divergence is the worst property a gate can have — it fails
  // only where nobody is watching and teaches the reader to re-run.
  //
  // Pinned rather than left to the default so local and CI run the identical
  // schedule. Do not raise it to "speed the suite up": the cost of a serial
  // run is ~2 minutes, and the cost of a parallel one is a gate nobody trusts.
  workers: 1,
  fullyParallel: false,
  // These are NOT a retry in disguise, and they are not padding — the default
  // 5000ms expect budget was measurably the wrong budget, and it made the
  // first test a coin flip in CI.
  //
  // The suite must run against `next dev`, not a production build: the sign-in
  // chain needs AUTH_DEV_BYPASS=true, and assertBypassNotInProduction refuses
  // that in a production build by design (ADR-0012). So on-demand Turbopack
  // compilation is inherent here, not an artefact to be tuned away — and the
  // first test's first assertion is where it all lands. Measured on two
  // consecutive CI runs of the same commit range:
  //
  //            GET /api/auth/providers   GET /       click -> `/` rendered
  //   green:   2.2s (cold compile)       2.3s        ~5.5s, PASSED by ~0.3s
  //   red:     2.6s (cold compile)       2.6s        ~5.9s, FAILED by ~0.4s
  //
  // Two cold compiles — the NextAuth route on the first signIn() call, then
  // the `/` page on the post-callback redirect — total ~4.9s and sit entirely
  // inside `expect(getByTestId("user-name")).toHaveText(...)`'s window, since
  // click() resolves as soon as the click is dispatched. A ~5s workload
  // against a 5s deadline is a ~50/50 gate, which is worse than a slow one:
  // it fails on commits that changed nothing (it failed on a docs-only
  // commit) and it teaches the next reader to re-run CI rather than read it.
  //
  // Neither assertion is weakened: every expectation still has to pass, and
  // the per-test timeout still bounds a genuine hang. Raising the deadline
  // only stops the assertion from also measuring compiler latency.
  //
  // The alternative — warming the routes in a globalSetup — was rejected as
  // insufficient on its own: `/api/auth/providers` warms fine, but `/` is
  // behind the proxy.ts auth guard, so an unauthenticated warm-up redirects
  // without ever compiling the page module. It would remove about half the
  // cold cost and leave a smaller version of the same coin flip.
  timeout: 60_000,
  expect: { timeout: 20_000 },
  // `github` alone writes NO files — it only emits inline PR annotations —
  // so a CI failure produced an artifact upload with nothing in it (the
  // "Upload the Playwright report on failure" step in ci.yml went green on
  // an empty directory, because upload-artifact@v4 defaults to
  // if-no-files-found: warn). `html` is added alongside it, with
  // `open: "never"` so it does not try to launch a browser on a CI runner,
  // to actually produce `playwright-report/` for that step to upload.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    // `localhost`, NOT 127.0.0.1 — and this is the one place in the repo where
    // the literal address is wrong. Next.js canonicalises loopback: NextURL's
    // parseURL rewrites any of 127.x.x.x, [::1] and localhost to the literal
    // string "localhost" (next/dist/server/web/next-url.js,
    // REGEX_LOCALHOST_HOSTNAME), and NextRequest.url is built from that. So
    // Auth.js always computes its base origin as http://localhost:3000 no
    // matter which loopback address the browser used — even AUTH_URL cannot
    // override it, because next-auth's reqWithEnvURL rewrites the origin and
    // then hands the result to NextRequest, which normalises it straight back.
    //
    // Driving the browser at 127.0.0.1 therefore breaks the sign-in chain in
    // two independent ways:
    //   1. The dev server blocks cross-origin requests to /_next/* resources
    //      and its default allowlist is `localhost`/`*.localhost` only, so the
    //      HMR WebSocket upgrade is answered 403. Next's dev bootstrap connects
    //      the hot reloader BEFORE hydrating, so React never hydrates: the page
    //      renders perfectly via SSR, no click handler is ever attached, and
    //      nothing throws. It presents as "the button does nothing".
    //   2. Even hydrated, the credentials callback's redirect target
    //      http://127.0.0.1:3000/ is a different origin from Auth.js's
    //      localhost base, so the default `redirect` callback discards it and
    //      returns the base — the browser lands on localhost without the
    //      cookie that was just set on 127.0.0.1, and bounces back to /signin.
    //
    // The ::1-versus-IPv4 hazard that motivates 127.0.0.1 elsewhere is real,
    // but it applies to servers we bind ourselves: Fastify listens on IPv4
    // only, so apps/api is still addressed as 127.0.0.1 below. Next's dev
    // server listens on both families, so `localhost` resolves either way.
    baseURL: "http://localhost:3000",
    // Desktop only, min 1280px (NFR-13).
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // The dark spec belongs to chromium-dark alone. Without this ignore it
      // would also run here, in light, where its whole premise is false.
      testIgnore: /dark-theme\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // The dark guard (ADR-0021). Scoped by testMatch to ONE read-only spec —
      // NOT the whole suite. mentor-flows and student-flows mutate shared state
      // (an entry for today, a report walked irreversibly to Evaluated, a
      // reseed mid-run), so a second pass over them in the same serial run
      // meets state the first pass consumed. That is precisely the
      // state-dependence that made this suite score 24/24, 23/24 and 19/24
      // before `workers: 1` was pinned. Cost here is one extra sign-in chain,
      // not a doubled suite.
      name: "chromium-dark",
      testMatch: /dark-theme\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
  ],
  webServer: [
    {
      // NOT `pnpm --filter @irp/api dev` — that is `tsx watch`, a file watcher.
      // Under Playwright's managed webServer the watcher supervises a child and
      // never reported ready, so the health poll timed out at 60s while the very
      // same command run as a plain background job served /health in ~2s. A test
      // harness has no use for a watcher anyway; run the entrypoint directly.
      //
      // Env is passed explicitly rather than via --env-file: tsx does not
      // forward that flag to node (it exits 9), and an explicit block does not
      // depend on a git-ignored .env file existing, which matters for CI.
      command: "pnpm --filter @irp/api exec tsx src/index.ts",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PORT: "3001",
        NODE_ENV: "development",
        DATABASE_URL:
          process.env.DATABASE_URL ?? "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public",
        // JWKS_URI is FETCHED, so it must be an address that resolves — 127.0.0.1,
        // because `localhost` prefers ::1 on the Windows dev machines.
        JWKS_URI: "http://127.0.0.1:3000/api/dev-jwks",
        // JWT_ISSUER is STRING-COMPARED against the token's `iss` claim, so it
        // must equal DEV_ISSUER in apps/web/lib/dev-identities.ts exactly —
        // which says `localhost`. These two deliberately differ: one is a
        // network target, the other is an opaque identifier.
        JWT_ISSUER: "http://localhost:3000/api/dev-jwks",
        JWT_AUDIENCE: "api://irp-progress-management",
      },
    },
    {
      command: "pnpm --filter @irp/web dev",
      url: "http://127.0.0.1:3000/signin",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        // AUTH_URL must equal `use.baseURL` EXACTLY, and both must say
        // `localhost` — see the note on use.baseURL. Auth.js resolves its base
        // origin from the (loopback-normalised) request URL, so a 127.0.0.1
        // AUTH_URL is silently ignored and the post-callback redirect lands on
        // a different origin than the session cookie. Next does not override
        // already-set process.env values, so this wins over .env.local.
        AUTH_URL: "http://localhost:3000",
        AUTH_DEV_BYPASS: "true",
        // Server-side fetch target, so 127.0.0.1 for the same ::1 reason.
        API_BASE_URL: "http://127.0.0.1:3001",
        AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-at-least-32-bytes-xx",
      },
    },
  ],
});
