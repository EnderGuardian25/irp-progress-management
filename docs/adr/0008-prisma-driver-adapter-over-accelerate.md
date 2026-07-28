# ADR-0008 — Prisma driver adapter (`@prisma/adapter-pg`) over Accelerate

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** FR-5 (soft delete via `User.deletedAt`), NFR-1 (API p95 < 250 ms at 50 RPS)
- **Relates to:** ADR-0006 (OpenAPI 3.1 over 3.0) — the "pin the newest version the ecosystem
  actually supports" rule this ADR also applies; O-5 (AI provider undecided, personal-data
  handling needs an ADR before any third-party data transit)

---

## Context

`CLAUDE.md` pins Prisma to **7.9.1**. Prisma 7 made two breaking changes to how a `PrismaClient`
connects to Postgres, both hit while implementing Task 5 (Prisma schema, migration, user
repository) of Plan 2B:

1. **`url` is no longer permitted in the schema's `datasource` block.** `prisma validate`,
   `migrate`, and `generate` all fail with `P1012` before any database connection is attempted.
   The connection URL used by the CLI now comes from a `prisma.config.ts` file
   (`defineConfig`/`env` from `prisma/config`).
2. **`datasourceUrl` no longer exists as a `PrismaClientOptions` member.** In `@prisma/client@7.9.1`'s
   own typings, `PrismaClientOptions` is a union of `{ adapter }` and `{ accelerateUrl }` — a
   driver adapter (or a Prisma Accelerate URL) is **required** to open a direct connection at
   runtime. There is no longer a way to hand the client a bare Postgres connection string.

This forces a real choice for how `apps/api`'s `PrismaClient` connects to Postgres 16 at runtime
(`createPrismaClient(databaseUrl)` in `apps/api/src/db/client.ts`), independent of the
`prisma.config.ts` fix for the CLI side.

## Decision

Connect through the **`@prisma/adapter-pg`** driver adapter:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
```

`@prisma/adapter-pg` is first-party (published under the `@prisma` npm scope), requires no
external service or account, and brings `pg` and `@types/pg` in as its own dependencies — one
new line in `apps/api/package.json`'s `dependencies`, not three.

## Consequences

### Positive

- **No new network hop for student data.** The adapter opens a direct `pg` connection to our own
  Postgres 16 instance; nothing about how the client connects changes who can see submission
  content, which matters given O-5's live concern about personal-data transit through third-party
  services.
- **No new account or provisioning dependency.** The programme has not provisioned an Accelerate
  account, and adding one is out of scope for a task about wiring up a `User` repository.
- **The adapter is the seam where connection pooling gets configured.** `PrismaPg` accepts the
  same options `pg.Pool` does (e.g. `max`, `idleTimeoutMillis`). NFR-1 (p95 < 250 ms at 50 RPS
  sustained, 200 RPS burst for 30 s) will need pool sizing tuned against Azure Container Apps'
  connection limits — this ADR records that the tuning point is `createPrismaClient`, not a
  Prisma-managed pool we do not control.
- Single dependency line; `createPrismaClient(databaseUrl: string)`'s signature is unchanged, so
  no caller in `apps/api/src/index.ts` or the test harness needs to change shape.

### Negative

- **One more first-party package to track for upgrades.** `@prisma/adapter-pg` is pinned to the
  same `7.9.1` as `prisma`/`@prisma/client` and must be bumped in lockstep — a version skew
  between the adapter and the client is exactly the kind of drift `CLAUDE.md`'s pinned-versions
  table exists to prevent.
- **We now own `pg.Pool` sizing** rather than delegating it to a managed pooling proxy. This is
  the trade-off deliberately accepted above (a seam we control vs. one we don't), but it means
  pool exhaustion under NFR-1's burst target (200 RPS / 30 s) is our operational problem to size
  correctly, not Accelerate's.

## Alternatives considered

### Rejected — Prisma Accelerate (`{ accelerateUrl }`)

Prisma's managed connection-pooling and query-caching proxy. Rejected because it is a
third-party service that every query — including student submission text — would transit before
reaching our Postgres instance. That is the same class of concern `O-5` raises for AI providers:
personal data crossing a boundary to a service the programme has not evaluated or contracted
with. It also requires an Accelerate account and API key that the programme has not provisioned,
adding an external-service dependency to what should be a self-contained local/Azure-hosted
stack per the `CLAUDE.md` stack table.

### Rejected — downgrade to Prisma 6 to keep `url` + `datasourceUrl`

Prisma 6 still allowed a bare connection string in both the schema `datasource` block and
`PrismaClientOptions.datasourceUrl`, which would have avoided this decision entirely. Rejected
because `CLAUDE.md` pins Prisma to **7.9.1** and states the versioning rule explicitly: pin the
*newest version the surrounding ecosystem actually supports*, not simply the newest published,
and only deviate with an ADR when something is genuinely incompatible (the worked example being
TypeScript 7 breaking `typescript-eslint`, ADR-0005). Nothing here is incompatible — the
connection-string API merely moved from the schema/client options to a config file plus an
adapter. Downgrading to duck the API change would be choosing an older, no-longer-recommended
version to avoid a same-day migration, which is the opposite of what the pin discipline is for.

### Chosen — `@prisma/adapter-pg`

First-party, no external service, no new account, single dependency line, and it is the officially
documented replacement path for a direct Postgres connection under Prisma 7's driver-adapter
model.

## Revisit when

- NFR-1's load-test results (k6, `tests/load/`) come back and pool sizing (`max`,
  `idleTimeoutMillis` on `PrismaPg`) needs tuning against observed p95/burst behaviour.
- A future plan needs read replicas or PgBouncer-style external pooling at scale — re-evaluate
  whether Accelerate's provisioning and personal-data-transit trade-offs look different once the
  programme has an actual production traffic profile to weigh against them.
