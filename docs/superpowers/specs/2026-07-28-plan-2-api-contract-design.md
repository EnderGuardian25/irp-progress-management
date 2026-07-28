# Plan 2 — API contract and service

**Date:** 2026-07-28
**Author:** Damian De Cruz (solo — all three BMAD roles)
**Status:** Approved, ready for implementation planning
**Slice:** 1 of 4 (deployed integration skeleton) · **Plan:** 2 of 11
**Covers:** FR-1 (partial), FR-2, FR-3 (enforcement side), FR-5 (soft delete), NFR-7, NFR-8
**Feeds:** Deliverable 2 (OpenAPI + generated types)
**Parent spec:** [slice 1 integration skeleton](2026-07-28-slice-1-integration-skeleton-design.md)

---

## 1. Goal

Make `spec/openapi.yaml` the genuine single source of truth, and stand up a Fastify service
proving the whole chain end to end:

> spec → generated types → validated request → JWT → Prisma → Postgres → traced response

**Out of scope:** the web app, Entra app registrations, Bicep, deployment, the full data
model, and every feature endpoint. Those are Plans 3–10.

## 2. What Plan 1 left behind

`@irp/core` shipped as a pure cycle/date engine, 112 tests, green under three timezones in
CI. Two things it deferred land here:

- **`@irp/core` ships raw TypeScript.** `main` points at `src/index.ts`. Fastify is not a
  bundler, so this plan adds a `tsc` build step and repoints `main`/`types` at `dist/`. The
  `outDir` and `declaration` settings already in `packages/core/tsconfig.json` — inert since
  Task 2 — become live.
- **`DayStatus.onTime`** was renamed from `submitted` precisely so it would not collide with
  the review-flow `Submitted` state this plan's spec introduces. Keep them distinct.

## 3. Decisions taken

| Decision | Rationale |
|---|---|
| `tsc` build for `@irp/core` → `dist/` | Conventional, no bundler, no experimental flags; the container ships JS |
| **JWT validation lands in Plan 2**, not Plan 3 | Validation is server-side and needs no Azure. Tested against a local key pair with a stubbed JWKS — the same code path production uses. Plan 3 shrinks to swapping the JWKS URL and building the web OIDC flow, which is the part that genuinely needs the Azure account |
| **OpenTelemetry lands in Plan 2**, exporter configurable | Console exporter now, App Insights connection string in Plan 4. Unblocks the Problem Details `traceId` the parent spec §9 requires, and proves tracing before the riskiest plan rather than during it |
| Docker Compose locally, Actions `services:` in CI | Both conventional and fast; a service container costs almost nothing against NFR-5's 8-minute budget |
| **Runtime validation derived from the spec** | See §4 |

## 4. The spec is the source of truth — mechanically, not by convention

`CLAUDE.md` requires request bodies to be `additionalProperties: false` and to "validate
strictly, reject loudly." Fastify validates with JSON Schema. **Where those schemas come from
decides whether the spec is genuinely authoritative or merely aspirational.**

The API loads `spec/openapi.yaml` at boot, dereferences it with
`@apidevtools/json-schema-ref-parser`, and feeds each operation's schemas straight into
Fastify's validator. `openapi-typescript` separately generates compile-time types from the
same document.

Expected libraries, so the plan does not have to rediscover them — final choice remains the
Impl Lead's per PRD §4.2: `jose` for JWT verification and JWKS caching,
`@opentelemetry/sdk-node` with Fastify auto-instrumentation for tracing,
`@apidevtools/json-schema-ref-parser` for dereferencing, `openapi-typescript` for types and
`@hey-api/openapi-ts` for the client SDK — the last two are named in the challenge brief's own
hints.

**One document drives types and runtime behaviour. They cannot drift.**

The rejected alternative — generating types from the spec while hand-writing Fastify's
validation schemas alongside — is the pattern the challenge brief's own hint demonstrates and
the fastest route to a passing test. It was rejected because it makes "the spec lints clean"
and "the API validates strictly" two separate claims that diverge the first time someone edits
one and not the other. The spec is the graded artifact; it should also be the executed one.

`fastify-openapi-glue` was also rejected: same anti-drift guarantee, but it dictates handler
structure, adds a dependency outside the fixed stack, and rents a property we can own in
roughly thirty lines.

## 5. Architecture

```
spec/openapi.yaml  ─── hand-written, source of truth
   │
   ├─ openapi-typescript   ─→ packages/types    compile-time
   ├─ @hey-api/openapi-ts  ─→ packages/client   SDK, unconsumed until Plan 3
   └─ dereferenced at boot ─→ Fastify ajv       runtime validation

apps/api
   ├─ telemetry        OTel · console now, App Insights in Plan 4
   ├─ auth             JWT vs JWKS · local key now, Entra in Plan 3
   ├─ problem-details  RFC 7807 + traceId
   ├─ openapi          load, dereference, register schemas
   └─ Prisma ─→ Postgres 16
```

### Layout

```
spec/openapi.yaml
apps/api/
  src/
    server.ts                 builds the Fastify instance
    plugins/
      telemetry.ts            OTel init
      openapi.ts              load + dereference + register schemas
      auth.ts                 JWT verification, role guards
      problem-details.ts      RFC 7807 error handler
    routes/
      health.ts
      me.ts
    db/client.ts              Prisma singleton
  prisma/
    schema.prisma
    migrations/
  test/helpers/               test-key signing, JWKS stub, DB reset
docker-compose.yml
```

One job per plugin. `server.ts` composes them and is the only place ordering is expressed —
telemetry first so later plugins are traced, problem-details last so it catches everything.

## 6. The two endpoints

| Endpoint | Auth | Proves |
|---|---|---|
| `GET /health` | none | Liveness for container probes. No DB touch |
| `GET /api/v1/me` | bearer | JWT → claims → Prisma → Postgres → trace, in one request |

Both define `200`, `400`, `401` and `500`. Examples on every schema, descriptions on every
parameter, `additionalProperties: false` on request bodies.

**Including on `/health`, where `400` and `401` are unreachable.** `/health` takes no input
and requires no token, so neither status can occur. Documenting them anyway is deliberate:
`CLAUDE.md` states the four-response rule with "No exceptions," and Deliverable 2 is graded on
"every endpoint documents 4xx errors." A blanket rule that is mechanically checkable beats a
judgement call about which endpoints deserve an exemption — and if `/health` is ever placed
behind auth, the contract already says what happens. The alternative, exempting it, means
every future endpoint invites the same argument.

Three components are defined now because they are cross-cutting and painful to retrofit once
thirty operations reference them:

- **`Problem`** — RFC 7807, plus a `traceId` extension member
- **`User`** — id, email, displayName, role
- **bearer security scheme**

## 7. Unregistered users are rejected, not provisioned

**The interpretation:** FR-1 says "no self-registration"; FR-3 says "any Admin can register
additional mentors and students." Read together, **registration is an Admin action.**

So a valid Entra token from someone with no `User` record gets **403**, not an auto-created
account. Auto-provisioning would be self-registration through the back door.

The alternative reading — AD membership *is* the authorisation, so create on first login — is
friendlier and common, but contradicts FR-1 as written. This decision is load-bearing for
every later endpoint, so it is recorded here rather than buried in a handler.

## 8. Data model

Minimal by design. The full schema (`Batch`, `Enrolment`, `Entry`, `DailyReport`,
`AbsenceRecord`, `Cycle`, `Evaluation`, `Override`, `Award`) is Plan 5 — building it now would
be speculative, and the evaluation half depends on O-6.

```prisma
model User {
  id          String    @id @default(uuid())
  externalId  String    @unique          // Entra oid claim
  email       String    @unique
  displayName String
  role        Role
  deletedAt   DateTime?                  // FR-5: removal hides, never deletes
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

enum Role { ADMIN STUDENT }
```

`deletedAt` ships from the start: FR-5 requires removal to hide rather than delete, and adding
the column later means migrating a live table.

## 9. Error handling

A single Fastify error handler produces Problem Details for every failure path:

| Condition | Status |
|---|---|
| Schema validation failure | `400`, naming the failing pointer |
| Missing, malformed or expired token | `401` |
| Valid token, no `User` record (§7) | `403` |
| Anything unhandled | `500`, no stack leaked |

**Every body carries the active span's `traceId`**, so a user-reported error maps directly to
a trace. Cheap to build, and it serves Deliverable 3's observability criterion.

## 10. Testing

Integration tests run against real Fastify and real Postgres, with tokens signed by a locally
generated key pair and the JWKS endpoint stubbed — the identical validation code path
production uses.

**Four negative tests matter more than the happy path:**

| Test | Proves |
|---|---|
| Extra property in a request body → `400` | `additionalProperties: false` is **live at runtime**, not merely written in the spec |
| Expired token → `401` | Expiry is genuinely verified, not assumed |
| Valid token, unregistered user → `403` | §7's reading is actually enforced |
| Every error body validates as `Problem` | The error contract is real, not documentation |

The first is the entire justification for §4. Without it, "the spec says strict" and "the API
is strict" remain separate claims.

Contract-level gates: `redocly lint` at zero warnings, and CI fails if regenerating types or
the client produces a diff — that staleness check is what makes "generated, never hand-edited"
enforceable rather than a convention.

## 11. CI additions

On PR, added to Plan 1's existing typecheck / lint / test matrix:

- `redocly lint spec/openapi.yaml` — zero errors **and** zero warnings
- Generate types and client, fail on diff
- Build `@irp/core`
- Postgres service container, `prisma migrate deploy`, then integration tests

## 12. Definition of done

- [ ] `redocly lint` — zero errors and zero warnings
- [ ] Regenerating types and client produces no diff
- [ ] `GET /health` returns 200
- [ ] `GET /api/v1/me` returns the caller's identity for a valid signed token
- [ ] All four negative tests pass
- [ ] Every error response validates against the `Problem` schema
- [ ] A trace appears in the console exporter
- [ ] `@irp/core` builds to `dist/` and `apps/api` imports it successfully
- [ ] CI green, including integration tests against a Postgres service container

## 13. A note on size

This plan is larger than Plan 1: an OpenAPI spec, two generation pipelines with a staleness
gate, a Prisma schema and migration, four Fastify plugins, two routes, a build step for
`@irp/core`, and CI additions including a database service container. Plan 1 ran to eleven
tasks; this will likely run to twelve to fifteen.

It stays one plan because it has one definition of done and the pieces are not independently
shippable — a spec with no service proves nothing, and a service with no contract violates
spec-first. If the task breakdown exceeds roughly fifteen, the natural split is
**contract-and-generation** (spec, types, client, lint and staleness gates) from
**service-and-persistence** (Prisma, Fastify, auth, tracing), with the first merging before
the second begins.

## 14. Carried forward

| Item | Resolved in |
|---|---|
| JWKS points at a local stub | Plan 3 — swap to the Entra tenant |
| Console trace exporter | Plan 4 — App Insights connection string |
| `packages/client` generated but unconsumed | Plan 3 — `apps/web` imports it |
| Full data model | Plan 5 |
| **O-6** (rubric wording) | Blocks the evaluation schema, not this plan |
| **O-5** (AI provider) | Blocks Plan 9, not this plan |
