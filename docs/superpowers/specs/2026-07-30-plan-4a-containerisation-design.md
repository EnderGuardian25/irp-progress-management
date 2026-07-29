# Plan 4A — Containerisation, runtime hardening, and the observability seam

- **Status:** Approved
- **Date:** 2026-07-30
- **Branch:** `feat/plan-4a-containerisation`
- **Slice:** 1 — Deployed integration skeleton (`handoff.md` §2a)
- **Covers:** T-21 (partial — exporter selection only), plus Plan 4 inherited obligations 2, 3 and 4
- **Requirements:** NFR-2 (200 RPS burst, zero 5xx — via graceful shutdown), NFR-5 (deploy pipeline
  under 8 minutes — via cached image layers), NFR-6 (traces within 60 s — the seam only);
  Deliverable 3 groundwork
- **Splits:** Plan 4 becomes **4A** (this spec) and **4B** (Bicep, deploy, rollback, runbook).
  `handoff.md` §2a is updated by this plan to record the split
- **Relates to:** ADR-0009 (hosting topology — D3's migration job and D5's scale-to-zero are why
  targets and shutdown are shaped as they are), ADR-0012 (the dev auth bypass), ADR-0008
  (`@prisma/adapter-pg`)

---

## 1. Goal

**One command brings the whole system up as production-mode containers on a developer machine.**

```
docker compose up --wait
```

…yields a healthy Postgres, applied migrations, a Fastify API answering `/health`, and a Next.js
app served from a standalone build — all built from a clean checkout, with nothing requiring an
Azure account, the Azure CLI, or an Entra directory.

Everything in this plan exists to make that sentence true, to make it stay true under CI, and to
leave Plan 4B as *Bicep plus a workflow* against images already proven to run.

## 2. Why Plan 4 was split

Plan 4 as scoped in `handoff.md` §2a carried ten distinct pieces of work, several of them blocked
on human setup that has not happened: the Azure CLI is **not installed** on the current development
machine (`manual-setup-steps.md` §1.2), the four Azure resource providers are still
`NotRegistered` (§1.2a), and **the dedicated Entra directory does not exist** (§1.1a). Confirmed
2026-07-30.

Splitting draws the line at *"does this need an Azure account?"* Everything that does not is 4A and
starts immediately. Everything that does is 4B.

**What the split costs, stated plainly so it is not discovered later:** Deliverable 3 remains at
zero and Deliverable 4 remains unstartable until 4B runs, because both need a deployed URL. 4A
produces no URL. What it buys is that the highest-variance part of deploying — building correct
images from a pnpm workspace whose contract packages are all git-ignored — is solved and gated
before Bicep is written, rather than being discovered inside a deploy pipeline.

`handoff.md` §2a's ordering rule ("slice 1 must be deployed and traced before slice 2 begins")
is **unchanged and still binding**. 4A does not satisfy it. 4B does.

## 3. Decisions carried in from the brainstorm

| # | Decision | Why |
|---|---|---|
| 1 | **One root `Dockerfile` with shared stages and multiple targets**, not one Dockerfile per app | Both images need the same expensive prelude: install, `pnpm generate`, `prisma generate`, `@irp/core` build. Sharing it guarantees both images are built from the **same generation run** — two images built from two generations of `spec/openapi.yaml` is a contract-drift bug that would be invisible at runtime. Per-app Dockerfiles duplicate that prelude verbatim, and it is the part most likely to be edited |
| 2 | **Three targets: `api`, `web`, `migrate`** | ADR-0009 D3 runs `prisma migrate deploy` as a Container Apps Job. The API runtime image carries production dependencies only, and the Prisma CLI is a devDependency, so the API image **cannot** run migrations. Building the third target now means 4B inherits it instead of discovering the gap mid-deploy |
| 3 | **A new root `compose.yaml`**; `apps/api/docker-compose.yml` is left untouched | The existing file is the db-only dev dependency referenced by `handoff.md`, `manual-setup-steps.md` §1.3a, `apps/web/e2e/README.md` and the database test setup. Editing it would break all of those for no gain |
| 4 | **`@azure/monitor-opentelemetry-exporter` selected by config now**, console exporter as the fallback | The *selection* is a pure function and locally testable. It reduces 4B's observability work to supplying a connection string |
| 5 | **The containerised stack has no working sign-in, and that is the correct outcome** | Containers run `NODE_ENV=production`, so `assertBypassNotInProduction` refuses the dev bypass. Every way around this weakens a guard `CLAUDE.md` forbids weakening. Authenticated flows stay proven where they already are — the Playwright suite against `pnpm dev` |

## 4. Architecture — one build graph, three runtimes

```
base            node:24-slim · corepack enable · pnpm@11.17.0 · non-root `node` user prepared
  │
  ├─ deps       COPY pnpm-lock.yaml, pnpm-workspace.yaml, every package.json
  │             RUN  pnpm install --frozen-lockfile          ← cached until the lockfile changes
  │
  ├─ generated  COPY spec/openapi.yaml, apps/api/prisma/, apps/api/prisma.config.ts
  │             RUN  guard: fail if any generated file arrived from the build context
  │             RUN  pnpm generate                           → packages/types, packages/client
  │             RUN  prisma generate                         → apps/api/src/generated/prisma
  │
  └─ build      COPY the remaining source
                RUN  pnpm --filter @irp/core   build         → dist/
                RUN  pnpm --filter @irp/client build         → declaration-only emit
                RUN  pnpm --filter @irp/api    build         → tsc → apps/api/dist
                RUN  pnpm --filter @irp/web    build         → next build (standalone)
                          │                  │                  │
                    target: api        target: web        target: migrate
```

### 4.1 The three final targets

| Target | Contents | Entrypoint |
|---|---|---|
| `api` | `apps/api/dist`, the generated Prisma client, production dependencies only | `node dist/index.js` |
| `web` | `.next/standalone`, `.next/static`, `public` | `node apps/web/server.js` |
| `migrate` | `apps/api/prisma/`, `prisma.config.ts`, the Prisma CLI | `prisma migrate deploy` |

All three run as the non-root `node` user.

### 4.2 The parts that will bite if left implicit

- **`node:24-slim`, not alpine.** Debian/glibc matches Prisma's `debian-openssl-3.0.x` binary
  target. Alpine is musl and needs a different target; it is a well-known source of a lost
  afternoon, and Prisma's failure mode there is a runtime error rather than a build error.
- **`prisma generate` requires `DATABASE_URL` to be present and parseable.** Prisma 7 dropped
  implicit `.env` loading and `apps/api/prisma.config.ts` resolves `env("DATABASE_URL")` from the
  real process environment, so a bare `prisma generate` fails `PrismaConfigEnvError`. The
  `generated` stage supplies a throwaway `ARG`. It never connects — `generate` does not need a
  reachable database.
- **`.dockerignore` is load-bearing, not hygiene.** It must exclude `node_modules`, `.next`,
  `.git`, `.env*`, `.superpowers`, and all three generated directories (`packages/types`,
  `packages/client`, `apps/api/src/generated/prisma`). If a host copy of a generated package leaks
  into the build context it is *not* overwritten by regeneration in every case, and the image
  silently ships a stale contract. This is the same failure the "never commit generated output"
  rule exists to prevent, arriving by a different route — which is why §7 gates it rather than
  trusting the ignore file.
- **`outputFileTracingRoot`** must point at the repository root in `next.config.ts`. Without it,
  standalone traces from `apps/web` and misses workspace dependencies, producing an image that
  builds and then fails at runtime on a missing module.
- **`transpilePackages: ["@irp/client"]` already exists and must survive** the standalone change.
  `@irp/client` ships runtime code as raw TypeScript with `noEmit`; Next must compile it.
- **`APP_VERSION`** arrives as a build arg set to the git SHA. `loadConfig` already reads it and
  `/health` already reports it. This is what makes *"did the rollback actually take?"* answerable
  in 4B, so it is wired now rather than retrofitted.

### 4.3 `compose.yaml`

Four services at the repository root.

| Service | Depends on | Notes |
|---|---|---|
| `db` | — | `postgres:16`, the existing healthcheck. **No published host port** — nothing on the host needs one, and publishing would collide with `apps/api/docker-compose.yml` when both are up |
| `migrate` | `db: service_healthy` | `target: migrate`. Runs to completion and exits 0 |
| `api` | `migrate: service_completed_successfully` | `DATABASE_URL=postgresql://irp:irp@db:5432/irp?schema=public`. Healthcheck hits `/health` via `node -e` — the slim image has no `curl` or `wget` |
| `web` | `api: service_healthy` | `API_BASE_URL=http://api:3001`, published on `localhost:3000` |

`init: true` on the application services for zombie reaping.

**`JWKS_URI` is a placeholder that never resolves, and this is deliberate.**
`createRemoteJWKSet` is lazy — it performs no network I/O at construction — so the API boots and
serves `/health` regardless. The URI only matters when a token arrives, which in this stack never
happens. Documented in the compose file itself so a future reader does not "fix" it.

## 5. Runtime hardening

### 5.1 Graceful shutdown — obligation 2

No `SIGTERM` or `SIGINT` handler exists anywhere in `apps/api`. ADR-0009 D5's scale-to-zero makes
container shutdown a routine event rather than a deploy-time one, so in-flight requests are
currently dropped on a regular basis. This bears directly on NFR-2's *"200 RPS burst, zero 5xx"*.

The handler lives in a new `apps/api/src/shutdown.ts`, **not inline in `index.ts`**, so it is
unit-testable without signalling the test runner:

```ts
registerShutdown({ app, prisma, signals, timeoutMs, exit }): void
```

Sequence on signal: `app.close()` — Fastify stops accepting connections and drains in-flight
requests — then `prisma.$disconnect()`, then `exit(0)`.

Three properties, each with a test:

1. **Ordering.** `$disconnect()` never runs before the drain completes. Disconnecting first would
   fail the very requests the drain exists to protect.
2. **Idempotence.** A second `SIGTERM` arriving mid-shutdown is ignored, not a second `app.close()`.
3. **Timeout.** If the drain overruns `timeoutMs`, force-exit non-zero. Container Apps' grace
   period is finite; a hung drain otherwise becomes a `SIGKILL`, which is a dropped request *and*
   an unexplained exit code. Default 10 000 ms, overridable by `SHUTDOWN_TIMEOUT_MS`.

`exit` and `signals` are injected for exactly the reason `buildServer(deps)` and
`createTracerProvider(exporter)` take their dependencies — so the test never calls
`process.exit`.

### 5.2 Prisma disconnect on the `buildServer` failure path — obligation 4

`apps/api/src/index.ts` currently calls `prisma.$disconnect()` only inside the `catch` around
`app.listen`. If `buildServer` itself rejects, the client leaks. Restructuring `index.ts` to
register shutdown handling makes this fall out of §5.1 rather than being separate work. Low stakes
— the process exits either way — but it is a recorded obligation and it is one line once the
structure is right.

### 5.3 `middleware.ts` → `proxy.ts`, with ADR-0013 — obligation 3

Next 16 deprecates `middleware.ts` in favour of `proxy.ts`. **This is not a rename.** Per
`next/dist/build/entries.js`, `isProxyFile` routes to `onServer()` unconditionally while
`isMiddlewareFile` routes to `onEdgeServer()` — so adopting `proxy.ts` moves the auth guard from
the **Edge** runtime to **Node**. Next hard-errors if both files exist, so there is no incremental
path; it is one atomic swap.

Containerisation is what settles it: the image runs Node with no Edge network, so the Edge bundle
is dead weight and the Node runtime is the correct owner of the guard.

**One instruction belongs in the plan explicitly: verify the expected export shape against the
installed `next@16.2.12` in `node_modules`, not from memory.** A `middleware.ts` export-shape error
broke the production build for four tasks during Plan 3 and plain `tsc` did not catch it. This
task's verification therefore includes a real `pnpm --filter @irp/web build` and a full Playwright
run, not a typecheck.

The new file keeps importing `auth.config.ts` rather than `auth.ts` — a minimal change, and
`auth.ts` pulls in Node-only modules that the current file deliberately avoids. That preserves the
`assertBypassNotInProduction` call at that entry point. **The plan re-checks all three entry points
after the swap rather than assuming**, because three successive claims that the guard's coverage
was complete turned out to be false during Plan 3.

**ADR-0013** records the decision against two rejected alternatives: keeping `middleware.ts` and
accepting the deprecation warning indefinitely; and deleting the UX redirect entirely, relying only
on `apps/api`'s fail-closed hook.

## 6. Observability — the exporter seam

`apps/api/src/telemetry.ts` already exposes `createTracerProvider(exporter: SpanExporter)`, and
`index.ts` currently hands it `new ConsoleSpanExporter()`. This plan adds
`apps/api/src/exporter.ts`:

```ts
selectSpanExporter(env): SpanExporter
```

Azure Monitor when `APPLICATIONINSIGHTS_CONNECTION_STRING` is present and non-empty; console
otherwise. A pure function over an environment object, unit-tested by asserting the returned
instance's type — no network, no Azure account.

**Verification gate before the dependency lands in the lockfile.**
`@azure/monitor-opentelemetry-exporter`'s peer range must be checked against `@opentelemetry/api`
1.9.1 and the `2.10.0` SDK packages this repo pins. `CLAUDE.md`'s rule is *newest version the
surrounding ecosystem actually supports*, and ADR-0005 is the worked example of ignoring it.
**If the exporter does not support the 2.x SDK line, the task ships the selection seam with the
console exporter on both branches and records why in the spec and `CLAUDE.md`.** The seam is the
part that de-risks 4B; the concrete exporter is replaceable.

Whichever way that resolves, the new pin and its rationale go into `CLAUDE.md`'s pinned-versions
table.

## 7. Gates — each demonstrated red before it is trusted

`CLAUDE.md`: *"Adding a gate means demonstrating it goes red."* Two of this project's four original
CI gates looked correct and did nothing, and in Plan 2B a gate-*proof* turned out to be the thing
that could not fail. Each gate below names how it is proven.

| Gate | What it catches | Proof |
|---|---|---|
| CI builds all three targets | A Dockerfile that rots the first time a dependency is added | Remove a `COPY`, observe the failure, revert |
| `docker compose up --wait` in CI, then assert `/health` → 200 | A stack that builds but does not come up; a broken service dependency chain | Point `migrate` at an **unreachable** database host:port. `migrate` then fails, `api`'s `service_completed_successfully` dependency is never met, and `up --wait` exits non-zero. **Not** a nonexistent database on a reachable host — Plan 2B proved that exits 0, because the `postgres:16` image's superuser silently creates it. And **not** by breaking only the API's `DATABASE_URL`: Prisma connects lazily, so the API would boot and `/health` would very likely still return 200 |
| Unauthenticated `GET /api/v1/me` → 401 with an RFC 7807 body | Auth not fail-closed once `NODE_ENV=production`; the problem-details handler misbehaving outside development | Point the assertion at `/health`, which returns 200, and observe the gate fail. This proves the assertion is real rather than passing on a connection error or an empty response. **Do not** try to prove it by removing the route's auth preHandler — Plan 3 added a global fail-closed `onRequest` hook, so the route would still 401 and the "proof" would prove nothing |
| Web container with `AUTH_DEV_BYPASS=true` exits non-zero | **The bypass reaching a production container — a brand-new entry point for that guard, never previously exercised** | It *is* the proof. It fails if the guard is ever weakened |
| A pre-generation `RUN` that fails if `packages/types/src/schema.ts` exists | A `.dockerignore` regression shipping a stale contract into the image | Add the file to the build context, observe the build fail |

All five gates live in a **single new `images` job**, separate from the existing three-timezone
`verify` matrix — not inside it. Nothing in image building or container startup is
timezone-sensitive, so running it three times would triple the cost of the slowest job in the
workflow for no additional coverage, and would put NFR-5's 8-minute budget at risk.

## 8. Testing

| Layer | What |
|---|---|
| Unit | `selectSpanExporter` — both branches, plus empty-string and whitespace-only connection strings treated as absent |
| Unit | `registerShutdown` — ordering, idempotence, timeout force-exit. Injected `signals` and `exit`; the test never calls `process.exit` |
| Unit | `index.ts`'s failure path disconnects Prisma when `buildServer` rejects |
| Build | `pnpm --filter @irp/web build` with `AUTH_DEV_BYPASS=false`, after the `proxy.ts` swap and after the standalone change. Required — plain `tsc` misses `typedRoutes` and export-shape errors |
| E2E | The existing Playwright suite must pass unchanged after the `proxy.ts` swap. It is the only thing proving the sign-in chain |
| Container | The five gates in §7 |

**Existing test counts must not regress.** `handoff.md` records `@irp/core` 112 · `apps/api` 59 ·
`apps/web` 63 unit + 5 Playwright — but it states `apps/api` as both 48 and 59 in different
sections, so **the plan's first task records the real baseline from an actual run** and every
later task is measured against that, not against the doc. Any suite that ends up skipped is a
failure, not a pass — `describe.skipIf` exiting 0 is a false-green this repo has been bitten by
before.

## 9. Documentation updated by this plan, not after it

- **`handoff.md`** — §2a records the 4A/4B split with every deferred item carried explicitly; §3's
  "Current position" and the inherited-obligations list are updated to show 2, 3 and 4 closed and 1
  carried to 4B.
- **`CLAUDE.md`** — new pins with rationale; container-specific facts worth not rediscovering
  (the alpine/musl Prisma trap, the `prisma generate` build-arg, `outputFileTracingRoot`).
- **`manual-setup-steps.md`** — §1.5's GHCR public/private question is marked as 4B's, not 4A's,
  since no image is pushed anywhere in this plan.
- **`docs/adr/0013-proxy-over-middleware.md`** — new.

## 10. Definition of done

1. `docker compose up --wait` from a clean checkout brings up all four services; `/health` returns
   200 with the git SHA as its version, and `http://localhost:3000/signin` renders.
2. `docker compose stop api` drains and exits 0 within the grace period, not by `SIGKILL`.
3. All five §7 gates exist in CI and each has been demonstrated red at least once, with the proof
   recorded in the task report.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test` clean; test counts at or above §8's figures.
5. `pnpm --filter @irp/web build` succeeds with `AUTH_DEV_BYPASS=false` and fails with it `true`.
6. The Playwright suite passes after the `proxy.ts` swap.
7. ADR-0013 exists and names at least two rejected alternatives.
8. §9's documentation changes are committed in the same PR.

## 11. Out of scope — deferred to Plan 4B

Recorded so nothing is silently dropped. Every item below was in Plan 4's original scope.

- `infra/main.bicep` — Container Apps environment, Postgres Flexible Server with firewall,
  Log Analytics, App Insights (T-19)
- `infra/entra.bicep` — obligation 1, and its **third** deferral (ADR-0011 moved it from Plan 3 to
  Plan 4). Blocked on the Entra directory in `manual-setup-steps.md` §1.1a
- GHCR build-and-push, and the public/private package decision (§1.5)
- The deploy workflow on merge to `main`, under 8 minutes (T-20)
- The migration Container Apps Job — *the image is built here; the job that runs it is 4B's*
- A real `APPLICATIONINSIGHTS_CONNECTION_STRING`, and proving traces land within 60 s (T-21's
  remainder)
- Tested rollback to the previous revision, with exact commands (T-22)
- `deploy-runbook.md` (T-23) — **a graded Deliverable 3 artefact**
- Waking the dormant real-token CI job

## 12. Risks

| Risk | Handling |
|---|---|
| **`@azure/monitor-opentelemetry-exporter` does not support the 2.x OTel SDK line** | §6's stated fallback: ship the seam, keep the console exporter, record the reason. Checked *before* the lockfile changes |
| **`output: 'standalone'` interacts badly with `transpilePackages` in a pnpm workspace** | The most likely failure in the plan. Symptom is a runtime missing-module error, not a build error, so the compose smoke test — not the build — is what catches it. `outputFileTracingRoot` is the first lever |
| **The `proxy.ts` export contract differs from what is assumed** | Verified against installed `node_modules` before writing the file; `next build` and Playwright are the gate, not `tsc` |
| **Docker build times push CI past NFR-5's 8-minute budget** | Layer ordering puts `pnpm install` behind the lockfile alone. The compose smoke test runs on one timezone leg. If it still overruns, the image job moves off the PR path and onto merge-to-`main` — recorded here so that trade-off is a decision rather than a surprise |
| **The stack has no sign-in, and someone later reads that as a regression** | §3 decision 5, the compose file's own comments, and `handoff.md` all state it. It is a consequence of ADR-0012 working correctly |
