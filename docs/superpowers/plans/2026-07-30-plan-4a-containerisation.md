# Plan 4A — Containerisation, Runtime Hardening, and the Observability Seam

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docker compose up --wait` brings the whole system up as production-mode containers on a
developer machine, built from a clean checkout, with nothing requiring an Azure account, the Azure
CLI, or an Entra directory.

**Architecture:** One root `Dockerfile` with shared `base → deps → generated → build` stages and
four final targets (`api`, `web`, `migrate`, plus an internal `prod-deps`). Both application images
therefore come from the *same* generation run of `spec/openapi.yaml`, which is the whole reason for
a single file. A root `compose.yaml` wires `db → migrate → api → web`. Alongside the images, three
recorded Plan 4 obligations are closed: graceful shutdown, the `middleware.ts` → `proxy.ts`
migration, and the Prisma disconnect leak.

**Tech Stack:** Docker (BuildKit), Docker Compose, `node:24-slim`, pnpm 11.17.0 workspaces,
Fastify 5, Next.js 16.2.12 (standalone output), Prisma 7.9.1, OpenTelemetry 2.10.0,
`@azure/monitor-opentelemetry-exporter`, Vitest 4, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-30-plan-4a-containerisation-design.md`
**Branch:** `feat/plan-4a-containerisation` (already created; the spec is committed on it)

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Verification set for every task:** `pnpm typecheck`, `pnpm lint`, `pnpm test`. Any task
  touching `apps/web` **must additionally run** `pnpm --filter @irp/web build` with
  `AUTH_DEV_BYPASS=false` — plain `tsc` does not run Next's own checks and has missed both a
  `typedRoutes` error and a middleware export-shape error that broke the production build.
- **Zero lint warnings.** The repo lints at zero warnings, not zero errors.
- **Never commit generated output.** `packages/types/src`, `packages/client/src` and
  `apps/api/src/generated` are git-ignored and regenerated. A tracked copy is a second version of
  the contract.
- **Never weaken either dev-bypass guard**, and never loosen the exact-match comparison on
  `AUTH_DEV_BYPASS` or the case-insensitivity of the `NODE_ENV` comparison. Any new module that
  imports `apps/web/lib/dev-identity.ts` directly must call `assertBypassNotInProduction` itself.
- **Prove a gate fails before trusting it.** Adding a gate means demonstrating it goes red and
  recording the evidence in the task report.
- **Conventional commits.** No direct commits to `main`. Commit at the end of every task.
- **Database commands must run through PowerShell on the dev machine** — the Bash tool is
  network-sandboxed and cannot open a TCP connection to a localhost port. Prisma fails `P1001` from
  Bash against a provably healthy container.
- **Local Postgres is on host port 5433**, not 5432. Connection string:
  `postgresql://irp:irp@127.0.0.1:5433/irp?schema=public`. **Do not change CI to 5433.**
- **`prisma generate` needs `DATABASE_URL` in the shell environment** — Prisma 7 dropped implicit
  `.env` loading. The value only has to parse; `generate` never connects.
- **Docker is available on this machine: server 29.6.1.** Probe with
  `docker version --format '{{.Server.Version}}'` under a timeout — `docker info` has hung past
  120 s here.

---

## Files

**Created**

| Path | Responsibility |
|---|---|
| `apps/api/src/exporter.ts` | `selectSpanExporter(env)` — Azure Monitor or console, one decision |
| `apps/api/src/shutdown.ts` | `createShutdownHandler` / `registerShutdown` — signal-driven drain |
| `apps/api/src/bootstrap.ts` | `bootstrap(deps)` — start, and disconnect Prisma if start fails |
| `apps/api/test/exporter.test.ts` | Exporter selection, all four input shapes |
| `apps/api/test/shutdown.test.ts` | Ordering, idempotence, timeout, failure exit codes |
| `apps/api/test/bootstrap.test.ts` | The `buildServer`-rejects path |
| `apps/web/proxy.ts` | Replaces `middleware.ts`. Node runtime, same UX redirect |
| `apps/web/test/proxy.test.ts` | Replaces `test/middleware.test.ts` |
| `Dockerfile` | One build graph, four final targets |
| `.dockerignore` | Keeps host `node_modules`, build output and generated code out of the context |
| `compose.yaml` | `db → migrate → api → web` |
| `docs/adr/0013-proxy-over-middleware.md` | Edge → Node for the auth guard |
| `docs/adr/0014-azure-monitor-exporter-over-distro.md` | Raw exporter over the auto-instrumenting distro |

**Modified**

| Path | Change |
|---|---|
| `apps/api/src/index.ts` | Thin wiring over `bootstrap`, `registerShutdown`, `selectSpanExporter` |
| `apps/api/package.json` | Adds `@azure/monitor-opentelemetry-exporter` |
| `apps/web/next.config.ts` | `output: "standalone"`, `outputFileTracingRoot` |
| `.github/workflows/ci.yml` | New `images` job |
| `CLAUDE.md` | New pins; container facts |
| `handoff.md` | Plan 4 → 4A/4B split; obligations updated |
| `docs/manual-setup-steps.md` | §1.5 marked as 4B's |

**Deleted**

| Path | Why |
|---|---|
| `apps/web/middleware.ts` | Replaced by `proxy.ts`. Next hard-errors if both exist |
| `apps/web/test/middleware.test.ts` | Replaced by `test/proxy.test.ts` |

---

## Task 1: Exporter selection seam

**Files:**
- Create: `apps/api/src/exporter.ts`
- Create: `apps/api/test/exporter.test.ts`
- Create: `docs/adr/0014-azure-monitor-exporter-over-distro.md`
- Modify: `apps/api/package.json`
- Modify: `CLAUDE.md` (pinned-versions table)

**Interfaces:**
- Consumes: `createTracerProvider(exporter: SpanExporter)` from `apps/api/src/telemetry.ts`
  (unchanged).
- Produces: `selectSpanExporter(env: Partial<Record<string, string>>): SpanExporter`, imported by
  `apps/api/src/index.ts` in Task 2.

**Context the implementer needs.** `apps/api/src/telemetry.ts` already exposes
`createTracerProvider(exporter: SpanExporter)` and `apps/api/src/index.ts` currently hands it
`new ConsoleSpanExporter()`. This task adds the *choice*; Task 2 rewires `index.ts`.

**Dependency research already done — do not redo it, and do not "fix" the version.**

`@azure/monitor-opentelemetry-exporter` has **never had a stable release**. Verified against the
registry on 2026-07-30:

- `latest` → `1.0.0-beta.32`, `beta` → `1.0.0-beta.43`.
- **Pin exactly `1.0.0-beta.43`.** It is what the *GA* package `@azure/monitor-opentelemetry@1.18.2`
  itself depends on, and its OpenTelemetry ranges (`@opentelemetry/sdk-trace-base ^2.8.0`,
  `resources ^2.8.0`, `semantic-conventions ^1.40.0`, `api ^1.9.0`) are all satisfied by this
  repo's pins (2.10.0, 2.10.0, 1.43.0, 1.9.1).
- **A caret range here is a trap and must not be used.** `^1.0.0-beta.43` resolves to
  `1.0.0-preview.6`, because semver compares prerelease identifiers alphabetically and
  `"preview" > "beta"`. The `preview` line is from 2020 and requires `@opentelemetry/api ^0.10.2`.
  **Write the exact string `"1.0.0-beta.43"` with no caret, tilde, or range.**
- If pnpm's supply-chain freshness gate refuses the install, add
  `'@azure/monitor-opentelemetry-exporter@1.0.0-beta.43'` to `minimumReleaseAgeExclude` in
  `pnpm-workspace.yaml`, matching the existing entries there.

**The spec's §6 fallback is not needed.** The spec said that if the exporter turned out not to
support the 2.x OpenTelemetry SDK line, the task should ship the seam with the console exporter on
both branches. That check has now been done and it passes — every range is satisfied — so
implement the real exporter. Only fall back if the *install itself* fails in a way the note above
does not resolve, and say so explicitly in the task report if you do.

- [ ] **Step 1: Record the test baseline**

`handoff.md` states `apps/api`'s test count as both 48 and 59 in different sections, so establish
the real number now. Every later task is measured against this, not against the doc.

Run (PowerShell):

```powershell
$env:IRP_DB_PORT = "5433"
docker compose -f apps/api/docker-compose.yml up -d
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm --filter @irp/api exec prisma migrate deploy
pnpm test
```

Expected: all suites green, zero skipped. **Write the exact per-package counts into the task
report.**

- [ ] **Step 2: Add the dependency**

```bash
pnpm --filter @irp/api add @azure/monitor-opentelemetry-exporter@1.0.0-beta.43 --save-exact
```

Then confirm `apps/api/package.json` contains the bare exact string:

```json
"@azure/monitor-opentelemetry-exporter": "1.0.0-beta.43",
```

Expected: no `^`, no `~`. If pnpm wrote a caret, edit it to the exact string and re-run
`pnpm install`.

- [ ] **Step 3: Verify the export name against the installed package**

Do not assume the class name. Check it:

```bash
grep -rn "AzureMonitorTraceExporter" node_modules/@azure/monitor-opentelemetry-exporter/dist/esm/index.d.ts | head
```

Expected: a line exporting `AzureMonitorTraceExporter`. If the path differs, find the package's
`types` entry from its `package.json` and grep that instead. Record what you found in the report.

- [ ] **Step 4: Write the failing test**

Create `apps/api/test/exporter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";
import { selectSpanExporter } from "../src/exporter.js";

// A syntactically valid connection string with a zero instrumentation key.
// The exporter must be constructible from it WITHOUT any network call — that
// is the property this test relies on, and it is why the test is a unit test.
const CONNECTION_STRING =
  "InstrumentationKey=00000000-0000-0000-0000-000000000000;" +
  "IngestionEndpoint=https://southeastasia-1.in.applicationinsights.azure.com/";

describe("selectSpanExporter", () => {
  it("falls back to the console exporter when the connection string is absent", () => {
    expect(selectSpanExporter({})).toBeInstanceOf(ConsoleSpanExporter);
  });

  it("treats an empty connection string as absent", () => {
    expect(
      selectSpanExporter({ APPLICATIONINSIGHTS_CONNECTION_STRING: "" }),
    ).toBeInstanceOf(ConsoleSpanExporter);
  });

  // A variable left as whitespace in a .env file or an Azure app setting is a
  // configuration mistake, not a request for Azure Monitor. Treating it as
  // present would construct an exporter that silently drops every span.
  it("treats a whitespace-only connection string as absent", () => {
    expect(
      selectSpanExporter({ APPLICATIONINSIGHTS_CONNECTION_STRING: "   " }),
    ).toBeInstanceOf(ConsoleSpanExporter);
  });

  it("selects the Azure Monitor exporter when a connection string is present", () => {
    expect(
      selectSpanExporter({ APPLICATIONINSIGHTS_CONNECTION_STRING: CONNECTION_STRING }),
    ).toBeInstanceOf(AzureMonitorTraceExporter);
  });
});
```

- [ ] **Step 5: Run it to make sure it fails**

```bash
pnpm --filter @irp/api exec vitest run test/exporter.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/exporter.js"`.

- [ ] **Step 6: Write the implementation**

Create `apps/api/src/exporter.ts`:

```ts
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";
import { ConsoleSpanExporter, type SpanExporter } from "@opentelemetry/sdk-trace-node";

/**
 * Which span exporter this process should use.
 *
 * The seam createTracerProvider(exporter) already existed for tests to inject
 * an InMemorySpanExporter (ADR-0007). This adds the production choice on the
 * other side of it, so Plan 4B supplies a connection string and changes no
 * code.
 *
 * A whitespace-only value counts as absent: an Azure app setting left blank is
 * a configuration mistake, and honouring it would build an exporter that
 * silently drops every span rather than falling back to something visible.
 */
export function selectSpanExporter(env: Partial<Record<string, string>>): SpanExporter {
  const connectionString = (env.APPLICATIONINSIGHTS_CONNECTION_STRING ?? "").trim();
  if (connectionString === "") {
    return new ConsoleSpanExporter();
  }
  return new AzureMonitorTraceExporter({ connectionString });
}
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
pnpm --filter @irp/api exec vitest run test/exporter.test.ts
```

Expected: PASS, 4 tests.

If the Azure case fails because the constructor rejects the connection string, fix the
*connection string in the test* to whatever shape the installed package accepts — do not weaken the
implementation, and do not make the test assert on a mock.

- [ ] **Step 8: Write ADR-0014**

Create `docs/adr/0014-azure-monitor-exporter-over-distro.md`:

```markdown
# ADR-0014 — The Azure Monitor trace exporter, not the Azure Monitor distro

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint)
- **Requirements:** NFR-6 (traces visible in App Insights within 60 s); Deliverable 3
- **Relates to:** ADR-0007 (hand-written tracing plugin over auto-instrumentation), ADR-0005
  (pin the newest version the ecosystem supports, not the newest published)

## Context

`apps/api` traces requests through a hand-written Fastify plugin and exports spans through the
`createTracerProvider(exporter: SpanExporter)` seam. Plan 4B sends those spans to Application
Insights, so this plan chooses what sits on the far side of the seam.

## Decision

Depend on **`@azure/monitor-opentelemetry-exporter`, pinned exactly to `1.0.0-beta.43`**, and
select it at runtime when `APPLICATIONINSIGHTS_CONNECTION_STRING` is present.

The version is exact, with no caret. `^1.0.0-beta.43` resolves to `1.0.0-preview.6` — semver
compares prerelease identifiers alphabetically and `"preview" > "beta"` — and that preview is
from 2020, requiring `@opentelemetry/api ^0.10.2`. A range here silently downgrades the whole
telemetry stack by five years.

## Consequences

### Positive

- One dependency, implementing the `SpanExporter` interface the seam already takes. Nothing about
  how the service is composed changes.
- Its OpenTelemetry ranges (`sdk-trace-base ^2.8.0`, `resources ^2.8.0`,
  `semantic-conventions ^1.40.0`, `api ^1.9.0`) are satisfied by this repo's existing pins, so no
  other version moves.
- 4B's observability work becomes supplying a connection string.

### Negative

- **It is a beta, and this package line has never had a stable release.** That is a real risk
  accepted deliberately, as with `next-auth` in ADR-0010. The mitigation is the seam itself:
  `selectSpanExporter` is four lines and the exporter is replaceable without touching the tracing
  plugin, the provider, or any route.
- `latest` is `1.0.0-beta.32`, an *older* build than the `1.0.0-beta.43` pinned here, so a bare
  `pnpm add` gives something different from what this repo uses. The pin must stay exact.

## Alternatives considered

### Rejected — `@azure/monitor-opentelemetry` (the distro)

Superficially the better choice: version `1.18.2` is **stable**, whereas the exporter is a beta.
Rejected for two reasons. First, it bundles auto-instrumentation for HTTP, pg, redis, mongodb,
mysql, winston and bunyan, plus `@opentelemetry/sdk-node` — which directly contradicts **ADR-0007**,
where auto-instrumentation was rejected in favour of the hand-written plugin. Adopting the distro
would reverse that decision as a side effect of picking an exporter. Second, its stability is
partly cosmetic here: `@azure/monitor-opentelemetry@1.18.2` itself depends on
`@azure/monitor-opentelemetry-exporter@1.0.0-beta.43`, so the distro ships the very beta this ADR
pins. The choice is not "stable versus beta"; it is "the beta, or the beta plus an
auto-instrumentation tree we already rejected".

### Rejected — an OTLP exporter pointed at Application Insights

Vendor-neutral, stable, and it would keep the code portable to any OTLP backend. Rejected because
Application Insights has no first-class OTLP ingestion endpoint: reaching it over OTLP requires
running an OpenTelemetry Collector as a sidecar or separate container. That is an extra deployable
component, an extra thing in `main.bicep`, and an extra failure mode between the API and its
traces — for a portability benefit this project has no stated need for, on a deploy target
`CLAUDE.md` fixes as Azure.

## Revisit when

- **A stable `@azure/monitor-opentelemetry-exporter` 1.0.0 ships** — take it.
- **Traces do not appear in App Insights within 60 s during Plan 4B**, which would make NFR-6 fail
  and put the distro's `sdk-node` wiring back on the table despite ADR-0007.
- **The system needs a second telemetry backend**, at which point OTLP plus a collector stops being
  overhead and starts being the point.
```

- [ ] **Step 9: Add the pins to `CLAUDE.md`**

In the "Pinned versions" table, immediately after the `@opentelemetry/semantic-conventions` row,
add:

```markdown
| `@azure/monitor-opentelemetry-exporter` | **1.0.0-beta.43** | 1.0.0-preview.6 | Pinned **exactly, no caret**. This line has never had a stable release; `latest` is the *older* `1.0.0-beta.32`, and `1.0.0-beta.43` is what the GA `@azure/monitor-opentelemetry@1.18.2` depends on. **`^1.0.0-beta.43` resolves to `1.0.0-preview.6`** — semver compares prerelease identifiers alphabetically and `"preview" > "beta"` — which is a 2020 build requiring `@opentelemetry/api ^0.10.2`. ADR-0014 |
```

- [ ] **Step 10: Run the full verification set**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: clean; `apps/api` up 4 tests on the Step 1 baseline.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/exporter.ts apps/api/test/exporter.test.ts apps/api/package.json \
        pnpm-lock.yaml pnpm-workspace.yaml docs/adr/0014-azure-monitor-exporter-over-distro.md CLAUDE.md
git commit -m "feat(api): select the Azure Monitor span exporter by connection string

Adds selectSpanExporter(env): Azure Monitor when
APPLICATIONINSIGHTS_CONNECTION_STRING is present and non-blank, console
otherwise. Wiring into index.ts is Task 2.

Pinned exactly to 1.0.0-beta.43, with no caret: ^1.0.0-beta.43 resolves to
1.0.0-preview.6 because semver orders prerelease identifiers alphabetically
and \"preview\" > \"beta\", and that preview is a 2020 build requiring
@opentelemetry/api ^0.10.2.

ADR-0014 records the choice against the auto-instrumenting distro (which
would reverse ADR-0007) and against OTLP-plus-collector.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Graceful shutdown and the bootstrap failure path

**Files:**
- Create: `apps/api/src/shutdown.ts`
- Create: `apps/api/src/bootstrap.ts`
- Create: `apps/api/test/shutdown.test.ts`
- Create: `apps/api/test/bootstrap.test.ts`
- Modify: `apps/api/src/index.ts` (full rewrite — the current file is 23 lines)

**Interfaces:**
- Consumes: `selectSpanExporter` from Task 1; `buildServer(deps: ServerDeps)` from
  `apps/api/src/server.ts`; `createPrismaClient(databaseUrl)` from `apps/api/src/db/client.ts`.
- Produces: nothing later tasks import. `index.ts`'s runtime behaviour is what Tasks 6 and 8
  depend on: the process must exit 0 within the timeout on `SIGTERM`.

**Why this exists.** No `SIGTERM` or `SIGINT` handler exists anywhere in `apps/api`. ADR-0009 D5
scales the API to zero at rest, so container shutdown is a routine event, not a deploy-time one —
every scale-down currently drops in-flight requests. This bears directly on NFR-2's *"200 RPS
burst, zero 5xx"*. Separately, `index.ts` today calls `prisma.$disconnect()` only inside the
`catch` around `app.listen`, so a `buildServer` rejection leaks the client.

**Design note for the implementer.** Both modules take their side effects as injected functions —
`exit`, `close`, `disconnect`, `on`. That is not ceremony: it is the only way to test a shutdown
path without calling `process.exit` inside the test runner, and it matches how
`buildServer(deps)` and `createTracerProvider(exporter)` are already built.

- [ ] **Step 1: Write the failing shutdown test**

Create `apps/api/test/shutdown.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createShutdownHandler, registerShutdown } from "../src/shutdown.js";

interface Harness {
  events: string[];
  exitCodes: number[];
  deps: Parameters<typeof createShutdownHandler>[0];
  resolveClose: () => void;
}

function harness(options: { closeHangs?: boolean; closeRejects?: boolean } = {}): Harness {
  const events: string[] = [];
  const exitCodes: number[] = [];
  let resolveClose = (): void => undefined;

  const deps = {
    close: async (): Promise<void> => {
      events.push("close:start");
      if (options.closeRejects === true) {
        throw new Error("close failed");
      }
      if (options.closeHangs === true) {
        await new Promise<void>((resolve) => {
          resolveClose = resolve;
        });
      }
      events.push("close:done");
    },
    disconnect: async (): Promise<void> => {
      events.push("disconnect");
      return Promise.resolve();
    },
    exit: (code: number): void => {
      exitCodes.push(code);
    },
    log: (event: string): void => {
      events.push(`log:${event}`);
    },
    timeoutMs: 10_000,
  };

  return {
    events,
    exitCodes,
    deps,
    resolveClose: () => {
      resolveClose();
    },
  };
}

describe("createShutdownHandler", () => {
  it("drains the server before disconnecting the database", async () => {
    const h = harness();
    createShutdownHandler(h.deps)("SIGTERM");
    await vi.waitFor(() => {
      expect(h.exitCodes).toEqual([0]);
    });

    // Disconnecting first would fail the very requests the drain protects.
    expect(h.events.indexOf("close:done")).toBeLessThan(h.events.indexOf("disconnect"));
  });

  it("ignores a second signal while a shutdown is already running", async () => {
    const h = harness({ closeHangs: true });
    const handler = createShutdownHandler(h.deps);

    handler("SIGTERM");
    handler("SIGTERM");
    handler("SIGINT");

    h.resolveClose();
    await vi.waitFor(() => {
      expect(h.exitCodes).toEqual([0]);
    });

    expect(h.events.filter((e) => e === "close:start")).toHaveLength(1);
  });

  it("force-exits non-zero when the drain overruns the timeout", async () => {
    vi.useFakeTimers();
    try {
      const h = harness({ closeHangs: true });
      createShutdownHandler({ ...h.deps, timeoutMs: 5_000 })("SIGTERM");

      await vi.advanceTimersByTimeAsync(5_001);

      // A SIGKILL from the orchestrator is a dropped request AND an
      // unexplained exit code. Exiting ourselves keeps it diagnosable.
      expect(h.exitCodes).toEqual([1]);
      expect(h.events).not.toContain("disconnect");
    } finally {
      vi.useRealTimers();
    }
  });

  it("exits non-zero when the drain throws", async () => {
    const h = harness({ closeRejects: true });
    createShutdownHandler(h.deps)("SIGTERM");
    await vi.waitFor(() => {
      expect(h.exitCodes).toEqual([1]);
    });
  });
});

describe("registerShutdown", () => {
  it("registers one handler per requested signal", () => {
    const h = harness();
    const registered: string[] = [];

    registerShutdown({
      ...h.deps,
      signals: ["SIGTERM", "SIGINT"],
      on: (signal: NodeJS.Signals): void => {
        registered.push(signal);
      },
    });

    expect(registered).toEqual(["SIGTERM", "SIGINT"]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @irp/api exec vitest run test/shutdown.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/shutdown.js"`.

- [ ] **Step 3: Write `shutdown.ts`**

Create `apps/api/src/shutdown.ts`:

```ts
export interface ShutdownDeps {
  /** Stop accepting connections and drain in-flight requests. Usually app.close(). */
  close: () => Promise<void>;
  /** Release the database pool. Usually prisma.$disconnect(). */
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  log: (event: string, err?: unknown) => void;
  timeoutMs: number;
}

export interface RegisterShutdownDeps extends ShutdownDeps {
  signals: NodeJS.Signals[];
  on: (signal: NodeJS.Signals, handler: () => void) => void;
}

/**
 * Container Apps sends SIGTERM on every scale-down and redeploy, and ADR-0009
 * D5 scales this service to zero at rest — so shutdown is routine, not rare.
 *
 * Order matters: close() first, so in-flight requests finish, and only then
 * disconnect(). Disconnecting first would fail exactly the requests the drain
 * exists to protect.
 *
 * The timeout is not belt-and-braces. The orchestrator's grace period is
 * finite; if we overrun it we are SIGKILLed, which is a dropped request AND an
 * unexplained exit code. Exiting ourselves keeps the failure diagnosable.
 */
export function createShutdownHandler(deps: ShutdownDeps): (signal: string) => void {
  let started = false;

  return (signal: string): void => {
    if (started) {
      deps.log(`shutdown already in progress, ignoring ${signal}`);
      return;
    }
    started = true;
    deps.log(`received ${signal}, draining`);

    const timer = setTimeout(() => {
      deps.log(`drain exceeded ${String(deps.timeoutMs)}ms, forcing exit`);
      deps.exit(1);
    }, deps.timeoutMs);
    // Never hold the event loop open on our own watchdog. Guarded because a
    // fake-timer implementation may not provide unref().
    if (typeof timer.unref === "function") {
      timer.unref();
    }

    void (async (): Promise<void> => {
      try {
        await deps.close();
        await deps.disconnect();
        clearTimeout(timer);
        deps.log("shutdown complete");
        deps.exit(0);
      } catch (err) {
        clearTimeout(timer);
        deps.log("shutdown failed", err);
        deps.exit(1);
      }
    })();
  };
}

export function registerShutdown(deps: RegisterShutdownDeps): void {
  const handler = createShutdownHandler(deps);
  for (const signal of deps.signals) {
    deps.on(signal, () => {
      handler(signal);
    });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @irp/api exec vitest run test/shutdown.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing bootstrap test**

Create `apps/api/test/bootstrap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bootstrap } from "../src/bootstrap.js";

describe("bootstrap", () => {
  it("does not disconnect when startup succeeds", async () => {
    const events: string[] = [];

    await bootstrap({
      start: async (): Promise<void> => {
        events.push("start");
        return Promise.resolve();
      },
      disconnect: async (): Promise<void> => {
        events.push("disconnect");
        return Promise.resolve();
      },
      fatal: (): void => {
        events.push("fatal");
      },
    });

    expect(events).toEqual(["start"]);
  });

  // The whole point of this module. index.ts used to disconnect only inside
  // the catch around app.listen, so a buildServer rejection leaked the client.
  it("disconnects Prisma and reports fatally when startup rejects", async () => {
    const events: string[] = [];
    const boom = new Error("buildServer rejected");
    let seen: unknown;

    await bootstrap({
      start: (): Promise<void> => Promise.reject(boom),
      disconnect: async (): Promise<void> => {
        events.push("disconnect");
        return Promise.resolve();
      },
      fatal: (err: unknown): void => {
        events.push("fatal");
        seen = err;
      },
    });

    expect(events).toEqual(["disconnect", "fatal"]);
    expect(seen).toBe(boom);
  });

  it("still reports fatally when the disconnect itself fails", async () => {
    const events: string[] = [];

    await bootstrap({
      start: (): Promise<void> => Promise.reject(new Error("boom")),
      disconnect: (): Promise<void> => Promise.reject(new Error("disconnect failed")),
      fatal: (): void => {
        events.push("fatal");
      },
    });

    expect(events).toEqual(["fatal"]);
  });
});
```

- [ ] **Step 6: Run it to make sure it fails**

```bash
pnpm --filter @irp/api exec vitest run test/bootstrap.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/bootstrap.js"`.

- [ ] **Step 7: Write `bootstrap.ts`**

Create `apps/api/src/bootstrap.ts`:

```ts
export interface BootstrapDeps {
  /** Build the server, register shutdown handling, and listen. */
  start: () => Promise<void>;
  /** Release the database pool. Usually prisma.$disconnect(). */
  disconnect: () => Promise<void>;
  /** Log and exit non-zero. */
  fatal: (err: unknown) => void;
}

/**
 * Startup, with the failure path handled once.
 *
 * index.ts previously disconnected Prisma only inside the catch around
 * app.listen, so a buildServer rejection leaked the client. Low stakes because
 * the process exits either way, but it was a recorded Plan 4 obligation and it
 * is free to get right once the structure exists.
 *
 * A failing disconnect must not mask the original error, so it is swallowed.
 */
export async function bootstrap(deps: BootstrapDeps): Promise<void> {
  try {
    await deps.start();
  } catch (err) {
    try {
      await deps.disconnect();
    } catch {
      // Deliberately ignored — reporting the startup failure matters more.
    }
    deps.fatal(err);
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
pnpm --filter @irp/api exec vitest run test/bootstrap.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 9: Rewrite `index.ts`**

Replace the entire contents of `apps/api/src/index.ts`:

```ts
import { createRemoteJWKSet } from "jose";
import { bootstrap } from "./bootstrap.js";
import { loadConfig } from "./config.js";
import { createPrismaClient } from "./db/client.js";
import { createUserRepo } from "./db/user-repo.js";
import { selectSpanExporter } from "./exporter.js";
import { buildServer } from "./server.js";
import { registerShutdown } from "./shutdown.js";
import { createTracerProvider } from "./telemetry.js";

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig(process.env);
const prisma = createPrismaClient(config.databaseUrl);

const rawTimeout = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? DEFAULT_SHUTDOWN_TIMEOUT_MS);
const timeoutMs =
  Number.isInteger(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_SHUTDOWN_TIMEOUT_MS;

await bootstrap({
  start: async () => {
    const userRepo = createUserRepo(prisma);
    const getKey = createRemoteJWKSet(new URL(config.jwksUri));
    const tracerProvider = createTracerProvider(selectSpanExporter(process.env));
    const app = await buildServer({ config, userRepo, getKey, tracerProvider });

    registerShutdown({
      close: () => app.close(),
      disconnect: () => prisma.$disconnect(),
      exit: (code) => {
        process.exit(code);
      },
      log: (event, err) => {
        if (err === undefined) {
          app.log.info(event);
        } else {
          app.log.error({ err }, event);
        }
      },
      timeoutMs,
      signals: ["SIGTERM", "SIGINT"],
      on: (signal, handler) => {
        process.on(signal, handler);
      },
    });

    await app.listen({ port: config.port, host: "0.0.0.0" });
  },
  disconnect: () => prisma.$disconnect(),
  // No app.log here on purpose: if buildServer rejected there is no app.
  fatal: (err) => {
    console.error(err);
    process.exit(1);
  },
});
```

**Note on `console.error`.** The original file used `app.log.error(err)`, which is unreachable when
`buildServer` is what rejected — there is no `app`. If `no-console` is configured as an error for
`apps/api`, add a narrowly-scoped `// eslint-disable-next-line no-console` on that line rather than
relaxing the rule; run Step 10 to find out.

- [ ] **Step 10: Run the full verification set**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: clean; `apps/api` up 8 tests on Task 1's total.

- [ ] **Step 11: Prove the handler actually runs against a real process**

The unit tests exercise the handler in isolation. Confirm the wiring too (PowerShell):

```powershell
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
$env:JWKS_URI = "https://jwks.invalid/keys"
$env:JWT_ISSUER = "https://issuer.test/v2.0"
$env:JWT_AUDIENCE = "api://irp-test"
$p = Start-Process -PassThru -NoNewWindow pnpm "--filter @irp/api exec tsx src/index.ts"
Start-Sleep -Seconds 5
Stop-Process -Id $p.Id
```

Expected: the log shows `received SIGTERM, draining` then `shutdown complete`. **Windows note:**
`Stop-Process` does not deliver a real POSIX `SIGTERM`, so if nothing is logged, do not treat that
as a failure of the code — record it and rely on Task 8's container test, which sends a genuine
`SIGTERM`, as the real proof.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/shutdown.ts apps/api/src/bootstrap.ts apps/api/src/index.ts \
        apps/api/test/shutdown.test.ts apps/api/test/bootstrap.test.ts
git commit -m "feat(api): drain in-flight requests on SIGTERM, and disconnect on a failed start

Container Apps sends SIGTERM on every scale-down, and ADR-0009 D5 scales this
service to zero at rest, so shutdown is routine rather than deploy-only. Every
scale-down previously dropped in-flight requests, which bears directly on
NFR-2's 200 RPS burst / zero 5xx target.

createShutdownHandler drains via app.close(), then disconnects Prisma, then
exits 0 — with a watchdog that force-exits non-zero rather than being SIGKILLed
by the orchestrator, and idempotence so a second signal mid-drain is ignored.

bootstrap() closes the second recorded obligation: index.ts disconnected Prisma
only inside the catch around app.listen, so a buildServer rejection leaked the
client.

Closes Plan 4 inherited obligations 2 and 4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `middleware.ts` → `proxy.ts`, with ADR-0013

**Files:**
- Create: `apps/web/proxy.ts`
- Create: `apps/web/test/proxy.test.ts`
- Create: `docs/adr/0013-proxy-over-middleware.md`
- Delete: `apps/web/middleware.ts`
- Delete: `apps/web/test/middleware.test.ts`
- Modify: `apps/web/app/api/dev-jwks/route.ts` (comment references only)
- Modify: `apps/web/auth.config.ts` (comment references only)
- Modify: `apps/web/auth.ts` (comment reference only)
- Modify: `apps/web/app/(app)/layout.tsx`, `apps/web/app/(auth)/not-registered/page.tsx`,
  `apps/web/lib/api-client.ts`, `apps/web/test/dev-jwks-route.test.ts`,
  `apps/web/test/prod-guard.test.ts`, `apps/web/.env.example` (comment/prose references only)

**Interfaces:**
- Consumes: `authConfig` from `apps/web/auth.config.ts` (unchanged).
- Produces: `apps/web/proxy.ts` exporting `proxy` and `config`. Task 4 and Task 7 build on it.

**Research already done — this is verified against the installed `next@16.2.12`, not from memory.**

From `next/dist/build/templates/middleware.js` in the installed package:

```js
const isProxy = page === '/proxy' || page === '/src/proxy';
const handlerUserland = (isProxy ? mod.proxy : mod.middleware) || mod.default;
if (typeof handlerUserland !== 'function') {
  throw new ProxyMissingExportError(`The ${isProxy ? 'Proxy' : 'Middleware'} file "${page}" must export a function named \`${isProxy ? 'proxy' : 'middleware'}\` or a default function.`);
}
```

So **`proxy.ts` must export a function named `proxy`** (or a default). And from
`next/dist/build/entries.js`, `runDependingOnPageType`:

```js
if (isProxyFile(params.page)) { params.onServer(); return; }
if (isMiddlewareFile(params.page)) {
  if (params.pageRuntime === 'nodejs') { params.onServer(); return; }
  else { params.onEdgeServer(); return; }
}
```

`config.matcher` is read by `getPageStaticInfo` for both filenames, so the existing matcher carries
over unchanged.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/proxy.test.ts`. This is a faithful port of
`apps/web/test/middleware.test.ts` — read that file too and carry over anything below that has
drifted. **Do not simplify the two hard-won details in it:** the anchored regex helper, and the
double type assertion on the handler. Both carry comments explaining why, and both were arrived at
the hard way.

```ts
import { describe, expect, it } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import { config, proxy } from "@/proxy";

// `proxy` is typed against next-auth's `WithAuthArgs` union of call shapes (a
// middleware invocation, a Pages API-route invocation, a getServerSideProps
// invocation, ...). Calling it with a bare NextRequest makes TS try to match
// the NextApiRequest/NextApiResponse tuple instead — the one Next.js's actual
// runtime never uses — and fail on mismatched member types. This local alias
// asserts the one shape Next.js really invokes, matching the shape of
// next-auth's own `NextAuthMiddleware` type (lib/index.d.ts) structurally.
//
// `NextAuthMiddleware` itself is NOT reachable: next-auth@5.0.0-beta.32's
// public entry (index.d.ts) re-exports only `NextAuthConfig` and
// `NextAuthRequest` as types — confirmed by probing
// `import type { NextAuthMiddleware } from "next-auth"`, which fails with
// TS2614.
type ProxyInvocation = (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response | undefined>;

// Anchored, unlike a naive `new RegExp(pattern).test(pathname)`: the matcher
// pattern's negative lookahead only guards the START of the path. Tested
// unanchored, "/api/auth/signin" and "/_next/static/chunk.js" both
// false-positive as guarded, because the engine finds a second "/" further
// into the string (the one before "auth", say) from which the lookahead no
// longer sees "api/auth" and so passes. Next.js's own matcher compiler anchors
// the pattern before using it; this helper must mirror that or it verifies
// nothing.
function matches(pathname: string): boolean {
  return config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
}

// NEW in Plan 4A. Next resolves the handler as
// `(isProxy ? mod.proxy : mod.middleware) || mod.default` and throws
// ProxyMissingExportError if the result is not a function — see
// next/dist/build/templates/middleware.js. `tsc` cannot catch a wrong export
// name, and a middleware export-shape error broke the production build for
// four tasks during Plan 3.
describe("proxy export shape", () => {
  it("exports a function named proxy, which is what Next resolves", () => {
    expect(typeof proxy).toBe("function");
  });
});

describe("proxy matcher", () => {
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

describe("proxy behavior", () => {
  it("redirects an unauthenticated request to / rather than letting it reach the page", async () => {
    // The matcher covering "/" is necessary but not sufficient: this proves the
    // exported handler itself, invoked the way Next.js invokes it, actually
    // redirects an unauthenticated hit rather than falling through to render
    // the page (which would throw on the missing session cookie, per
    // lib/api-client.ts's readAccessToken, and surface as a 500).
    //
    // NextAuth's `auth()` wrapper reads `request.nextUrl`, a NextRequest-only
    // convenience the plain web Request does not have — a bare Request makes it
    // crash before it reaches the authorized() check.
    const request = new NextRequest("http://localhost:3000/");
    // Unavoidable double assertion, not a stylistic one: `auth`'s declared type
    // is an intersection of five overload branches (NextApiRequest/
    // NextApiResponse, no-args, GetServerSidePropsContext, an AppRouteHandlerFn
    // wrapper, and a NextAuthMiddleware wrapper), and none structurally matches
    // ProxyInvocation closely enough for a direct cast — tsc rejects it
    // with TS2352 and names the `unknown` hop as the fix. What this gives up:
    // TypeScript will NOT catch a signature change to next-auth's `auth()`
    // export at this call site; the runtime assertions below are the only thing
    // standing in for that check.
    const response = await (proxy as unknown as ProxyInvocation)(request, {} as NextFetchEvent);
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("/signin");
  });
});
```

Note that the old file imported the handler with a dynamic `await import("@/middleware")` inside
the behaviour test; a static import at the top is fine here because the export shape test needs
`proxy` at module scope anyway.

- [ ] **Step 2: Run it to make sure it fails**

```bash
pnpm --filter @irp/web exec vitest run test/proxy.test.ts
```

Expected: FAIL — cannot resolve `@/proxy`.

- [ ] **Step 3: Create `proxy.ts`**

Create `apps/web/proxy.ts`:

```ts
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * A UX redirect, NOT the security boundary.
 *
 * Next.js has had middleware bypass CVEs, and layouts are cached across
 * navigations, so neither is a control. The boundary is apps/api: a global
 * fail-closed onRequest hook, jose validation against the JWKS, and 403 for a
 * valid token with no User row.
 *
 * This file replaced middleware.ts in Plan 4A. That was not a rename — per
 * next/dist/build/entries.js, isProxyFile routes to onServer() while
 * isMiddlewareFile routes to onEdgeServer(), so the guard moved from the Edge
 * runtime to Node. See ADR-0013. Next hard-errors if both files exist.
 *
 * The export MUST be named `proxy`. Next resolves the handler as
 * `(isProxy ? mod.proxy : mod.middleware) || mod.default` and throws
 * ProxyMissingExportError otherwise — a failure `tsc` cannot see.
 *
 * Uses authConfig rather than auth.ts. auth.ts pulls in Node-only modules that
 * were unusable on the Edge; on Node they would now load, but importing it here
 * would still be a wider surface for no benefit, and auth.config.ts is where
 * assertBypassNotInProduction is invoked at module scope.
 */
const { auth } = NextAuth(authConfig);

export { auth as proxy };

export const config = {
  // `api` is excluded wholesale, not just `api/auth`. Redirecting *any* API
  // route to an HTML sign-in page is wrong on principle: a machine caller
  // (fetch/curl/jose's JWKS client) cannot consume a sign-in page, and
  // apps/api is the actual security boundary for /api/* anyway — it runs its
  // own fail-closed auth check. A prior version excluded only `api/auth`,
  // which left `/api/dev-jwks` guarded: the redirect to /signin (307) made
  // createRemoteJWKSet's fetch (redirect: 'manual') throw on the non-200
  // response, and every dev-minted token failed validation — dev sign-in was
  // broken end to end.
  // `_next` is likewise excluded WHOLESALE rather than just `_next/static` and
  // `_next/image`: nothing under /_next is ever a route a human signs in to, so
  // enumerating subpaths only invites missing one (the dev HMR socket lives at
  // /_next/webpack-hmr, for instance).
  //
  // Honesty note for future readers: this was changed while chasing a
  // hydration failure that broke the Playwright suite, and it was NOT the
  // cause. The real cause was driving the browser at 127.0.0.1 — Next
  // canonicalises loopback hostnames to `localhost`, so its dev server treated
  // /_next/* requests as cross-origin and 403'd them. Fixed in
  // playwright.config.ts, which documents it. This exclusion is kept because
  // it is more correct, not because it fixed anything.
  matcher: ["/((?!api|signin|not-registered|_next|favicon.ico).*)"],
};
```

- [ ] **Step 4: Delete the old files**

```bash
git rm apps/web/middleware.ts apps/web/test/middleware.test.ts
```

Next **hard-errors if both `middleware.ts` and `proxy.ts` exist**, so this deletion is part of the
same change, not a follow-up.

- [ ] **Step 5: Run the test to verify it passes**

```bash
pnpm --filter @irp/web exec vitest run test/proxy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update the stale comment references**

Nine files refer to `middleware.ts` in prose. Update each to say `proxy.ts`, keeping the meaning
intact. Do **not** restrict the grep to `.ts`/`.tsx` — that filter cannot match `.env.example`,
which is exactly how the first pass over this step missed a hit:

```bash
grep -rn "middleware" apps/web | grep -v node_modules
```

Files to fix: `apps/web/auth.config.ts` (lines ~44–46), `apps/web/auth.ts` (~9),
`apps/web/app/api/dev-jwks/route.ts` (~12–14), `apps/web/app/(app)/layout.tsx` (~12),
`apps/web/app/(auth)/not-registered/page.tsx` (~5), `apps/web/lib/api-client.ts` (~131),
`apps/web/test/dev-jwks-route.test.ts` (~9, ~15, ~58), `apps/web/test/prod-guard.test.ts` (~49–54),
`apps/web/.env.example` (~17–18 — this one
also states a false count, "three separate calls"; there are two calls covering three entry
points, one of them transitively via `auth.ts`'s import of `auth.config.ts` — correct the wording,
not just the filename).

In `auth.config.ts`, the comment must also stop claiming the Edge runtime. Replace:

```
// middleware.ts imports auth.config.ts directly (auth.ts is not edge-safe,
// so middleware cannot go through it). Without this call living here, an
// Edge health check that only loads middleware.ts would boot clean with
// AUTH_DEV_BYPASS=true in production; only a page or route that also pulls
// in @/auth would trip the guard. process.env reads are Edge-runtime-safe in
// Next 16 — the Edge sandbox mirrors the real process.env, it does not
// restrict reads to NEXT_PUBLIC_*-prefixed or statically inlined names — so
// this call is safe on both the edge and the Node import path.
```

with:

```
// proxy.ts imports auth.config.ts directly. Without this call living here, a
// request that only loads proxy.ts would boot clean with AUTH_DEV_BYPASS=true
// in production; only a page or route that also pulls in @/auth would trip the
// guard. Since Plan 4A (ADR-0013), proxy.ts runs on Node rather than the Edge,
// so process.env is plainly available — but this call must stay regardless:
// its purpose is per-entry-point coverage, not runtime compatibility.
```

- [ ] **Step 7: Re-check all three bypass guard entry points**

Do not assume the swap preserved coverage — three successive claims that this guard's coverage was
complete turned out to be false during Plan 3.

```bash
grep -rn "assertBypassNotInProduction" apps/web --include=*.ts --include=*.tsx | grep -v node_modules
```

Expected: the definition and its module-scope self-invocation in `auth.config.ts`, the call in
`app/api/dev-jwks/route.ts`, and whatever `auth.ts` does today. Confirm `proxy.ts` reaches the
guard through its `auth.config.ts` import. **Record the exact list in the task report.**

- [ ] **Step 8: Prove the guard still refuses a production build**

```bash
AUTH_DEV_BYPASS=true pnpm --filter @irp/web build
```

Expected: **FAIL** with "AUTH_DEV_BYPASS is set in a production build. Refusing to start." A build
that *succeeds* here means guard one has broken — stop and investigate immediately.

- [ ] **Step 9: Run the real build and the end-to-end suite**

```bash
AUTH_DEV_BYPASS=false pnpm --filter @irp/web build
```

Expected: PASS, and **no `middleware.ts` deprecation warning** in the output.

Then the Playwright suite, which is the only thing proving the whole sign-in chain (PowerShell —
see `handoff.md` §3 for the dev-user seeding this needs):

```powershell
Set-Location apps/web; pnpm exec playwright test
```

Expected: 5 specs pass. If they fail, the auth guard moving from Edge to Node is the prime suspect —
debug it here rather than deferring.

- [ ] **Step 10: Write ADR-0013**

Create `docs/adr/0013-proxy-over-middleware.md`:

```markdown
# ADR-0013 — `proxy.ts` over `middleware.ts`: moving the auth guard from Edge to Node

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint)
- **Requirements:** FR-1, FR-2 (authenticated access), NFR-14
- **Relates to:** ADR-0009 (hosting topology — the deploy target settles this), ADR-0012 (the dev
  auth bypass, whose guard is invoked from this entry point)

## Context

Next 16 deprecates the `middleware.ts` file convention in favour of `proxy.ts`, warning on every
build. Adopting it looks like a rename and is not one. Per `next/dist/build/entries.js`:

    if (isProxyFile(params.page))      { params.onServer(); return; }
    if (isMiddlewareFile(params.page)) {
      if (params.pageRuntime === 'nodejs') { params.onServer(); return; }
      else                                 { params.onEdgeServer(); return; }
    }

So `proxy.ts` runs on **Node**, unconditionally, while `middleware.ts` runs on the **Edge** unless
its runtime is set explicitly. This file holds the sign-in UX redirect and, through its
`auth.config.ts` import, one of the three entry points that invoke `assertBypassNotInProduction`.
Next hard-errors if both files exist, so there is no incremental migration.

The export contract also changes: Next resolves
`(isProxy ? mod.proxy : mod.middleware) || mod.default`, so the export must be renamed to `proxy` or
the build throws `ProxyMissingExportError` — something `tsc` cannot catch.

## Decision

Adopt `proxy.ts`, exporting `proxy`, keeping the existing matcher and the `auth.config.ts` import.
Delete `middleware.ts` in the same commit.

The deploy target settles it. ADR-0009 puts this application in a container on Azure Container Apps
running Node, with no Edge network anywhere in the topology. The Edge bundle is dead weight there,
and Node is the runtime that actually serves the guard.

## Consequences

### Positive

- The build warning is gone, and the file convention matches the framework's supported direction
  rather than a deprecated one.
- The guard runs on the same runtime as the rest of the server, so there is one execution
  environment to reason about instead of two.
- Node lifts the Edge runtime's API restrictions for anything this file needs later.

### Negative

- **It is a behavioural change on the auth path**, which is the most sensitive path in the system.
  The mitigation is that `apps/api` — not this file — is the security boundary, plus the full
  Playwright suite as a gate.
- Node middleware runs in the server process rather than at the edge, so it cannot short-circuit
  before reaching the origin. Irrelevant here: there is no CDN or edge tier in ADR-0009's topology.

## Alternatives considered

### Rejected — keep `middleware.ts` and live with the deprecation warning

Zero risk today, and the file works. Rejected because the warning is a deprecation, not a style
note: the convention will be removed, and the migration would then land in whichever plan is least
able to absorb an auth-path change. Doing it here — where the container that settles the runtime
question is being built, and where a full Playwright run is already part of the task — is the
cheapest this ever gets. Carrying a known-required change forward also means every future
`next build` log has a warning in it, which is how real warnings get missed.

### Rejected — keep `middleware.ts` and pin `runtime: 'nodejs'`

The subtle one, and genuinely tempting: `isMiddlewareFile` with `pageRuntime === 'nodejs'` also
routes to `onServer()`, so this achieves the Edge → Node move with a one-line config addition and
no rename. Rejected because it takes the runtime change *without* the deprecation fix — the file
convention is still the deprecated one, the warning still prints, and the migration is still owed.
It is strictly the worse half of the same work, and it leaves the codebase in a state where a
future reader sees a `nodejs` runtime pin and cannot tell whether it was deliberate or a
workaround.

### Rejected — delete the file entirely and rely on `apps/api`

Defensible on security grounds: this file is explicitly *not* the security boundary, and
`apps/api`'s global fail-closed hook is. Rejected because the redirect is a UX affordance, not a
control — without it, an unauthenticated user reaches a page shell that then fails its data fetch,
instead of landing on `/signin`. Deleting it would also remove one of the three entry points that
invoke `assertBypassNotInProduction`, narrowing that guard's coverage for no gain.

## Revisit when

- **An edge tier or CDN is introduced**, at which point running the redirect at the edge would
  genuinely save an origin round trip.
- **Next stabilises a different convention again** — the same analysis applies: check
  `runDependingOnPageType`, do not assume it is a rename.
```

- [ ] **Step 11: Run the full verification set**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: clean; `apps/web`'s unit count at or above its baseline.

- [ ] **Step 12: Commit**

```bash
git add -A apps/web docs/adr/0013-proxy-over-middleware.md
git commit -m "refactor(web)!: move the auth guard from middleware.ts to proxy.ts

Not a rename. Per next/dist/build/entries.js, isProxyFile routes to onServer()
while isMiddlewareFile routes to onEdgeServer(), so this moves the guard from
the Edge runtime to Node. Next hard-errors if both files exist, so the deletion
is part of the same change.

The export must be named \`proxy\`: Next resolves
(isProxy ? mod.proxy : mod.middleware) || mod.default and throws
ProxyMissingExportError otherwise — which tsc cannot catch, so test/proxy.test.ts
asserts the export shape directly.

The deploy target settles the runtime question: ADR-0009 runs this in a
container with no Edge network. ADR-0013 records it against keeping the
deprecated file, against pinning runtime: 'nodejs' on middleware.ts, and against
deleting the redirect entirely.

Verified with a real next build and the full Playwright suite, not tsc — plain
tsc missed a middleware export-shape error for four tasks in Plan 3.

Closes Plan 4 inherited obligation 3.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Next.js standalone output

**Files:**
- Modify: `apps/web/next.config.ts`

**Interfaces:**
- Produces: `apps/web/.next/standalone/apps/web/server.js` and
  `apps/web/.next/standalone/node_modules`, which Task 7's `web` image target copies.

**Why.** A standalone build traces exactly the files the server needs and emits a self-contained
tree, which is what keeps the image small — and image size is cold-start time, which ADR-0009 D5
makes a routine cost rather than a deploy-only one. In a pnpm workspace, tracing must be rooted at
the repository root or it misses workspace dependencies, producing an image that builds and then
fails at runtime on a missing module.

- [ ] **Step 1: Update the config**

Replace `apps/web/next.config.ts`:

```ts
import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server tree at .next/standalone, so the runtime
  // image carries only what the server actually needs. Image size is cold-start
  // time, and ADR-0009 D5 scales this app to zero at rest.
  output: "standalone",
  // MUST be the repository root. Next traces from the app directory by default,
  // which in a pnpm workspace misses @irp/client and the hoisted node_modules —
  // producing an image that builds fine and then fails at runtime on a missing
  // module.
  outputFileTracingRoot: path.join(import.meta.dirname, "..", ".."),
  // @irp/client is bundler-only: it ships runtime code as raw TypeScript with
  // noEmit, so Next must compile it. apps/api cannot load it at all.
  transpilePackages: ["@irp/client"],
  typedRoutes: true,
};

export default nextConfig;
```

**If `import.meta.dirname` is `undefined`** — it depends on how Next loads the config — fall back to
`path.resolve(process.cwd(), "..", "..")`, which is correct because `next build` runs with
`apps/web` as its working directory under `pnpm --filter`. Verify in Step 2 rather than guessing;
record which one you used.

- [ ] **Step 2: Build and verify the standalone tree**

```bash
AUTH_DEV_BYPASS=false pnpm --filter @irp/web build
ls apps/web/.next/standalone
ls apps/web/.next/standalone/apps/web/server.js
ls apps/web/.next/standalone/node_modules | head
```

Expected: `standalone/` exists, contains `apps/web/server.js`, and contains a `node_modules`
directory at its root. If `node_modules` is missing or tiny, `outputFileTracingRoot` is wrong —
fix it before continuing, because Task 7 depends on this layout exactly.

- [ ] **Step 3: Prove the standalone server actually runs**

A tree that exists is not a tree that boots. From the repository root (PowerShell):

```powershell
$env:AUTH_SECRET = "local-only-secret-at-least-32-bytes-x"
$env:AUTH_URL = "http://localhost:3000"
$env:API_BASE_URL = "http://127.0.0.1:3001"
$env:PORT = "3000"
node apps/web/.next/standalone/apps/web/server.js
```

Then, in another terminal:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/signin
```

Expected: `200`. Stop the server afterwards.

This is the step that catches a bad tracing root, and it catches it here rather than inside a
Docker build where the feedback loop is minutes long.

- [ ] **Step 4: Confirm the existing suites still pass**

```bash
pnpm --filter @irp/web test
```

Expected: PASS, count unchanged from Task 3.

```powershell
Set-Location apps/web; pnpm exec playwright test
```

Expected: 5 specs pass. Playwright drives `next dev`, which ignores `output`, so this should be
unaffected — confirm rather than assume.

- [ ] **Step 5: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "build(web): emit a standalone server tree for the container image

output: 'standalone' produces a self-contained server at .next/standalone, so
the runtime image carries only traced files. Image size is cold-start time, and
ADR-0009 D5 scales this app to zero at rest.

outputFileTracingRoot is pinned to the repository root: tracing from apps/web
misses @irp/client and the hoisted node_modules in a pnpm workspace, which
produces an image that builds and then fails at runtime on a missing module.

Verified by booting the emitted server directly and fetching /signin, not just
by checking the directory exists.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `.dockerignore`, the shared build stages, and the `migrate` target

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile` (stages `base`, `deps`, `generated`, `migrate`)

**Interfaces:**
- Produces: build stages `base`, `deps`, `generated` — Tasks 6 and 7 add `build`, `prod-deps`,
  `api` and `web` on top of them. Target `migrate`, used by Task 8's compose file with
  `target: migrate`.

**Why `migrate` is a separate image.** ADR-0009 D3 runs `prisma migrate deploy` as a Container Apps
Job. The API's runtime image carries production dependencies only, and the Prisma CLI is a
devDependency — so the API image *cannot* run migrations. Building this target now means Plan 4B
inherits it rather than discovering the gap inside a deploy pipeline.

**Facts established during planning — rely on them.**

- The generated Prisma client is **nine pure-TypeScript files** under
  `apps/api/src/generated/prisma/` — no engine binaries, no wasm (Prisma 7 with a driver adapter,
  ADR-0008). `apps/api/tsconfig.json` includes `src/**/*`, so `tsc` compiles them into
  `dist/generated/prisma/`, and `dist/db/client.js` resolves `../generated/prisma/client.js` inside
  `dist/`. **The API runtime image therefore needs `apps/api/dist` only** — not `src/generated`.
- `packages/types/src` and `packages/client/src` are ignored by **nested** `.gitignore` files
  (`packages/types/.gitignore`, `packages/client/.gitignore`), not by the root one.
- **`apps/web/public/` does not exist.** A `COPY` of it fails the build.

- [ ] **Step 1: Write `.dockerignore`**

Create `.dockerignore` at the repository root:

```
# Load-bearing, not hygiene. If a host copy of a generated package leaks into
# the build context it is not necessarily overwritten by regeneration — stale
# extra files survive — and the image silently ships a different contract from
# spec/openapi.yaml. The `generated` stage asserts these are absent; this file
# is what makes that assertion pass.
packages/types/src
packages/client/src
apps/api/src/generated

# Host build output and dependencies. Copying these in would defeat layer
# caching, mix Windows-built artefacts into a Linux image, and — for
# node_modules — bring native binaries built for the wrong platform.
node_modules
**/node_modules
**/dist
**/.next
**/*.tsbuildinfo

# Never in an image.
.env
.env.*
!.env.example

# Irrelevant to a build; excluded to keep the context small and the cache stable.
.git
.github
.superpowers
docs
tests
**/coverage
**/test-results
**/playwright-report
**/.playwright
*.md
!README.md
```

- [ ] **Step 2: Write the Dockerfile's shared stages and `migrate` target**

Create `Dockerfile` at the repository root:

```dockerfile
# syntax=docker/dockerfile:1.7
#
# One build graph, several final targets. Both application images come from the
# SAME `generated` stage on purpose: types and the client SDK are generated from
# spec/openapi.yaml, and two images built from two generation runs would be a
# contract-drift bug with no runtime symptom.
#
# Build from the REPOSITORY ROOT:
#   docker build --target api     -t irp-api     .
#   docker build --target web     -t irp-web     .
#   docker build --target migrate -t irp-migrate .

##############################  base  ##############################
# node:24-slim, not alpine. Debian/glibc matches Prisma's
# debian-openssl-3.0.x binary target; musl needs a different target and fails
# at runtime rather than at build time.
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /repo

##############################  deps  ##############################
# Manifests and the lockfile ONLY, so this layer is cached until a dependency
# actually changes. Copying source here would rebuild the dependency tree on
# every edit and put NFR-5's 8-minute budget at risk.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json        ./apps/api/package.json
COPY apps/web/package.json        ./apps/web/package.json
COPY packages/core/package.json   ./packages/core/package.json
COPY packages/types/package.json  ./packages/types/package.json
COPY packages/client/package.json ./packages/client/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

###########################  generated  ############################
FROM deps AS generated
# prisma generate resolves env("DATABASE_URL") through prisma.config.ts from the
# real process env — Prisma 7 dropped implicit .env loading, so a bare
# `prisma generate` fails PrismaConfigEnvError. The value only has to PARSE;
# generate never connects. This is a throwaway.
ARG DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV DATABASE_URL=${DATABASE_URL}

COPY tsconfig.base.json redocly.yaml ./
COPY spec/ ./spec/
COPY packages/types/ ./packages/types/
COPY packages/client/ ./packages/client/
COPY apps/api/prisma/ ./apps/api/prisma/
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts

# Gate: the build context must never carry generated output. .dockerignore is
# what keeps it out; this proves .dockerignore is still doing its job. A stale
# generated file that survives into the image is a second version of the
# contract, and it has no runtime symptom until something deserialises wrong.
#
# Only these two paths: they are the only generated-output paths this stage
# actually copies (packages/types/ and packages/client/, above). apps/api/src
# is never copied here at all, so apps/api/src/generated could never arrive
# through this stage regardless of .dockerignore — checking for it here would
# be a gate that always passes for a reason unrelated to correctness. That
# check belongs in the `build` stage (Task 6), immediately after its
# `COPY apps/api/ ./apps/api/`, which is the first point a leak in that path
# could actually reach an image.
RUN set -eu; \
    for leaked in packages/types/src packages/client/src; do \
      if [ -e "$leaked" ]; then \
        echo "FATAL: $leaked arrived from the build context."; \
        echo "Generated output must be produced in-image, never copied in."; \
        echo "Check .dockerignore — this is a regression, not a warning."; \
        exit 1; \
      fi; \
    done

RUN mkdir -p packages/types/src packages/client/src
RUN pnpm generate
RUN pnpm --filter @irp/api exec prisma generate

#############################  migrate  #############################
# A SEPARATE image because ADR-0009 D3 runs migrations as a Container Apps Job.
# It builds FROM deps, not from the api target: `prisma` is a devDependency, so
# the production-only API image cannot run `prisma migrate deploy` at all.
FROM deps AS migrate
ENV NODE_ENV=production
# Prisma writes to a cache directory; give the non-root user somewhere writable.
ENV HOME=/tmp
COPY apps/api/prisma/ ./apps/api/prisma/
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
USER node
WORKDIR /repo/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
```

- [ ] **Step 3: Build the `migrate` target**

```bash
docker build --target migrate -t irp-migrate .
```

Expected: builds successfully. If `pnpm generate` fails because a directory is missing, the
`mkdir -p` line is the fix — it is already there; check the error before changing anything else.

- [ ] **Step 4: Prove the leak gate goes red — for both paths it can actually see**

This is a new gate, so demonstrate it fails before trusting it. The loop only checks
`packages/types/src` and `packages/client/src` — those are the only generated-output paths this
stage copies (`apps/api/src/generated` is never reachable here at all; that path's check lives in
Task 6 instead, immediately after the `COPY apps/api/ ./apps/api/` that could actually carry it).
Demonstrate **both** paths this stage can see, not just one — a check that was only ever tested on
one of two loop entries has not been shown to cover the other.

For `packages/types/src`:

```bash
mkdir -p packages/types/src && echo "// leaked" > packages/types/src/schema.ts
docker build --target generated -t irp-leak-test-types . 2>&1 | tail -20
```

Expected: **PASS** — `.dockerignore` excludes `packages/types/src`, so the file never arrives and
the leak-detection `RUN` never sees it. That is the correct behaviour and it proves
`.dockerignore` works. To prove the *guard itself* fires, temporarily comment out the
`packages/types/src` line in `.dockerignore`, re-run the build, confirm it **FAILS** with
`FATAL: packages/types/src arrived from the build context.`, then restore the line and confirm it
**passes** again.

Repeat the same three-state cycle for `packages/client/src`:

```bash
mkdir -p packages/client/src && echo "// leaked" > packages/client/src/schema.ts
docker build --target generated -t irp-leak-test-client . 2>&1 | tail -20
```

Expected: **PASS** with `.dockerignore` intact, **FAIL** with `FATAL: packages/client/src arrived
from the build context.` once its line is commented out, **PASS** again once restored.

**Record all six outcomes in the task report** — pass/fail/pass for each of the two paths. One
path demonstrated and the other assumed proves nothing about the one left untested.

Delete both leaked files and any test images afterward.

- [ ] **Step 5: Prove the migration image actually migrates**

Against the local database (PowerShell). The container needs to reach the host's Postgres, so use
`host.docker.internal`:

```powershell
$env:IRP_DB_PORT = "5433"
docker compose -f apps/api/docker-compose.yml up -d
docker run --rm -e DATABASE_URL="postgresql://irp:irp@host.docker.internal:5433/irp?schema=public" irp-migrate
```

Expected: Prisma reports the migrations already applied (or applies them), and the container exits
**0**. Confirm with `echo $LASTEXITCODE` → `0`.

If `host.docker.internal` does not resolve, add `--add-host=host.docker.internal:host-gateway`.

- [ ] **Step 6: Commit**

```bash
git add .dockerignore Dockerfile
git commit -m "build: shared image stages and a separate migration image

base -> deps -> generated, shared by every target so both application images
come from the SAME generation run of spec/openapi.yaml. Two images built from
two generations would be contract drift with no runtime symptom.

The migrate target is separate because ADR-0009 D3 runs migrations as a
Container Apps Job and the Prisma CLI is a devDependency — the production-only
API image cannot run migrate deploy at all.

The generated stage asserts that no generated output arrived from the build
context. Demonstrated red by removing the matching .dockerignore line.

node:24-slim rather than alpine: glibc matches Prisma's debian-openssl-3.0.x
target, and musl fails at runtime rather than at build time.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The `build` stage and the `api` image

**Files:**
- Modify: `Dockerfile` (append stages `build`, `prod-deps`, `api`)

**Interfaces:**
- Consumes: stages `base`, `deps`, `generated` from Task 5.
- Produces: stage `build` (used by Task 7's `web` target) and target `api`, used by Task 8's
  compose file.

- [ ] **Step 1: Append the `build`, `prod-deps` and `api` stages**

**Correction found during execution (Task 6):** the leak check below is written as a bare
existence test — `[ -e apps/api/src/generated ]` — mirroring the `generated` stage's pattern for
`packages/types/src` and `packages/client/src`. That pattern does not transfer: `build` is `FROM
generated`, and the `generated` stage's own `RUN pnpm --filter @irp/api exec prisma generate`
already materialises `apps/api/src/generated/prisma/*` in-image before `build` starts, so the
path is never absent here to test against — an existence check trips on every build, leak or not.
Verified empirically: a plain `docker build --target api` failed at this exact `RUN` before any
deliberate leak existed. The fix hashes the path's contents before the `COPY`s and diffs after,
so the gate detects an actual change rather than mere presence — which also correctly catches the
sharper risk (a same-named stale host file silently overwriting a freshly generated one) that a
presence check could never see either way. The FATAL message text is unchanged, so Step 3's
three-outcome demonstration still applies verbatim.

**Corrections found during review (fix pass, after the initial Task 6 commit):**

1. **The Prisma `.ts`/extensionless import problem is not a Linux-vs-Windows quirk — it is
   tsconfig discovery.** The original Task 6 report attributed Prisma emitting `./enums.ts`
   vs. `./enums` to the build OS — the plan itself never made that claim. That is
   false: `prisma-client`'s generator (`rBe`/`UBt` in the installed `prisma@7.9.1` CLI) picks the
   extension based on whether it finds a tsconfig near the output directory — no tsconfig found
   emits `.ts` (Docker's `generated` stage never copies `apps/api/tsconfig.json`, hitting this
   branch); a tsconfig found with `moduleResolution: "Bundler"` emits extensionless (a local
   `prisma generate`, which sees `tsconfig.base.json`, hits this branch instead). **Both variants
   are equally unrunnable by plain `node`** — verified directly: rebuilding `apps/api/dist` against
   the on-disk extensionless client and running `node apps/api/dist/index.js` reproduced
   `ERR_MODULE_NOT_FOUND: Cannot find module '.../dist/generated/prisma/enums'`, the same failure
   class as the `.ts` variant the original report captured in a Linux container. The
   `allowImportingTsExtensions`/`rewriteRelativeImportExtensions` fix added to
   `apps/api/tsconfig.json` also only rewrites specifiers that already carry a TS extension — it
   does nothing for the extensionless variant, so the original report's claim that it fixed "any
   future plain-`node` execution of `apps/api`'s compiled output" was not true either. **Fix:**
   revert both compiler options from `apps/api/tsconfig.json`, and instead add
   `importFileExtension = "js"` to the `generator client` block in `apps/api/prisma/schema.prisma`.
   Prisma then emits `./enums.js` in every context — tsconfig visible or not — which
   `moduleResolution: "Bundler"` resolves via TypeScript's `.js` → `.ts` substitution (what
   `apps/api/src/db/client.ts:2` already relies on), and which is exactly what `tsc` leaves alone
   on emit. This also makes Prisma generation deterministic across environments, closing a
   contract-drift hazard the Dockerfile's own `generated`-stage comment already warns about.
2. **`prod-deps`'s install must be filtered.** The step below originally ran an unfiltered
   `pnpm install --frozen-lockfile --prod` over all five workspace manifests, so `api`'s
   `COPY --from=prod-deps /repo/ ./` carried `apps/web`'s entire production dependency tree
   (`next`, `next-auth`, `react`) into an image that never imports any of it — confirmed at
   **1.38GB** for `irp-api` before the fix. **Fix:** `--filter @irp/api...` scopes the install to
   `@irp/api` and its workspace dependencies. All five manifest `COPY`s stay (`--frozen-lockfile`
   checks the whole workspace against the lockfile regardless of `--filter` scope and errors on a
   missing manifest), with `apps/web/package.json` now noted as copied for lockfile completeness
   only. This does not touch the whole-tree `COPY --from=prod-deps /repo/ ./` in the `api` stage —
   that copy's symlink-safety property comes from copying the tree wholesale, not from the
   install's scope, so it is unaffected by narrowing what's installed into that tree. Rebuilt size:
   **917MB**.
3. **The generated-manifest leak check (Defect 1's fix, above) widened to catch two more leak
   shapes.** `find -type f | sha256sum` alone misses a leaked **empty directory** (nothing to hash)
   and a leaked **symlink** (`sha256sum` only reads regular files). The manifest commands below now
   also list directories and record each symlink's target, so either shape still changes the diff.
   The two `/tmp/generated-src.{before,after}` scratch files are now removed at the end of the
   second `RUN` (the one that consumes them) rather than left in the `build` layer.

The Dockerfile code block below reflects all of the above as currently committed.

Append to `Dockerfile`:

```dockerfile
##############################  build  ##############################
FROM generated AS build
ARG APP_VERSION=0.0.0
ENV APP_VERSION=${APP_VERSION}
# Explicit rather than merely absent. next build sets NODE_ENV=production, and
# assertBypassNotInProduction correctly refuses to build with the flag on — so
# state the safe value instead of depending on it being unset.
ENV AUTH_DEV_BYPASS=false
# Build stage ONLY; never copied into a final image. Auth.js requires a secret
# to exist while prerendering. The real one is injected at runtime.
ENV AUTH_SECRET=build-only-placeholder-not-a-runtime-secret

# apps/api/src/generated already exists at this point in `build` — the
# `generated` stage's own `RUN pnpm --filter @irp/api exec prisma generate`
# put it there in-image, and `build` inherits it via `FROM generated`. A bare
# existence check (Task 5's pattern for packages/types/src and
# packages/client/src) CANNOT detect a leak here, because unlike those two
# paths, this one is never structurally absent in this stage — it exists
# before the COPYs below even run. Hash its contents first, so the gate that
# follows the COPYs can tell "changed because of the COPY" apart from "was
# already here, generated in-image" — the actual risk this guards against is
# a stale host copy silently overwriting a same-named freshly generated file,
# which an existence check would never see either way.
#
# The manifest is more than `find -type f | sha256sum`: a bare file hash
# misses two leak shapes entirely — a leaked EMPTY DIRECTORY has no file
# inside to hash, and sha256sum only reads regular files, so a leaked
# SYMLINK would not change a single hash either. Listing directories and
# recording each symlink's target alongside the file hashes means either
# shape still changes the diff below.
RUN { find apps/api/src/generated -type f -exec sha256sum {} + | sort; \
      find apps/api/src/generated -type d | sort; \
      find apps/api/src/generated -type l -exec sh -c 'printf "%s -> %s\n" "$1" "$(readlink "$1")"' sh {} \; | sort; \
    } > /tmp/generated-src.before

COPY packages/core/ ./packages/core/
COPY apps/api/ ./apps/api/
COPY apps/web/ ./apps/web/

# Gate: apps/api/src/generated must never arrive — or be altered — via the
# build context. The `generated` stage's leak check (Task 5) cannot cover
# this path at all, since that stage never copies apps/api/src; this is the
# first (and only) stage where a leak in it could actually reach an image,
# so the comparison runs immediately after the COPY that could carry it.
RUN set -eu; \
    { find apps/api/src/generated -type f -exec sha256sum {} + | sort; \
      find apps/api/src/generated -type d | sort; \
      find apps/api/src/generated -type l -exec sh -c 'printf "%s -> %s\n" "$1" "$(readlink "$1")"' sh {} \; | sort; \
    } > /tmp/generated-src.after; \
    if ! diff -q /tmp/generated-src.before /tmp/generated-src.after > /dev/null; then \
      echo "FATAL: apps/api/src/generated arrived from the build context."; \
      echo "Generated output must be produced in-image, never copied in."; \
      echo "Check .dockerignore — this is a regression, not a warning."; \
      exit 1; \
    fi; \
    rm -f /tmp/generated-src.before /tmp/generated-src.after

RUN pnpm --filter @irp/core build
# Declaration-only emit. apps/web resolves TYPES from dist/*.d.ts so it can stay
# fully strict; without this its tsc pulls generated runtime into its own
# program. Must precede the web build.
RUN pnpm --filter @irp/client build
RUN pnpm --filter @irp/api build
RUN pnpm --filter @irp/web build

############################  prod-deps  ############################
# A second, production-only dependency tree. Kept separate from `deps` so the
# api image never carries devDependencies — image size is cold-start time under
# ADR-0009 D5's scale-to-zero.
#
# All five manifests are still copied — pnpm --frozen-lockfile checks the
# whole workspace against pnpm-lock.yaml and complains about missing
# manifests otherwise — but apps/web/package.json is copied for LOCKFILE
# COMPLETENESS only, not because the api image needs anything web resolves.
# --filter @irp/api... scopes the actual install to @irp/api and its
# workspace dependencies (packages/core), so next/next-auth/react never
# enter this stage's node_modules at all. Without the filter this install
# pulled in apps/web's entire production dependency tree too, and the api
# image it fed was 1.38GB — a filtered install brought it down without
# touching the whole-tree COPY below, which is what actually protects the
# pnpm symlinks (see the comment on that COPY in the `api` stage).
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json        ./apps/api/package.json
COPY apps/web/package.json        ./apps/web/package.json
COPY packages/core/package.json   ./packages/core/package.json
COPY packages/types/package.json  ./packages/types/package.json
COPY packages/client/package.json ./packages/client/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @irp/api...

###############################  api  ###############################
FROM base AS api
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    PORT=3001 \
    APP_VERSION=${APP_VERSION}

# Whole-tree copy on purpose. prod-deps contains only manifests and
# node_modules, and copying it wholesale preserves pnpm's relative symlinks
# (apps/api/node_modules/@irp/core -> ../../../packages/core) which
# path-by-path copies would break. It also avoids a COPY of
# packages/core/node_modules, which does not exist under --prod because
# @irp/core has devDependencies only — and a COPY of a missing path fails.
COPY --from=prod-deps /repo/ ./

# tsc compiles src/generated/prisma into dist/generated/prisma, and
# dist/db/client.js resolves ../generated/prisma/client.js inside dist/. So
# dist alone is sufficient; src/generated is NOT needed at runtime.
COPY --from=build /repo/packages/core/dist ./packages/core/dist
COPY --from=build /repo/apps/api/dist ./apps/api/dist

USER node
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Build the api image**

```bash
docker build --target api -t irp-api --build-arg APP_VERSION="$(git rev-parse --short HEAD)" .
```

Expected: builds successfully.

- [ ] **Step 3: Prove the `build`-stage leak gate goes red**

This is a new gate (it covers `apps/api/src/generated`, the one path the `generated` stage's gate
in Task 5 could never see, since that stage never copies `apps/api/src` at all). Demonstrate it
fails before trusting it, the same way Task 5 Step 4 did for its two paths.

```bash
mkdir -p apps/api/src/generated && echo "// leaked" > apps/api/src/generated/schema.ts
docker build --target build -t irp-leak-test-build . 2>&1 | tail -20
```

Expected: **PASS** — `.dockerignore` excludes `apps/api/src/generated`, so the file never arrives
and the leak-detection `RUN` never sees it. To prove the *guard itself* fires, temporarily comment
out the `apps/api/src/generated` line in `.dockerignore`, re-run the build, confirm it **FAILS**
with `FATAL: apps/api/src/generated arrived from the build context.`, then restore the line and
confirm it **PASSES** again.

**Record all three outcomes in the task report.** Delete the leaked file and any test images
afterward.

- [ ] **Step 4: Run it and check `/health`**

The API needs a reachable database only lazily, but `loadConfig` requires all four variables to be
present (PowerShell):

```powershell
docker run --rm -d --name irp-api-test -p 3001:3001 `
  -e DATABASE_URL="postgresql://irp:irp@host.docker.internal:5433/irp?schema=public" `
  -e JWKS_URI="https://jwks.invalid/keys" `
  -e JWT_ISSUER="https://issuer.test/v2.0" `
  -e JWT_AUDIENCE="api://irp-test" `
  irp-api
Start-Sleep -Seconds 5
curl.exe -s http://127.0.0.1:3001/health
```

Expected: a 200 JSON body whose version field is the short git SHA passed as `APP_VERSION`. That
field is what will answer *"did the rollback take?"* in Plan 4B.

- [ ] **Step 5: Prove the container drains on a real `SIGTERM`**

This is the genuine proof of Task 2 — `docker stop` sends a real `SIGTERM`, which
`Stop-Process` on Windows does not.

```powershell
docker logs -f irp-api-test
```

In another terminal:

```powershell
Measure-Command { docker stop irp-api-test }
docker inspect irp-api-test --format '{{.State.ExitCode}}'
```

Expected: the logs show `received SIGTERM, draining` then `shutdown complete`; the stop returns in
**well under 10 seconds** (Docker's default kill timeout); the exit code is **0**.

An exit code of `137` means `SIGKILL` — the handler did not run, or the drain hung. Do not proceed;
go back to Task 2. Record the measured duration and exit code in the report.

Clean up:

```powershell
docker rm -f irp-api-test 2>$null
```

- [ ] **Step 6: Check the image has no devDependencies**

```bash
docker run --rm --entrypoint sh irp-api -c "ls node_modules | grep -E '^(vitest|tsx|prisma|typescript|next)$' || echo 'clean: no devDependencies'"
```

Expected: `clean: no devDependencies`. If `prisma` (the CLI) appears, `--prod` did not take effect
and the image is carrying the whole toolchain — fix before committing. `next` is in the pattern
because the fix-pass `--filter @irp/api...` on `prod-deps`'s install (above) is specifically what
keeps it out; its absence here is evidence the filter took effect, not just that devDependencies
were excluded.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile
git commit -m "build(api): production image from the shared build graph

Adds the build stage (core -> client declarations -> api -> web, in that order,
because apps/web resolves @irp/client TYPES from dist) and a production-only
api target.

prod-deps is copied whole rather than path-by-path: that preserves pnpm's
relative symlinks, and avoids a COPY of packages/core/node_modules, which does
not exist under --prod because @irp/core has devDependencies only.

The image carries apps/api/dist alone. tsc compiles src/generated/prisma into
dist/generated/prisma and dist/db/client.js resolves it inside dist, so the
generated source is not needed at runtime.

The build stage asserts apps/api/src/generated never arrived from the build
context, immediately after the COPY that could carry it — the generated
stage's own leak gate (Task 5) cannot cover this path, since it runs before
any apps/api/src COPY exists. Demonstrated red by removing the matching
.dockerignore line.

APP_VERSION is a build arg set to the git SHA, surfaced by /health — that is
what makes 'did the rollback take?' answerable in Plan 4B.

Verified: /health reports the SHA, and docker stop drains with exit code 0 in
under the kill timeout — a real SIGTERM, which Windows Stop-Process cannot send.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The `web` image

**Files:**
- Modify: `Dockerfile` (append the `web` target)
- Create: `apps/web/instrumentation.ts` (the boot-time bypass guard — see Step 4)
- Create: `apps/web/test/instrumentation.test.ts`

**Interfaces:**
- Consumes: stage `build` from Task 6, and the standalone layout from Task 4.
- Produces: target `web`, used by Task 8's compose file. Also produces a **fourth**
  entry point for `assertBypassNotInProduction`, alongside `auth.ts`, `proxy.ts` and
  `app/api/dev-jwks/route.ts`. Task 10 owns updating CLAUDE.md's guard prose to say four.

**CORRECTION 3 (applied 2026-07-30, decided by the user).** As originally written this task
was Dockerfile-only and Step 4 expected the container to exit non-zero on
`AUTH_DEV_BYPASS=true`. It did not, and the reason is structural rather than a defect in the
guard — see Step 4. Closing it needs an `apps/web` source file, so the file list above grew.
Two facts were established empirically and neither was guessable from the code:
1. A standalone `next start` does not import route modules at boot, so the module-scope guard
   in `auth.config.ts` first fires on the first matching **request**, not at startup.
2. **Throwing from `register()` does not stop the server.** Next catches the hook's rejection,
   logs `An error occurred while loading the instrumentation hook`, and its own process-level
   `unhandledRejection` listener pre-empts Node's default crash-on-unhandled-rejection. The
   container was observed still `Up`, exit code `0`. An explicit `process.exit(1)` is what
   makes "refuses to start" true here.

**Layout fact from Task 4.** A monorepo standalone build emits
`apps/web/.next/standalone/apps/web/server.js` plus `apps/web/.next/standalone/node_modules`.
Copying `standalone/` to `/repo` therefore yields `/repo/apps/web/server.js` and
`/repo/node_modules`. **`apps/web/public/` does not exist in this repository — do not COPY it.**

- [ ] **Step 1: Append the `web` target**

Append to `Dockerfile`:

```dockerfile
###############################  web  ###############################
FROM base AS web
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone tree is already self-contained: Next traced exactly the files
# the server needs (outputFileTracingRoot is the repo root — see
# apps/web/next.config.ts). In a monorepo it emits apps/web/server.js and a
# node_modules at its own root, so copying it to /repo reproduces that layout.
COPY --from=build /repo/apps/web/.next/standalone/ ./
# Static assets are deliberately NOT traced into standalone and must be copied
# separately, or every /_next/static request 404s and the page renders unstyled.
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

# NOTE: there is no apps/web/public/ in this repository. A COPY of it would
# fail the build. Add one here if that directory is ever created.

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 2: Build the web image**

```bash
docker build --target web -t irp-web .
```

Expected: builds successfully. A failure on the `COPY --from=build .../standalone/` line means
Task 4's build did not emit a standalone tree — go back and fix that, not this.

- [ ] **Step 3: Run it and check the sign-in page**

```powershell
docker run --rm -d --name irp-web-test -p 3000:3000 `
  -e AUTH_SECRET="container-only-secret-at-least-32b" `
  -e AUTH_URL="http://localhost:3000" `
  -e API_BASE_URL="http://host.docker.internal:3001" `
  irp-web
Start-Sleep -Seconds 5
curl.exe -s -o NUL -w "%{http_code}`n" http://localhost:3000/signin
```

Expected: `200`.

Then confirm the static assets are actually served — this is what catches a missing
`.next/static` copy, and it is invisible from a status code on the HTML alone:

```powershell
docker logs irp-web-test
```

Expected: no 404s for `/_next/static/*`. Better, open `http://localhost:3000/signin` in a browser
and confirm it is **styled**, not unstyled HTML. Record which check you ran.

- [ ] **Step 4: Add the boot-time guard — `apps/web/instrumentation.ts`**

A containerised `next start` is a **brand-new entry point** for
`assertBypassNotInProduction`, and the module-scope call in `auth.config.ts` does not cover
it. `server.js` is a generic launcher: it reads `required-server-files.json`, opens a socket,
and requires route modules lazily on the first matching request. So with
`AUTH_DEV_BYPASS=true` the container starts, prints `Ready`, and stays `Up` — then 500s every
request once something touches a route.

That is fail-closed and no bypass session is reachable, but it is weaker than "refuses to
start", and it holds only because every reachable route happens to import the guard
transitively. That coincidence is exactly what did **not** hold in Plan 3, when
`/api/dev-jwks` served a live JWKS while `/` correctly 500'd.

Create `apps/web/instrumentation.ts`. Next calls `register()` once per runtime at boot.

Three things about its shape are load-bearing, all three measured:

- **The import of `@/auth.config` must be dynamic and inside the `try`.** `auth.config.ts`
  calls the guard at its own module scope, so a static top-level import throws during module
  evaluation of `instrumentation.ts` — before `register()` is entered, and outside any catch it
  could install. The observed stack frame was `at module evaluation`, not inside `register()`.
- **It must `process.exit(1)`, not throw.** See Correction 3 above. Throwing leaves the
  container `Up` with exit code `0`.
- **The export must be named exactly `register`.** A rename or default export silently never
  runs — an unguarded boot with no error. Pin it with a test.

Guard the exit for the Edge runtime, which has no `process.exit` (Next only builds an Edge
instrumentation bundle when Edge runtime code exists; since ADR-0013 `proxy.ts` runs on Node,
so there is currently none — but this file must not be what breaks if that changes).

Add `apps/web/test/instrumentation.test.ts`. Assert `process.exit(1)` with a spy, **not** a
thrown error — the exit call is the guarantee, so it is what gets pinned. Cover: the export
shape; production + bypass exits 1 and logs the message; `NODE_ENV=Production` capitalised
exits 1; the check happens at call time (import the module under a safe environment first, so
only the explicit call inside `register()` can fire); and a production boot **without** the
bypass does not exit — a false positive here takes production down, which is the opposite
failure and just as bad.

- [ ] **Step 5: Prove the container refuses to start**

```powershell
docker build --target web -t irp-web .
$out = & docker run --rm --name irp-web-bypass `
  -e AUTH_SECRET="container-only-secret-at-least-32b" `
  -e AUTH_URL="http://localhost:3000" `
  -e API_BASE_URL="http://host.docker.internal:3001" `
  -e AUTH_DEV_BYPASS=true irp-web 2>&1
"exit code: $LASTEXITCODE"
```

Expected: **exit code 1**, printing "AUTH_DEV_BYPASS is set in a production build. Refusing to
start.", with the process ending on its own and never serving a request.

**If it starts successfully and stays up, stop everything and investigate.** That is guard one
broken, and it means the dev bypass could reach a deployed environment. Do not work around it,
do not weaken the guard, and do not proceed to Task 8.

Also confirm the case-insensitivity of the `NODE_ENV` half:

```powershell
$out = & docker run --rm -e AUTH_SECRET="container-only-secret-at-least-32b" `
  -e AUTH_URL="http://localhost:3000" -e API_BASE_URL="http://host.docker.internal:3001" `
  -e AUTH_DEV_BYPASS=true -e NODE_ENV=Production irp-web 2>&1
"exit code: $LASTEXITCODE"
```

Expected: also `1`. Record both exit codes.

**Capture the exit code by assignment, not through a pipe.** Piping `docker run` into
`Select-String` or `Select-Object` makes `$LASTEXITCODE` reflect the cmdlet, not docker — it
reported `-1` for a run that genuinely exited `1`. Assign to `$out` and read `$LASTEXITCODE`
on the next line.

Then re-run Step 3 against the rebuilt image. Adding `instrumentation.ts` changes the
standalone tree, so the `/signin` and static-asset evidence from before this step is stale.

- [ ] **Step 6: Clean up**

```powershell
docker rm -f irp-web-test irp-web-bypass irp-web-bypass2 2>$null
```

- [ ] **Step 7: Verify and commit**

Required verification set (`pnpm typecheck` alone is NOT sufficient for `apps/web`):

```bash
pnpm --filter @irp/web test --run
pnpm lint
pnpm typecheck
AUTH_DEV_BYPASS=false pnpm --filter @irp/web build
```

Prove the new test actually fails before trusting it: empty `register()`'s body, confirm the
suite goes red, restore it. **`git checkout` cannot restore `instrumentation.ts` during this
task** — the file is still untracked, so back it up first and diff against the backup after.

```bash
git add Dockerfile apps/web/instrumentation.ts apps/web/test/instrumentation.test.ts \
        docs/superpowers/plans/2026-07-30-plan-4a-containerisation.md
git commit -m "build(web): standalone runtime image that refuses a production bypass

Copies the traced standalone tree plus .next/static — static assets are not
traced into standalone, and omitting them 404s every /_next/static request and
serves the page unstyled, which no status-code check would catch.

apps/web/public does not exist in this repository; a COPY of it would fail the
build, and the Dockerfile says so.

A containerised next start is a brand-new entry point for
assertBypassNotInProduction, and it was not covered. server.js requires route
modules lazily, so with AUTH_DEV_BYPASS=true the container started, printed
Ready, and stayed Up — 500ing every request instead of refusing to boot. That
is fail-closed but weaker than documented, and it held only because every
reachable route happens to import the guard transitively; Plan 3 already
shipped a case where that coincidence did not hold.

instrumentation.ts makes it structural: register() runs once at boot, on a path
no route can route around. It exits rather than throwing because throwing does
not stop a Next server — Next catches the hook's rejection and its own
unhandledRejection listener pre-empts Node's default crash, leaving the
container Up with exit code 0. Measured, not assumed.

Verified in the container: exit code 1 with AUTH_DEV_BYPASS=true, and also with
NODE_ENV=Production capitalised, both before serving any request.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: The local stack — `compose.yaml`

**Files:**
- Create: `compose.yaml`

**Interfaces:**
- Consumes: targets `migrate`, `api`, `web` from Tasks 5–7.
- Produces: the stack Task 9's CI job brings up.

**Leave `apps/api/docker-compose.yml` alone.** It is the db-only dev dependency referenced by
`handoff.md`, `docs/manual-setup-steps.md` §1.3a, `apps/web/e2e/README.md` and the database test
setup. Editing it breaks all of those for no gain.

- [ ] **Step 1: Write `compose.yaml`**

Create `compose.yaml` at the repository root:

```yaml
# The full stack as production-mode containers. Deliberately separate from
# apps/api/docker-compose.yml, which stays the db-only dev dependency that the
# test setup, the e2e README and manual-setup-steps.md all reference.
#
#   docker compose up --wait
#
# NOTE: there is no working sign-in here, and that is correct rather than a
# regression. Containers run NODE_ENV=production, so assertBypassNotInProduction
# refuses the dev bypass (ADR-0012), and no Entra directory exists yet. /signin
# renders with no provider behind it. Authenticated flows stay proven by the
# Playwright suite against `pnpm dev`.

services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: irp
      POSTGRES_PASSWORD: irp
      POSTGRES_DB: irp
    # No published host port on purpose: nothing on the host needs one, and
    # publishing would collide with apps/api/docker-compose.yml when both are up.
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U irp -d irp"]
      interval: 2s
      timeout: 5s
      retries: 15

  migrate:
    build:
      context: .
      target: migrate
    environment:
      DATABASE_URL: postgresql://irp:irp@db:5432/irp?schema=public
    depends_on:
      db:
        condition: service_healthy
    restart: "no"

  api:
    build:
      context: .
      target: api
      args:
        # Deliberately the ONLY place APP_VERSION reaches this service — do
        # not re-add it to `environment:` below. CI's /health assertion
        # exists to prove the build arg reached the image; runtime env alone
        # would satisfy that grep even if the Dockerfile stopped baking the
        # arg in, leaving the assertion green while testing nothing.
        APP_VERSION: ${APP_VERSION:-dev}
    init: true
    environment:
      NODE_ENV: production
      PORT: "3001"
      DATABASE_URL: postgresql://irp:irp@db:5432/irp?schema=public
      # Deliberately unresolvable. createRemoteJWKSet is LAZY — it performs no
      # network I/O at construction — so the API boots and serves /health
      # regardless. This only matters once a token arrives, which in this stack
      # never happens because there is no sign-in. Do not "fix" it.
      JWKS_URI: https://jwks.invalid/keys
      JWT_ISSUER: https://issuer.invalid/v2.0
      JWT_AUDIENCE: api://irp-progress-management
    ports:
      - "3001:3001"
    depends_on:
      migrate:
        condition: service_completed_successfully
    healthcheck:
      # node -e, not curl: node:24-slim ships neither curl nor wget.
      test:
        ["CMD", "node", "-e",
         "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 3s
      timeout: 5s
      retries: 20
      start_period: 5s

  web:
    build:
      context: .
      target: web
    init: true
    environment:
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: 0.0.0.0
      # Local-only. A real deployment injects this from a secret store.
      AUTH_SECRET: compose-only-secret-at-least-32-bytes
      AUTH_URL: http://localhost:3000
      API_BASE_URL: http://api:3001
      # AUTH_DEV_BYPASS is deliberately ABSENT. Setting it true here makes the
      # container refuse to start — see the guard test in the CI images job.
    ports:
      - "3000:3000"
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test:
        ["CMD", "node", "-e",
         "fetch('http://127.0.0.1:3000/signin').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 3s
      timeout: 5s
      retries: 20
      start_period: 5s
```

- [ ] **Step 2: Bring the stack up**

```bash
APP_VERSION="$(git rev-parse --short HEAD)" docker compose up --wait --build
```

Expected: all four services reach their target state; `migrate` exits 0; `api` and `web` report
healthy. `--wait` returns non-zero if any healthcheck fails.

- [ ] **Step 3: Verify the three behaviours the stack exists to prove**

```bash
# 1. The API is healthy and reports the build's version.
curl -s http://localhost:3001/health

# 2. Auth is fail-closed in production mode, with an RFC 7807 body.
curl -s -o /tmp/me.json -w '%{http_code}\n' http://localhost:3001/api/v1/me
cat /tmp/me.json

# 3. The web app serves its sign-in page.
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/signin
```

Expected: `200` with the git SHA; `401` with a `Content-Type: application/problem+json` body
carrying a `traceId`; `200`.

- [ ] **Step 4: Prove the compose gate can fail**

A healthcheck that has never gone red is not a gate. Temporarily point `migrate` at an
**unreachable** host:

```yaml
      DATABASE_URL: postgresql://irp:irp@10.255.255.1:5432/irp?schema=public
```

```bash
docker compose down -v
docker compose up --wait --build
echo "exit code: $?"
```

Expected: **non-zero**. `migrate` fails, so `api`'s `service_completed_successfully` condition is
never met and the stack never comes up.

**Do not use a nonexistent database on a reachable host.** Plan 2B proved that exits 0 — the
`postgres:16` image's superuser silently creates the database and applies the migrations. Restore
the correct URL afterwards and confirm the stack comes up again. Record both runs.

- [ ] **Step 5: Prove the stack drains on shutdown**

```bash
docker compose stop api
docker compose ps -a --format '{{.Service}} {{.ExitCode}}'
```

Expected: `api 0`. A `137` is `SIGKILL` and means the drain did not complete — go back to Task 2.

- [ ] **Step 6: Tear down and commit**

```bash
docker compose down -v
git add compose.yaml
git commit -m "build: full local stack as production-mode containers

db -> migrate -> api -> web, wired with service_healthy and
service_completed_successfully so \`docker compose up --wait\` is a real gate
rather than a start-and-hope.

The db port is deliberately unpublished — nothing on the host needs it, and
publishing would collide with apps/api/docker-compose.yml, which is left
untouched as the db-only dev dependency the test setup and e2e README reference.

Healthchecks use node -e rather than curl: node:24-slim ships neither curl nor
wget.

JWKS_URI is deliberately unresolvable and documented as such —
createRemoteJWKSet is lazy, so the API boots and serves /health regardless, and
no token ever arrives in this stack.

There is no working sign-in here. Containers run NODE_ENV=production, so
assertBypassNotInProduction refuses the dev bypass (ADR-0012) and no Entra
directory exists. That is the guard working, not a regression.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: The CI `images` job

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the `Dockerfile` targets and `compose.yaml` from Tasks 5–8.

**Why a separate job, not another matrix leg.** The existing `verify` job runs a three-timezone
matrix to catch reliance on server local time (NFR-12). Nothing about image building or container
startup is timezone-sensitive, so folding this in would triple the cost of the slowest job in the
workflow for zero extra coverage — against NFR-5's 8-minute budget.

**Where the build-stage gates live — CORRECTED, this was understated.** The spec names five
gates. Four are steps in this job. The fifth — the generated-output leak guard — is not one
`RUN` but **two**, and neither is a step in this job:

- the `generated` stage's check, narrowed in Task 5's fix pass to the **two reachable paths**
  (`packages/types/src`, `packages/client/src`) — the third was structurally inert there, since
  no `COPY` existed for a leak to arrive through;
- a **second** gate added in Task 6, in the `build` stage after its `COPY apps/api/`, asserting
  that `apps/api/src/generated`'s **content is unchanged** by the copies. An existence check
  cannot work there: `generated`'s own `prisma generate` legitimately pre-populates that path
  before `build` starts, so the check is a before/after content hash — which is strictly
  stronger, catching a host file silently *overwriting* a freshly generated one.

Both execute on **every** image build in this job rather than as separate steps. Both were
demonstrated red (Task 5 Step 4, Task 6). Do not re-prove them here, but note in the report that
they are enforced by all three build steps below. Note also that Task 6's fix pass **widened**
the leak gate's manifest commands (`-type d` and `-type l` passes) without re-running the
three-outcome demonstration against the widened version — this job's builds exercise its green
path.

**CORRECTION 4 (applied 2026-07-30, decided by the user after independent review of the merged
Task 9 job).** The reviewer found three soundness holes in this job's gate assertions, all fixed
here at the plan's source because the YAML below was prescribed verbatim and copied as-is:

1. **The bypass-refusal step had no timeout anywhere** — no `timeout` in the `run:` script, no
   step `timeout-minutes`, no job-level `timeout-minutes`. If the guard ever failed open (`next
   start` serving instead of exiting), `docker run` would block in the foreground forever, the
   step would never reach `code=$?`, and "Dump container logs" / "Tear down" would never run —
   burning the runner for GitHub's 360-minute default. **Fixed:** wrap the run in `timeout 60`,
   with exit code `124` (a hang) treated as its own distinct, clearly-labelled failure, separate
   from exit code `0` (a clean start).
2. **`if [ "$code" -eq 0 ]` treated any non-zero exit as proof the guard fired.** A missing env
   var, a bad `CMD`, or a corrupt layer would also exit non-zero, and the step would print
   "correct" while proving nothing about the dev-bypass guard — precisely the false-pass class
   gate 4 (below) exists to rule out for the 401 assertion, but was never applied here. **Fixed:**
   capture the container's output and require it to contain the guard's actual error string,
   `AUTH_DEV_BYPASS is set in a production build` (confirmed from a real green CI run; asserted as
   a substring so it stays robust to the rest of the sentence). A non-zero exit without that
   string now fails the step with its own `::error::` naming the gate as broken, not just the
   container.
3. **The `/health` version assertion could not detect the failure its own error message named.**
   `apps/api/src/config.ts` reads `APP_VERSION` at runtime, and `compose.yaml`'s `api` service set
   it **both** as a build arg and in `environment:`. The runtime env alone satisfied CI's grep, so
   deleting the Dockerfile's `ARG`/`ENV APP_VERSION` would have left the step green while its
   error message read "APP_VERSION did not reach the image" — untrue. **Fixed:** Task 8's
   `compose.yaml` no longer sets `APP_VERSION` in the api service's `environment:` block; only
   `build.args` remains, with a comment explaining why the runtime copy must stay absent. This is
   a sanctioned change to Task 8's file, decided here, not scope creep discovered later.

The YAML block in Step 1 below and Task 8 Step 1's `compose.yaml` block are both corrected to
match what was actually implemented, so a future reader copying either verbatim does not
reintroduce any of the three holes.

**CORRECTION 5 (applied 2026-07-30, from Task 9's re-review — the run that CORRECTION 4 was
never re-reviewed by).** CORRECTION 4's three fixes are all correctly implemented in
`.github/workflows/ci.yml` and `compose.yaml`; verified line by line. But finding 1 was stated
more broadly than it was fixed. It named three missing bounds — "no `timeout` in the `run:`
script, no step `timeout-minutes`, no job-level `timeout-minutes`" — and closed only the first.
The general case stayed open, and it is not hypothetical:

- **No job in this workflow had `timeout-minutes`.** GitHub's default is 360 minutes, so any hang
  outside the one `timeout 60`-wrapped command still burned six hours of runner and never reached
  its `if: always()` teardown.
- **`docker compose up --wait` is one such hang.** Every healthcheck in `compose.yaml` is bounded
  by `retries` x `interval`, so an unhealthy `api` or `web` makes `--wait` *fail* rather than
  block — that part is sound. But `migrate` has no healthcheck and `api` gates on
  `service_completed_successfully`, so a migration wedged on an advisory lock has nothing to time
  it out and `--wait` blocks forever.

**Fixed:** `timeout-minutes` on all three jobs — `verify: 20` (observed ~3.5 min), `real-token:
15`, `images: 30` (observed ~5.5 min). These are backstops with roughly 5x headroom, not
performance targets; they should only ever fire on a genuine hang. Bounding `--wait` itself with
`--wait-timeout`, or giving `migrate` a healthcheck, is the narrower fix and is deliberately
**not** done here: the job backstop covers every hang in the job including ones not yet
enumerated, which is the property finding 1 was actually asking for.

- [ ] **Step 1: Add the job**

Append to `.github/workflows/ci.yml`, at the same indentation as `verify:` and `real-token:`:

```yaml
  # Image build and container startup. A SEPARATE job rather than a fourth leg
  # of verify's timezone matrix: nothing here is timezone-sensitive, and three
  # legs each building three images would triple the slowest job in the
  # workflow against NFR-5's under-8-minute budget.
  images:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      # Build all three targets. Without this the Dockerfile rots silently the
      # first time a dependency or a build script changes.
      - name: Build the api image
        uses: docker/build-push-action@v6
        with:
          context: .
          target: api
          load: true
          tags: irp-api:ci
          build-args: APP_VERSION=${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build the web image
        uses: docker/build-push-action@v6
        with:
          context: .
          target: web
          load: true
          tags: irp-web:ci
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build the migration image
        uses: docker/build-push-action@v6
        with:
          context: .
          target: migrate
          load: true
          tags: irp-migrate:ci
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # A containerised `next start` is a brand-new entry point for
      # assertBypassNotInProduction and had never been exercised against it
      # before Plan 4A. This is the only gate covering it. If the container
      # starts, guard one has broken and the dev bypass could reach a deployed
      # environment — that is an auth failure, not a test failure.
      #
      # A bare non-zero exit is NOT sufficient evidence the guard fired: a
      # missing env var, a bad CMD, or a corrupt layer would also make the
      # container exit non-zero, and the step would print "correct" while
      # proving nothing about the dev-bypass guard — the same false-pass class
      # gate 4 exists to rule out for the 401 assertion below, now applied
      # here too. The container's output is captured and asserted against the
      # guard's actual error string instead of trusting the exit code alone.
      # And if the guard fails open — it doesn't throw, `next start` serves —
      # `docker run` would otherwise block forever with no built-in timeout,
      # burning the runner for GitHub's 360-minute default and never reaching
      # "Dump container logs" / "Tear down". `timeout 60` bounds that, and
      # exit code 124 (timeout's own signal that the command was still
      # running) is treated as its own distinct, clearly-labelled failure.
      - name: The web container must refuse AUTH_DEV_BYPASS=true
        run: |
          set +e
          output=$(timeout 60 docker run --rm \
            -e AUTH_SECRET=ci-only-secret-at-least-32-bytes-xx \
            -e AUTH_URL=http://localhost:3000 \
            -e API_BASE_URL=http://localhost:3001 \
            -e AUTH_DEV_BYPASS=true \
            irp-web:ci 2>&1)
          code=$?
          set -e
          echo "$output"
          if [ "$code" -eq 124 ]; then
            echo "::error::The web container did not exit within 60s with AUTH_DEV_BYPASS=true — it is serving instead of refusing. Guard one is broken."
            exit 1
          fi
          if [ "$code" -eq 0 ]; then
            echo "::error::The web container started with AUTH_DEV_BYPASS=true. Guard one is broken."
            exit 1
          fi
          if ! echo "$output" | grep -q "AUTH_DEV_BYPASS is set in a production build"; then
            echo "::error::The container exited non-zero (code $code) but not with the dev-bypass guard's error — it failed for an unrelated reason, and this gate is no longer testing what it claims."
            exit 1
          fi
          echo "Refused to start with the dev-bypass guard's error, exit code $code — correct."

      - name: Bring the whole stack up
        env:
          APP_VERSION: ${{ github.sha }}
        run: docker compose up --wait --build

      - name: The API is healthy and reports the build version
        run: |
          body=$(curl -fsS http://localhost:3001/health)
          echo "$body"
          echo "$body" | grep -q "${GITHUB_SHA:0:7}" || {
            echo "::error::/health did not report the build version. APP_VERSION did not reach the image."
            exit 1
          }

      # Fail-closed, in production mode, from a real container. The unit suite
      # cannot cover NODE_ENV=production behaviour of the problem-details
      # handler.
      - name: An unauthenticated /api/v1/me returns 401 with a Problem Details body
        run: |
          status=$(curl -sS -o /tmp/me.json -w '%{http_code}' http://localhost:3001/api/v1/me)
          echo "status=$status"
          cat /tmp/me.json
          if [ "$status" != "401" ]; then
            echo "::error::Expected 401 from an unauthenticated /api/v1/me, got $status."
            exit 1
          fi
          grep -q '"type"' /tmp/me.json || {
            echo "::error::The 401 body is not RFC 7807 Problem Details."
            exit 1
          }

      - name: The web app serves its sign-in page
        run: curl -fsS -o /dev/null http://localhost:3000/signin

      # ADR-0009 D5 scales to zero, so this is a routine event, not a
      # deploy-time one. A 137 here is a SIGKILL: dropped in-flight requests on
      # every scale-down, against NFR-2's zero-5xx target.
      - name: The API drains on SIGTERM rather than being killed
        run: |
          docker compose stop api
          code=$(docker compose ps -a --format '{{.Service}} {{.ExitCode}}' | awk '$1=="api"{print $2}')
          echo "api exit code: $code"
          if [ "$code" != "0" ]; then
            echo "::error::api exited $code on SIGTERM (137 = SIGKILL). The drain did not complete."
            exit 1
          fi

      - name: Dump container logs on failure
        if: failure()
        run: docker compose logs --no-color

      - name: Tear down
        if: always()
        run: docker compose down -v
```

- [ ] **Step 2: Push and confirm the job runs green**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: build all three images and smoke-test the stack"
git push -u origin feat/plan-4a-containerisation
```

Watch the run:

```bash
gh run watch
```

Expected: the `images` job passes. Fix anything red before continuing — a gate you have only seen
fail is as useless as one you have only seen pass.

- [ ] **Step 3: Demonstrate each gate red, one at a time**

`CLAUDE.md`: *"Adding a gate means demonstrating it goes red."* Two of this project's four original
CI gates looked correct and did nothing. Prove each of these four, **one commit at a time, reverted
immediately after**:

| # | Break this | Expect |
|---|---|---|
| 1 | Delete `COPY apps/api/package.json ./apps/api/package.json` from the `deps` stage | The api image build fails |
| 2 | **LOCAL ONLY — see Correction 2 below.** In `apps/web/auth.config.ts`, change `env.NODE_ENV?.toLowerCase() === "production"` to `env.NODE_ENV === "development"` | The bypass-refusal gate fails: the container starts |
| 3 | Point `compose.yaml`'s `migrate` `DATABASE_URL` at `10.255.255.1` | `docker compose up --wait` fails |
| 4 | Change the 401 step's URL from `/api/v1/me` to `/health` | The step fails, proving the assertion is real and not passing on a connection error |

**CORRECTION 2 (applied 2026-07-30, decided by the user in the pre-flight plan review).** As
originally written, gate 2 mandated committing *and pushing* a weakened `NODE_ENV` comparison to
get a red CI run. That **contradicts Global Constraint 4**, which says never weaken either
dev-bypass guard and never loosen the case-insensitivity of the `NODE_ENV` comparison. A
weakened auth guard must never exist in a pushed commit, not even transiently, and not even
with a revert queued behind it.

**Prove gate 2 LOCALLY instead:** patch the working tree, build the web image, show
`docker run -e AUTH_DEV_BYPASS=true` **starting successfully** (the gate's red condition), then
`git checkout` the file. **Never committed, never pushed.** Gates 1, 3 and 4 still get real
pushed CI runs.

For gate 2, **restore the guard exactly** — re-read the docblock in `auth.config.ts` explaining why
the two comparisons are deliberately asymmetric (`AUTH_DEV_BYPASS` matched exactly and narrowly,
`NODE_ENV` matched loosely and case-insensitively) and confirm both are back as they were. Diff
against `HEAD` to prove the restoration is byte-exact.

**Gate 2's red condition changed in Task 7 and the local proof must account for it.** Before
Task 7, a bypass container stayed `Up` serving 500s rather than exiting, so "the container
started" was ambiguous. `apps/web/instrumentation.ts` now calls `process.exit(1)` at boot, so
the green path is a clean **exit 1 before any request**. With the guard weakened, expect the
container to **stay running and serve `/signin` with a 200** — that is the gate red, and it is
now unambiguous.

**Record the three pushed run URLs and the local outcome for gate 2 in the task report.** A gate
without a recorded red result does not count as proven.

- [ ] **Step 4: Confirm the branch is green and the timing is acceptable**

```bash
gh run list --branch feat/plan-4a-containerisation --limit 3
gh run view --json jobs --jq '.jobs[] | {name, startedAt, completedAt}'
```

Expected: all jobs green. **Note the `images` job's wall-clock time in the report.** If the workflow
now exceeds NFR-5's 8-minute budget, apply the spec's stated fallback — move the `images` job to
`push` to `main` only, off the PR path — and record that as a decision, not a silent change.

- [ ] **Step 5: Commit**

Only the revert of the final gate demonstration should remain uncommitted; ensure the tree matches
the green state.

```bash
git status --porcelain
git add -A
git commit -m "ci: prove each image gate goes red

Four gates, each demonstrated failing and then restored: a missing COPY breaks
the image build; a weakened NODE_ENV comparison lets the bypass container start;
an unreachable migrate database fails compose up --wait; and pointing the 401
assertion at /health fails, proving the assertion is real rather than passing on
a connection error.

The compose proof uses an UNREACHABLE host deliberately. Plan 2B established
that a nonexistent database on a reachable host exits 0, because the postgres:16
image's superuser silently creates it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Documentation reconciliation

**Files:**
- Modify: `handoff.md`
- Modify: `CLAUDE.md`
- Modify: `docs/manual-setup-steps.md`
- Modify: `apps/web/.env.example` — **added by CORRECTION 6**
- Modify: `apps/web/instrumentation.ts` — **added by CORRECTION 6** (comment only)
- Modify: `apps/web/e2e/README.md` — **added by CORRECTION 6**

**CORRECTION 6 (applied 2026-07-30, on resume).** This task's file list was incomplete, and its
steps did not cover the one correction the halt-point commit explicitly assigned to it — the
dev-bypass guard's **fourth** entry point. Four additions, all doc/comment-only:

1. **`CLAUDE.md`'s dev-bypass section said THREE entry points.** `apps/web/instrumentation.ts` is a
   fourth. Step 3 as written only appended container facts and would have left the section wrong.
   The section is now a numbered list of four, each with the reason it needed its own guard, and it
   also no longer refers to `middleware.ts` — which Step 5's grep would otherwise have flagged in
   the very file the step tells you to fix.
2. **`apps/web/.env.example` repeated the same three-entry-point claim** in a long comment. It is
   the file a developer actually reads when setting the flag, so leaving it stale is worse than
   leaving `CLAUDE.md` stale. Now says four entry points and three call sites.
3. **`apps/web/instrumentation.ts`'s own comment asserted something false:** that "Next only builds
   an Edge instrumentation bundle when there is Edge runtime code — since ADR-0013 proxy.ts runs on
   Node, there is currently none." Next builds it **unconditionally**. Both `next dev` and `next
   build` emit `A Node.js API is used (process.exit ...) which is not supported in the Edge Runtime`
   / `Ecmascript file had an error` on every run — ~35 times per dev session, once per build as
   "Turbopack build encountered 1 warnings" — after which the build reports "Compiled
   successfully". The warning is expected and harmless; Turbopack matches `process.exit`
   statically, so the runtime `typeof` check cannot suppress it. The comment now records the
   observed behaviour and says explicitly not to "fix" the warning by weakening the exit. This
   matters because this repo's stated rule is that coverage claims about the bypass get checked,
   not trusted — and this was an unchecked claim sitting in the guard itself.
4. **`apps/web/e2e/README.md`'s seed command does not work on Windows PowerShell 5.1.** The `-c
   "...\"User\"..."` form loses its escapes through a native command's argument list: `psql`
   receives `INSERT INTO " User\` plus a stack of "extra command-line argument ignored" warnings.
   Replaced with piping a `.sql` file on stdin, noting that the `-c` form is fine on bash. The
   instructions are PowerShell-labelled, so this was a broken instruction, not a portability nicety.

**Why this is a task and not a footnote.** `handoff.md` is the resume map for a fresh session. A
plan that changes the roadmap and closes three recorded obligations without updating it leaves the
next session working from a false map — which is exactly how Plan 3 lost four tasks to a stale
claim.

- [ ] **Step 1: Update `handoff.md` §2a — the slice roadmap**

Replace the Plan 4 row in the §2a table with two rows:

```markdown
| | 4A · Containerisation + runtime hardening | T-21 (partial) | — | ✅ **This plan** |
| | 4B · Infra, deploy, observability | T-19, T-20, T-21 (rest), T-22, T-23, plus `infra/entra.bicep` | D3 | **Next.** Needs the Entra directory (§3) and the Azure setup in `manual-setup-steps.md` §1.1a/§1.2/§1.2a |
```

Immediately below the table, add:

```markdown
**Plan 4 was split on 2026-07-30.** Everything that needs no Azure account is 4A; everything that
does is 4B. The split does **not** relax the ordering rule above: **slice 1 is not "deployed and
traced" until 4B ships**, and Deliverable 3 stays at zero and Deliverable 4 stays unstartable until
then. What 4A buys is that 4B is Bicep plus a workflow against images already proven to run.
```

- [ ] **Step 2: Update `handoff.md` §3 — current position and obligations**

Replace the "Plan 4's inherited obligations" list with:

```markdown
### Plan 4's inherited obligations — three closed in 4A, one carried to 4B

1. **`infra/entra.bicep`** — **still open, now 4B's.** Moved here from Plan 3 (ADR-0011); deferred
   again in 4A because it cannot be applied without the Entra directory. **This is its third
   deferral** — treat it as owed, not optional.
2. ~~**A `SIGTERM`/`SIGINT` handler in `apps/api`**~~ — **closed in 4A.**
   `apps/api/src/shutdown.ts` drains via `app.close()`, disconnects Prisma, and force-exits
   non-zero if the drain overruns, rather than being `SIGKILL`ed. Proven by `docker compose stop`
   returning exit code 0 in CI.
3. ~~**The `middleware.ts` → `proxy.ts` migration, with an ADR**~~ — **closed in 4A.** ADR-0013.
   The guard now runs on Node, not the Edge.
4. ~~**`index.ts` only `$disconnect()`s Prisma inside the `catch` around `app.listen`**~~ —
   **closed in 4A** by `apps/api/src/bootstrap.ts`.
```

Then update the "Current position" line at the top of §3 to name the branch, the merged PR number,
and 4B as next.

- [ ] **Step 3: Add the container facts to `CLAUDE.md`**

Append to the "Hard-won facts" area a short subsection:

```markdown
**Container facts from Plan 4A:**

- **`node:24-slim`, never alpine.** Debian/glibc matches Prisma's `debian-openssl-3.0.x` binary
  target. Alpine is musl, needs a different target, and fails at *runtime* rather than at build
  time.
- **The generated Prisma client is pure TypeScript** (nine files, no engine binaries — Prisma 7
  with a driver adapter, ADR-0008), so `tsc` compiles it into `dist/generated/prisma/` and the API
  runtime image needs `apps/api/dist` **only**. Do not copy `src/generated` into an image.
- **`prisma generate` in a Docker build needs a throwaway `DATABASE_URL` build arg.** It must
  parse; it never connects.
- **`outputFileTracingRoot` must be the repository root.** Tracing from `apps/web` misses workspace
  dependencies and yields an image that builds and then fails at runtime on a missing module.
- **`.next/static` is not traced into `.next/standalone`** and must be copied separately, or every
  `/_next/static` request 404s and the page renders unstyled — which no status-code check catches.
- **`node:24-slim` ships neither `curl` nor `wget`.** Container healthchecks use `node -e` with
  `fetch`.
- **Copy the whole `prod-deps` stage, not individual `node_modules` paths.** A path-by-path copy
  breaks pnpm's relative symlinks, and `packages/core/node_modules` does not exist under `--prod`
  (it has devDependencies only), so a `COPY` of it fails the build.
- **`apps/web/public/` does not exist.** A `COPY` of it fails the build.
- **A containerised `next start` is a distinct entry point for the dev-bypass guard.** CI asserts
  the web container exits non-zero with `AUTH_DEV_BYPASS=true`.
```

- [ ] **Step 4: Update `docs/manual-setup-steps.md`**

In §1.5, change the opening so the GHCR question is clearly 4B's:

```markdown
### 1.5 Decide whether the container images are public — **Plan 4B's question, not 4A's**

Plan 4A builds images locally and in CI but **pushes them nowhere**, so nothing is blocked on this
today. Answer it before 4B's deploy workflow lands.
```

Also add a line at the top of §1.0 recording the state:

```markdown
**Update, 2026-07-30.** Plan 4 was split. **Plan 4A needs nothing from this section** — it
containerises and hardens the runtime with no Azure account. Everything in §1 now blocks **Plan
4B**.
```

- [ ] **Step 5: Verify nothing in the docs contradicts the code**

```bash
grep -rn "middleware.ts" --include=*.md . | grep -v node_modules | grep -v "docs/adr/0013"
```

Expected: only historical references inside `handoff.md`'s Plan 2B/Plan 3 sections, which describe
what was true at the time and should be left alone, plus ADR-0013 itself. **If any live instruction
still tells a reader to edit `middleware.ts`, fix it** — that file no longer exists.

- [ ] **Step 6: Run the full verification set one final time**

```bash
pnpm typecheck && pnpm lint && pnpm test
AUTH_DEV_BYPASS=false pnpm --filter @irp/web build
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add handoff.md CLAUDE.md docs/manual-setup-steps.md
git commit -m "docs: reconcile the roadmap and house rules with Plan 4A

handoff.md 2a splits Plan 4 into 4A/4B and states explicitly that the ordering
rule is NOT relaxed — slice 1 is not deployed and traced until 4B ships, and D3
and D4 stay at zero until then.

Three of the four inherited obligations are marked closed with what closed them;
infra/entra.bicep is carried to 4B and flagged as its third deferral.

CLAUDE.md gains the container facts worth not rediscovering: the alpine/musl
Prisma trap, the pure-TypeScript generated client meaning dist alone suffices,
the throwaway DATABASE_URL build arg, outputFileTracingRoot, .next/static not
being traced, no curl in node:24-slim, and the whole-stage prod-deps copy.

manual-setup-steps.md marks the whole of 1 as blocking 4B rather than 4A.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definition of done for the plan

1. `docker compose up --wait` from a clean checkout brings up all four services; `/health` returns
   200 with the git SHA, and `http://localhost:3000/signin` renders styled.
2. `docker compose stop api` drains and exits 0, not 137.
3. All five gates exist in CI and each has been demonstrated red, with run URLs in the task reports.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test` clean; counts at or above Task 1's recorded baseline.
5. `pnpm --filter @irp/web build` succeeds with `AUTH_DEV_BYPASS=false` and **fails** with it `true`.
6. The Playwright suite passes after the `proxy.ts` swap.
7. ADR-0013 and ADR-0014 exist, each naming at least two rejected alternatives.
8. `handoff.md`, `CLAUDE.md` and `docs/manual-setup-steps.md` are updated in the same PR.
