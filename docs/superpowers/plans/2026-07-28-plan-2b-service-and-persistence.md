# Plan 2B — Service and Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `apps/api` — a Fastify service that proves the whole chain end to end (validated request → JWT → Prisma → Postgres → traced RFC 7807 response) for the two endpoints already defined in `spec/openapi.yaml`: `GET /health` and `GET /api/v1/me`.

**Architecture:** A dependency-injected Fastify app. `buildServer(deps)` composes small single-responsibility plugins (tracing, problem-details, auth) and routes; the real entrypoint (`index.ts`) constructs production dependencies and the test harness constructs test doubles. Persistence is Prisma against Postgres 16. Tracing is a hand-written span plugin over `@opentelemetry/sdk-trace-node` (no auto-instrumentation) so it is ESM-safe and deterministic in tests. Runtime request validation uses an Ajv 2020-12 instance (`ajv/dist/2020` + `ajv-formats`); compile-time types come from the generated `@irp/types`.

**Tech Stack:** Fastify 5, Prisma 7 (Postgres 16), `jose` (JWT/JWKS), Ajv 2020-12 + `ajv-formats`, OpenTelemetry SDK (trace, console exporter now / App Insights in Plan 4), Vitest, pnpm workspaces, TypeScript 6 strict, ESM.

## Parent documents

- **Spec:** `docs/superpowers/specs/2026-07-28-plan-2-api-contract-design.md` (§4 the-spec-is-the-source-of-truth, §7 the 403 rule, §8 data model, §9 error handling, §10 testing, §12 definition of done). Plan 2A shipped the contract-and-generation half (§13's split); this plan is the service-and-persistence half.
- **Covers:** FR-1 (partial — no self-registration), FR-2, FR-3 (enforcement side), FR-5 (soft delete). NFR-7, NFR-8. Feeds Deliverable 2 (spec + generated types) and Deliverable 3 (tracing).
- **Handoff:** `handoff.md` §3 "Hard-won constraints Plan 2B must honour" and "Gates that exist".

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from `CLAUDE.md`, the spec, and `handoff.md`.

- **ESM everywhere.** All packages are `"type": "module"`. Relative imports in `apps/api` **must carry explicit `.js` extensions** (as `packages/core` does, e.g. `import { x } from "./config.js"`). Omitting them typechecks under `moduleResolution: Bundler` but fails at runtime in Node ESM.
- **Timezones.** Store UTC; evaluate deadlines/cycles in Asia/Colombo. (No date logic ships in this plan, but the CI 3-timezone matrix still runs.)
- **Pinned versions** (verified against the registry 2026-07-28 — the rule is *newest the ecosystem supports*, not *newest published*):
  - Node `24.x`, pnpm `11.17.0`, TypeScript `6.0.3`, Vitest `4.1.10`.
  - **Fastify `5.10.0`**, `fastify-plugin` `^5.1.0`.
  - **Prisma `7.9.1`** (`prisma` CLI devDep + `@prisma/client` dep). Postgres **16**.
  - **`jose` `6.2.4`** (JWT verify + JWKS).
  - **`ajv` `8.20.0`** (use the **`ajv/dist/2020`** entrypoint) + **`ajv-formats` `3.0.1`**.
  - OpenTelemetry: `@opentelemetry/api` `1.9.1`, `@opentelemetry/sdk-trace-node` `2.10.0`, `@opentelemetry/sdk-trace-base` `2.10.0` (devDep, for `InMemorySpanExporter`), `@opentelemetry/resources` `2.10.0`, `@opentelemetry/semantic-conventions` `1.43.0`.
  - `tsx` `4.23.1` (devDep, local `dev` runner), `cross-env` `^10.1.0` (devDep).
- **Contract rules** (already satisfied by the shipped spec — do not regress): every operation defines `200/400/401/500` (`/api/v1/me` adds `403`); request bodies are `additionalProperties: false`; errors are RFC 7807 Problem Details in `application/problem+json`; `pnpm spec:lint` passes with **zero warnings**.
- **The 403 rule (spec §7).** A structurally valid, correctly signed, unexpired token whose subject (`oid` claim) has **no `User` record** receives **403**, not an auto-created account. There is no self-registration.
- **Soft delete (FR-5).** Removal hides, never deletes. `User.deletedAt` filters every lookup; a soft-deleted user is treated as unregistered (403).
- **Generated code is never committed.** Prisma's generated client goes to a **git-ignored** directory and is added to `eslint.config.mjs` `ignores` with a **package-specific** pattern (never a broad `**/src/**`). A fresh clone regenerates it. This mirrors `packages/types` / `packages/client`.
- **Hard-won ajv constraints (`handoff.md`, ADR-0006):** the spec is OpenAPI 3.1 → JSON Schema **2020-12**, so the validator **must** be `ajv/dist/2020`, not Fastify's default draft-07 ajv (which silently misinterprets keywords). **`ajv-formats` is mandatory** — the document uses `format: uri-reference`, `uuid`, `email`, and an unknown format **throws at schema-compile time** (the API fails at boot, not on a bad request).
- **Prove a gate fails before trusting it.** Any new CI gate must be demonstrated red with a deliberately broken input before it is trusted (`CLAUDE.md`).
- **Git discipline.** One branch, one PR for this plan. Conventional commits. PR names the FRs. No direct commits to `main`.

## Scope decisions taken in this plan (reconcile to the spec)

Two deviations from the spec's §5 layout, both because the shipped endpoint surface is two **GET** operations with **no request bodies**. Recorded here and echoed into the spec and `handoff.md` in Task 10.

1. **`plugins/openapi.ts` (load + dereference + register spec schemas at boot) is deferred to Plan 6.** With no request body to validate, a runtime dereference-and-register loop would be unexercised plumbing (YAGNI). For 2B, the "spec is the source of truth" guarantee is delivered by: (a) handler return types checked against the generated `@irp/types` at compile time, and (b) an `ajv/dist/2020` + `ajv-formats` validator compiler wired into Fastify and **proven by unit test**. `@apidevtools/json-schema-ref-parser` is therefore a Plan 6 dependency, not a 2B one.
2. **Tracing is hand-written, not auto-instrumented.** A ~30-line Fastify span plugin over `@opentelemetry/sdk-trace-node` replaces `@opentelemetry/instrumentation-fastify` / `@fastify/otel`. Rationale in **ADR-0007** (Task 3): module-patching auto-instrumentation needs an ESM loader hook and is non-deterministic to assert in tests; a hand-written plugin is ESM-safe, injectable (Console exporter in prod, `InMemorySpanExporter` in tests), and something we own — the same "rent a property we can own in thirty lines" reasoning the spec §4 applied to rejecting `fastify-openapi-glue`.

The `DayStatus` duplication risk (`handoff.md` "open design risk") **does not materialize in 2B**: the spec surface here is `User`, `Role`, `Problem`, `HealthStatus` — no day-status schema. `@irp/core`'s `DayStatus` union has no spec-generated counterpart until Plan 6. The decision (derive core's unions from `@irp/types`, or assert set-equality in a test) is recorded as a Plan 6 obligation in Task 10.

---

## File structure

New package `apps/api` (picked up by the existing `apps/*` workspace glob; its `src/**` is real hand-written source, correctly linted by the existing type-aware ESLint config — no ignore needed except the generated Prisma dir).

```
apps/api/
  package.json                 deps + scripts
  tsconfig.json                extends base; esModuleInterop for ajv CJS default-imports
  tsconfig.build.json          excludes tests; emits to dist/ (for Plan 4 container)
  vitest.config.ts             node env; fileParallelism off (DB tests share a schema)
  .env.example                 documents every env var
  docker-compose.yml           postgres:16 for local dev + tests
  prisma/
    schema.prisma              User + Role; generated client to git-ignored dir
    migrations/                committed (source of truth for deploy)
  src/
    config.ts                  loadConfig(env) → AppConfig
    validation.ts              buildAjv() (2020 + formats) + Fastify validator compiler
    telemetry.ts               createTracerProvider(exporter) + tracingPlugin + currentTraceId
    errors.ts                  HttpError, UnauthorizedError (401), ForbiddenError (403)
    plugins/
      problem-details.ts       RFC 7807 error + not-found handlers
      auth.ts                  jose verify → oid → userRepo; decorates request.user
    db/
      client.ts                createPrismaClient(url)
      user-repo.ts             UserRecord + createUserRepo(prisma).findByExternalId
    routes/
      health.ts               GET /health
      me.ts                   GET /api/v1/me (+ toApiUser mapper)
    server.ts                  buildServer(deps) — the only place composition order lives
    index.ts                   production entrypoint: real deps → buildServer → listen
    generated/prisma/          GENERATED, git-ignored, never committed
  test/
    helpers/
      keys.ts                  RS256 keypair, JWKS, signToken (local, no HTTP)
      fake-user-repo.ts        in-memory UserRepo for unit tests
      problem-schema.ts        the Problem JSON Schema, for asserting error bodies
      build-test-server.ts     real-Prisma harness for integration tests
      db.ts                    resetDb() truncate helper
    telemetry.test.ts
    problem-details.test.ts
    auth.test.ts
    server.test.ts             composition, no DB (fake repo)
    integration.test.ts        real Fastify + real Postgres
    core-consumption.test.ts   proves apps/api consumes @irp/core's dist build
```

Repo-root edits: `.gitignore` (+ `apps/api/src/generated/`), `eslint.config.mjs` (ignore `apps/api/src/generated/**`), `.github/workflows/ci.yml` (Postgres service + prisma steps), `docs/adr/0007-*.md`, `handoff.md`, `CLAUDE.md`, and a one-line note in the Plan 2 spec.

## Interfaces (the contract between tasks)

An implementer sees only their own task. These are the exact names/types tasks rely on.

```ts
// config.ts
export interface AppConfig {
  port: number; databaseUrl: string;
  jwksUri: string; jwtIssuer: string; jwtAudience: string;
  version: string; nodeEnv: "development" | "test" | "production";
}
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig;

// validation.ts
import type Ajv from "ajv/dist/2020.js";
export function buildAjv(): Ajv;                       // 2020-12 + ajv-formats, strict
export function createValidatorCompiler(ajv: Ajv): FastifySchemaCompiler<unknown>;

// telemetry.ts
import type { SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
export function createTracerProvider(exporter: SpanExporter): NodeTracerProvider;
export const tracingPlugin: FastifyPluginAsync<{ tracerProvider: NodeTracerProvider }>;
export function currentTraceId(request: FastifyRequest): string | undefined;

// errors.ts
export class HttpError extends Error {
  constructor(statusCode: number, problemType: string, title: string, detail: string);
  readonly statusCode: number; readonly problemType: string; readonly title: string;
}
export class UnauthorizedError extends HttpError { constructor(detail?: string); } // 401
export class ForbiddenError   extends HttpError { constructor(detail?: string); } // 403

// db/user-repo.ts
export interface UserRecord {
  id: string; externalId: string; email: string;
  displayName: string; role: "ADMIN" | "STUDENT";
}
export interface UserRepo { findByExternalId(externalId: string): Promise<UserRecord | null>; }
export function createUserRepo(prisma: PrismaClient): UserRepo;

// db/client.ts
export function createPrismaClient(databaseUrl: string): PrismaClient;

// plugins/auth.ts
import type { JWTVerifyGetKey } from "jose";
export interface AuthOptions {
  getKey: JWTVerifyGetKey; issuer: string; audience: string; userRepo: UserRepo;
}
export const authPlugin: FastifyPluginAsync<AuthOptions>;
// decorates: app.authenticate (preHandler) and request.user: UserRecord | null

// server.ts
export interface ServerDeps {
  config: AppConfig; userRepo: UserRepo;
  getKey: JWTVerifyGetKey; tracerProvider: NodeTracerProvider;
}
export function buildServer(deps: ServerDeps): Promise<FastifyInstance>;
```

---

### Task 1: Scaffold `apps/api` + config module

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `apps/api/vitest.config.ts`, `apps/api/.env.example`
- Create: `apps/api/src/config.ts`
- Create test: `apps/api/test/config.test.ts`, `apps/api/test/core-consumption.test.ts`
- Modify: `.gitignore` (add `apps/api/src/generated/`), `eslint.config.mjs` (ignore `apps/api/src/generated/**`), `pnpm-workspace.yaml` (approve build scripts for `@prisma/engines`, `esbuild`, `prisma` — see the note on Step 11)

**Interfaces:**
- Produces: `loadConfig(env): AppConfig` (see Interfaces block).
- Consumes: `@irp/core` (already built to `dist/`), `@irp/types` (already generated).

- [ ] **Step 1: Write `apps/api/package.json`**

```json
{
  "name": "@irp/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "dev": "tsx watch --env-file=.env src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy",
    "db:migrate:dev": "prisma migrate dev"
  },
  "prisma": { "schema": "prisma/schema.prisma" },
  "dependencies": {
    "@irp/core": "workspace:*",
    "@opentelemetry/api": "1.9.1",
    "@opentelemetry/resources": "2.10.0",
    "@opentelemetry/sdk-trace-node": "2.10.0",
    "@opentelemetry/semantic-conventions": "1.43.0",
    "@prisma/client": "7.9.1",
    "ajv": "8.20.0",
    "ajv-formats": "3.0.1",
    "fastify": "5.10.0",
    "fastify-plugin": "^5.1.0",
    "jose": "6.2.4"
  },
  "devDependencies": {
    "@irp/types": "workspace:*",
    "@opentelemetry/sdk-trace-base": "2.10.0",
    "cross-env": "^10.1.0",
    "prisma": "7.9.1",
    "tsx": "4.23.1",
    "typescript": "^6.0.3",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 2: Write `apps/api/tsconfig.json`**

`esModuleInterop` is enabled **here only** (a hand-written app package). It is an interop setting, not a strictness relaxation, and it does not leak to `tsconfig.base.json`. Reason: `ajv/dist/2020` and `ajv-formats` are CommonJS with default exports; under the base's `verbatimModuleSyntax` a bare default import of a CJS module otherwise errors.

```json
{
  "_comment": "esModuleInterop is set here and only here: ajv/dist/2020 and ajv-formats are CJS default-exports, and the base config's verbatimModuleSyntax rejects default-importing them without interop. This is an interop flag, not a strictness relaxation, so tsconfig.base.json stays untouched (CLAUDE.md: relax only in a package's own tsconfig).",
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

**Corrected during implementation (Task 1):** `rootDir` must NOT be set here. Unlike `packages/core`, this package keeps tests in a top-level `test/` directory outside `src/`, and `tsconfig.json`'s `include` covers both `src/**/*` and `test/**/*`. Combining an explicit `rootDir: "./src"` with `test/**/*` in `include` makes every test file a TS6059 error ("File is not under 'rootDir'") the moment `tsc --noEmit` (the `typecheck` script) runs — `test/**/*` doesn't live under `src`. `rootDir` is only meaningful for the emitting build, so it moves to `tsconfig.build.json`, which already excludes the test directories and therefore satisfies the constraint.

- [ ] **Step 3: Write `apps/api/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "rootDir": "./src" },
  "exclude": ["src/**/*.test.ts", "test/**/*", "src/**/*.spec.ts"]
}
```

- [ ] **Step 4: Write `apps/api/vitest.config.ts`**

`fileParallelism: false` so integration tests that share the one Postgres schema do not truncate each other's rows concurrently.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Write `apps/api/.env.example`**

```dotenv
# apps/api runtime configuration. Copy to .env for local dev (git-ignored).
PORT=3001
NODE_ENV=development
APP_VERSION=0.0.0

# Postgres — matches docker-compose.yml
DATABASE_URL=postgresql://irp:irp@localhost:5432/irp?schema=public

# Microsoft Entra ID. Local dev/tests use a stubbed JWKS (see test/helpers/keys.ts);
# these are the production shape, swapped to the tenant in Plan 3.
JWKS_URI=https://login.microsoftonline.com/common/discovery/v2.0/keys
JWT_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
JWT_AUDIENCE=api://irp-progress-management
```

- [ ] **Step 6: Add the generated-Prisma dir to `.gitignore` and `eslint.config.mjs`**

Append to `.gitignore`:

```gitignore
apps/api/src/generated/
```

In `eslint.config.mjs`, add `"apps/api/src/generated/**"` to the top-level `ignores` array (the block that already lists `packages/types/src/**`). Package-specific pattern, per `CLAUDE.md` — never `**/src/**`.

- [ ] **Step 7: Write the failing config test** — `apps/api/test/config.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

const base = {
  DATABASE_URL: "postgresql://irp:irp@localhost:5432/irp?schema=public",
  JWKS_URI: "https://example/keys",
  JWT_ISSUER: "https://issuer/v2.0",
  JWT_AUDIENCE: "api://irp",
};

describe("loadConfig", () => {
  it("applies defaults for optional vars", () => {
    const c = loadConfig({ ...base });
    expect(c.port).toBe(3001);
    expect(c.version).toBe("0.0.0");
    expect(c.nodeEnv).toBe("development");
  });

  it("parses PORT as a number", () => {
    expect(loadConfig({ ...base, PORT: "8080" }).port).toBe(8080);
  });

  it("throws listing every missing required var", () => {
    expect(() => loadConfig({})).toThrowError(
      /DATABASE_URL.*JWKS_URI.*JWT_ISSUER.*JWT_AUDIENCE/s,
    );
  });

  it("rejects a non-numeric PORT", () => {
    expect(() => loadConfig({ ...base, PORT: "not-a-number" })).toThrowError(/PORT/);
  });

  it.each(["development", "test", "production"] as const)(
    "accepts NODE_ENV=%s",
    (value) => {
      expect(loadConfig({ ...base, NODE_ENV: value }).nodeEnv).toBe(value);
    },
  );

  it("rejects an invalid NODE_ENV", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "staging" })).toThrowError(
      /NODE_ENV.*staging.*development.*test.*production/is,
    );
  });
});
```

**Added during implementation (code review fix):** the `NODE_ENV` validation cases above
were added after the initial pass shipped an unchecked cast instead of validation — see the
note after Step 9.

- [ ] **Step 8: Run it to confirm it fails**

Run: `pnpm --filter @irp/api test`
Expected: FAIL — `loadConfig` is not defined / module missing.

- [ ] **Step 9: Implement `apps/api/src/config.ts`**

```ts
type Env = NodeJS.ProcessEnv;

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwksUri: string;
  jwtIssuer: string;
  jwtAudience: string;
  version: string;
  nodeEnv: "development" | "test" | "production";
}

const REQUIRED_ENV_NAMES = {
  databaseUrl: "DATABASE_URL",
  jwksUri: "JWKS_URI",
  jwtIssuer: "JWT_ISSUER",
  jwtAudience: "JWT_AUDIENCE",
} as const;

const VALID_NODE_ENVS = ["development", "test", "production"] as const;

export function loadConfig(env: Env): AppConfig {
  const required = {
    databaseUrl: env.DATABASE_URL,
    jwksUri: env.JWKS_URI,
    jwtIssuer: env.JWT_ISSUER,
    jwtAudience: env.JWT_AUDIENCE,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => REQUIRED_ENV_NAMES[k as keyof typeof REQUIRED_ENV_NAMES]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const port = env.PORT === undefined ? 3001 : Number(env.PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got: ${String(env.PORT)}`);
  }

  const rawNodeEnv = env.NODE_ENV ?? "development";
  if (!(VALID_NODE_ENVS as readonly string[]).includes(rawNodeEnv)) {
    throw new Error(
      `Invalid NODE_ENV "${rawNodeEnv}": must be one of ${VALID_NODE_ENVS.join(", ")}`,
    );
  }
  const nodeEnv = rawNodeEnv as AppConfig["nodeEnv"];

  return {
    port,
    databaseUrl: required.databaseUrl!,
    jwksUri: required.jwksUri!,
    jwtIssuer: required.jwtIssuer!,
    jwtAudience: required.jwtAudience!,
    version: env.APP_VERSION ?? "0.0.0",
    nodeEnv,
  };
}
```

**Corrected during implementation (Task 1, code review fix):** `nodeEnv` must not be an
unchecked cast of `env.NODE_ENV` — that would silently accept a value like `"staging"`
into a union typed as only `"development" | "test" | "production"`. Validate it loudly,
the same way missing vars and a bad `PORT` are already rejected: unset defaults to
`"development"`; one of the three valid values is accepted as-is; anything else throws,
naming the offending value and the allowed set. The field→env-name map used when reporting
missing vars is also hoisted to a module-level constant (`REQUIRED_ENV_NAMES`) instead of
being rebuilt on every `.map()` iteration.

- [ ] **Step 10: Write the `@irp/core` consumption smoke test** — `apps/api/test/core-consumption.test.ts`

Proves the DoD item "`@irp/core` builds to `dist/` and `apps/api` imports it successfully." Import a real pure export and exercise it. Confirm the exact export name against `packages/core/src/index.ts` before writing (it re-exports the date/cycle engine).

```ts
import { describe, it, expect } from "vitest";
import * as core from "@irp/core";

describe("@irp/core dist consumption", () => {
  it("resolves the built package and exposes classifyDay", () => {
    // @irp/core.main points at dist/index.js — this fails unless core was built.
    expect(typeof core.classifyDay).toBe("function");
  });
});
```

- [ ] **Step 11: Install, build core, run typecheck + tests**

Run:
```bash
pnpm install
pnpm --filter @irp/core build
pnpm --filter @irp/api typecheck
pnpm --filter @irp/api test
```
Expected: install adds the new deps; typecheck passes; config tests pass; core-consumption test passes.

**Note — pnpm 11 build-script gate:** the first `pnpm install` that resolves `@prisma/client`/`prisma` will print `[ERR_PNPM_IGNORED_BUILDS]` and pnpm's automatic pre-command dependency-status check (triggered by any `pnpm --filter ... test`/`typecheck`) then fails hard with a non-zero exit before the underlying command runs — CI and a fresh clone hit this too, not just an interactive shell. Fix it in `pnpm-workspace.yaml`'s `allowBuilds` map by setting `@prisma/engines`, `esbuild`, and `prisma` to `true` (pnpm auto-generates the stub with a placeholder string on first install; this task turns it into real booleans). This is required for `pnpm install` to succeed non-interactively — do it before Step 11's install, not after.

- [ ] **Step 12: Commit**

```bash
git add apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json \
  apps/api/vitest.config.ts apps/api/.env.example apps/api/src/config.ts \
  apps/api/test/config.test.ts apps/api/test/core-consumption.test.ts \
  .gitignore eslint.config.mjs pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(api): scaffold apps/api package and config module (FR-1, FR-2)"
```

---

### Task 2: Validation compiler (Ajv 2020-12 + ajv-formats)

The load-bearing anti-drift mechanism for runtime bodies. No shipped endpoint has a body yet, so this is proven by unit test now and consumed by real routes in Plan 6. **This is the concrete satisfaction of spec §10's first negative test** ("`additionalProperties: false` is live at runtime") at the validator level, since neither GET endpoint carries a body to reject.

**Files:**
- Create: `apps/api/src/validation.ts`
- Create test: `apps/api/test/validation.test.ts`

**Interfaces:**
- Produces: `buildAjv(): Ajv`, `createValidatorCompiler(ajv): FastifySchemaCompiler`.

- [ ] **Step 1: Write the failing test** — `apps/api/test/validation.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildAjv } from "../src/validation.js";

describe("buildAjv", () => {
  it("enforces additionalProperties:false at runtime", () => {
    const ajv = buildAjv();
    const validate = ajv.compile({
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: { name: { type: "string" } },
    });
    expect(validate({ name: "ok" })).toBe(true);
    expect(validate({ name: "ok", extra: "nope" })).toBe(false);
  });

  it("compiles format: uuid / email / uri-reference without throwing (ajv-formats present)", () => {
    const ajv = buildAjv();
    // Missing ajv-formats makes this THROW at compile time (the boot-failure trap, ADR-0006).
    expect(() =>
      ajv.compile({
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          email: { type: "string", format: "email" },
          type: { type: "string", format: "uri-reference" },
        },
      }),
    ).not.toThrow();
  });

  it("interprets 2020-12 keywords (prefixItems) rather than draft-07", () => {
    const ajv = buildAjv();
    // minItems/maxItems are required by ajv strict mode's strictTuples check
    // (a prefixItems tuple must pin the array length). They also sharpen the
    // 2020-12-vs-draft-07 discrimination: under draft-07 `prefixItems` is
    // unknown and ignored, so with `items: false` the array `["a", 1]` would
    // be rejected (no items permitted); under 2020-12 prefixItems covers the
    // first two and `items: false` forbids a third — so a valid ["a", 1]
    // proves the 2020-12 dialect is in force.
    const validate = ajv.compile({
      type: "array",
      prefixItems: [{ type: "string" }, { type: "number" }],
      items: false,
      minItems: 2,
      maxItems: 2,
    });
    expect(validate(["a", 1])).toBe(true);
    expect(validate(["a", 1, "extra"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @irp/api test validation`
Expected: FAIL — `buildAjv` not defined.

- [ ] **Step 3: Implement `apps/api/src/validation.ts`**

```ts
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { FastifySchemaCompiler } from "fastify";

/**
 * The one Ajv instance the service validates with.
 *
 * `ajv/dist/2020` — the spec is OpenAPI 3.1, whose schemas are JSON Schema
 * 2020-12. Fastify's default ajv is draft-07 and silently misinterprets 2020-12
 * keywords (ADR-0006). `ajv-formats` is mandatory: the document uses
 * format: uuid / email / uri-reference, and an unknown format throws at
 * compile time — the API would fail at boot, not on a bad request.
 */
export function buildAjv(): Ajv {
  const ajv = new Ajv({
    strict: true,
    allErrors: true,
    coerceTypes: false,
    removeAdditional: false,
    useDefaults: false,
  });
  addFormats(ajv);
  return ajv;
}

export function createValidatorCompiler(ajv: Ajv): FastifySchemaCompiler<unknown> {
  return ({ schema }) => ajv.compile(schema as object);
}
```

If `verbatimModuleSyntax` still rejects the default imports despite `esModuleInterop`, the fallback is `import { Ajv2020 as Ajv } from "ajv/dist/2020.js"` (Ajv v8 also exports the class as a named `Ajv2020`); prefer the default import first.

- [ ] **Step 4: Run tests to confirm they pass**

Run: `pnpm --filter @irp/api test validation`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/validation.ts apps/api/test/validation.test.ts
git commit -m "feat(api): 2020-12 ajv validator compiler with formats (NFR-8)"
```

---

### Task 3: Telemetry — hand-written span plugin + ADR-0007

**Files:**
- Create: `docs/adr/0007-hand-written-tracing-over-auto-instrumentation.md`
- Create: `apps/api/src/telemetry.ts`
- Create test: `apps/api/test/telemetry.test.ts`

**Interfaces:**
- Produces: `createTracerProvider(exporter)`, `tracingPlugin`, `currentTraceId(request)`.
- Consumes: `fastify-plugin`.

- [ ] **Step 1: Write ADR-0007** — `docs/adr/0007-hand-written-tracing-over-auto-instrumentation.md`

Follow the existing ADR format (see `docs/adr/0006-*.md`). Must name **at least two rejected alternatives**. Content:

- **Status:** Accepted. **Date:** 2026-07-28.
- **Context:** Deliverable 3 needs every request traced and each Problem body to carry the active `traceId`. `apps/api` is ESM.
- **Decision:** A hand-written Fastify plugin creates one span per request via `@opentelemetry/sdk-trace-node`, storing it on the request; the tracer provider and its exporter are injected into `buildServer`.
- **Rejected — `@opentelemetry/instrumentation-fastify` (+ `-http`):** auto-patches modules, which under ESM requires a `--experimental-loader`/`register` hook, and its span lifecycle is awkward to assert deterministically in tests.
- **Rejected — `@fastify/otel`:** removes the loader-hook problem but still owns span naming/lifecycle we want to control, adds a dependency for ~30 lines we can own, and couples trace-id retrieval to its internals.
- **Rejected — a global `NodeSDK` singleton with a console exporter:** global mutable state makes tests order-dependent and prevents swapping in `InMemorySpanExporter` per test.
- **Consequences:** injectable exporter (Console in prod → Azure Monitor in Plan 4, `InMemorySpanExporter` in tests); no ESM loader flags; `traceId` read directly off the request. We forgo automatic spans for downstream calls (Prisma/HTTP) — acceptable now; revisit if per-dependency spans are needed.

- [ ] **Step 2: Write the failing test** — `apps/api/test/telemetry.test.ts`

```ts
import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createTracerProvider, tracingPlugin, currentTraceId } from "../src/telemetry.js";

describe("tracing", () => {
  it("records exactly one span per request, carrying the status code", async () => {
    const exporter = new InMemorySpanExporter();
    const provider = createTracerProvider(exporter);
    const app = Fastify();
    await app.register(tracingPlugin, { tracerProvider: provider });
    let seenTraceId: string | undefined;
    app.get("/probe", async (req) => {
      seenTraceId = currentTraceId(req);
      return { ok: true };
    });

    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(200);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.attributes["http.status_code"]).toBe(200);
    // The id the handler saw is a real 32-hex trace id and matches the exported span.
    expect(seenTraceId).toMatch(/^[0-9a-f]{32}$/);
    expect(seenTraceId).toBe(spans[0]?.spanContext().traceId);

    await app.close();
    await provider.shutdown();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter @irp/api test telemetry`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `apps/api/src/telemetry.ts`**

```ts
import { trace, type Span } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  NodeTracerProvider,
  SimpleSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import fp from "fastify-plugin";
import type { FastifyRequest } from "fastify";

const INVALID_TRACE_ID = "0".repeat(32);

declare module "fastify" {
  interface FastifyRequest {
    span?: Span;
  }
}

export function createTracerProvider(exporter: SpanExporter): NodeTracerProvider {
  return new NodeTracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: "irp-api" }),
    // SimpleSpanProcessor exports on span end — deterministic for tests.
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
}

export const tracingPlugin = fp<{ tracerProvider: NodeTracerProvider }>(
  async (app, opts) => {
    const tracer = opts.tracerProvider.getTracer("irp-api");
    app.addHook("onRequest", async (req) => {
      const name = `${req.method} ${req.routeOptions.url ?? req.url}`;
      req.span = tracer.startSpan(name);
    });
    app.addHook("onError", async (req, _reply, err) => {
      req.span?.recordException(err);
    });
    app.addHook("onResponse", async (req, reply) => {
      req.span?.setAttribute("http.status_code", reply.statusCode);
      req.span?.end();
    });
  },
  { name: "tracing" },
);

export function currentTraceId(request: FastifyRequest): string | undefined {
  const ctx = request.span?.spanContext();
  if (!ctx || ctx.traceId === INVALID_TRACE_ID) return undefined;
  return ctx.traceId;
}
```

`trace` is imported for type parity with `@opentelemetry/api`; if unused after implementation, drop the import to satisfy `no-unused-vars`.

- [ ] **Step 5: Run tests to confirm they pass**

Run: `pnpm --filter @irp/api test telemetry`
Expected: PASS. If `NodeTracerProvider` rejects the `spanProcessors` constructor option, confirm the installed `@opentelemetry/sdk-trace-node` is `2.10.0` (the 2.x constructor takes `spanProcessors`; 1.x used `addSpanProcessor`).

- [ ] **Step 6: Commit**

```bash
git add docs/adr/0007-hand-written-tracing-over-auto-instrumentation.md \
  apps/api/src/telemetry.ts apps/api/test/telemetry.test.ts
git commit -m "feat(api): hand-written request tracing plugin, ADR-0007 (D3)"
```

---

### Task 4: Errors + RFC 7807 Problem Details handler

**Files:**
- Create: `apps/api/src/errors.ts`, `apps/api/src/plugins/problem-details.ts`
- Create: `apps/api/test/helpers/problem-schema.ts`
- Create test: `apps/api/test/problem-details.test.ts`

**Interfaces:**
- Produces: `HttpError`, `UnauthorizedError`, `ForbiddenError`, `problemDetailsPlugin`.
- Consumes: `currentTraceId` (Task 3), `buildAjv` (Task 2).

- [ ] **Step 1: Write `apps/api/src/errors.ts`**

```ts
const PROBLEM_BASE = "https://irp.bistec.example/problems";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly problemType: string,
    readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(detail = "Authentication required.") {
    super(401, `${PROBLEM_BASE}/unauthorized`, "Authentication required", detail);
  }
}

export class ForbiddenError extends HttpError {
  constructor(detail = "This account has not been registered by an Admin.") {
    super(403, `${PROBLEM_BASE}/not-registered`, "Not a registered user", detail);
  }
}
```

- [ ] **Step 2: Write the Problem schema helper** — `apps/api/test/helpers/problem-schema.ts`

A runtime copy of the spec's `Problem` schema so tests can assert error bodies conform. (In Plan 6 this comes from the dereferenced spec; hand-mirrored here to keep 2B free of the spec loader.)

```ts
export const problemSchema = {
  type: "object",
  required: ["type", "title", "status", "traceId"],
  additionalProperties: true,
  properties: {
    type: { type: "string", format: "uri-reference" },
    title: { type: "string" },
    status: { type: "integer", minimum: 100, maximum: 599 },
    detail: { type: "string" },
    instance: { type: "string", format: "uri-reference" },
    traceId: { type: "string" },
  },
} as const;
```

- [ ] **Step 3: Write the failing test** — `apps/api/test/problem-details.test.ts`

```ts
import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createTracerProvider, tracingPlugin } from "../src/telemetry.js";
import { problemDetailsPlugin } from "../src/plugins/problem-details.js";
import { UnauthorizedError, ForbiddenError } from "../src/errors.js";
import { buildAjv } from "../src/validation.js";
import { problemSchema } from "./helpers/problem-schema.js";

async function appWith(handler: () => never) {
  const provider = createTracerProvider(new InMemorySpanExporter());
  const app = Fastify();
  await app.register(tracingPlugin, { tracerProvider: provider });
  await app.register(problemDetailsPlugin);
  app.get("/boom", async () => handler());
  return app;
}

const validate = buildAjv().compile(problemSchema);

describe("problem-details handler", () => {
  it("maps UnauthorizedError to a 401 Problem body", async () => {
    const app = await appWith(() => { throw new UnauthorizedError("The bearer token has expired."); });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(401);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json();
    expect(body.status).toBe(401);
    expect(body.title).toBe("Authentication required");
    expect(body.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(body.instance).toBe("/boom");
    expect(validate(body)).toBe(true);
    await app.close();
  });

  it("maps ForbiddenError to a 403 Problem body", async () => {
    const app = await appWith(() => { throw new ForbiddenError(); });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(403);
    expect(res.json().status).toBe(403);
    expect(validate(res.json())).toBe(true);
    await app.close();
  });

  it("maps an unexpected error to 500 without leaking the message", async () => {
    const app = await appWith(() => { throw new Error("secret db string"); });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.detail).not.toContain("secret db string");
    expect(body.title).toBe("Internal Server Error");
    expect(validate(body)).toBe(true);
    await app.close();
  });

  it("returns a Problem-shaped 404 for unknown routes", async () => {
    const app = await appWith(() => { throw new Error("unused"); });
    const res = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(validate(res.json())).toBe(true);
    await app.close();
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `pnpm --filter @irp/api test problem-details`
Expected: FAIL — `problemDetailsPlugin` not defined.

- [ ] **Step 5: Implement `apps/api/src/plugins/problem-details.ts`**

```ts
import fp from "fastify-plugin";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { HttpError } from "../errors.js";
import { currentTraceId } from "../telemetry.js";

interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  traceId?: string;
}

function send(reply: FastifyReply, req: FastifyRequest, body: Omit<ProblemBody, "traceId">) {
  const traceId = currentTraceId(req);
  reply
    .status(body.status)
    .header("content-type", "application/problem+json")
    .send({ ...body, ...(traceId ? { traceId } : {}) });
}

export const problemDetailsPlugin = fp(
  async (app) => {
    app.setErrorHandler((err: FastifyError, req, reply) => {
      if (err instanceof HttpError) {
        return send(reply, req, {
          type: err.problemType,
          title: err.title,
          status: err.statusCode,
          detail: err.message,
          instance: req.url,
        });
      }
      if (err.validation) {
        return send(reply, req, {
          type: "https://irp.bistec.example/problems/validation-failed",
          title: "Request validation failed",
          status: 400,
          detail: err.message,
          instance: req.url,
        });
      }
      // Unexpected: log server-side, never leak the message to the client.
      req.log.error({ err }, "unhandled error");
      return send(reply, req, {
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
        detail: "An unexpected error occurred.",
        instance: req.url,
      });
    });

    app.setNotFoundHandler((req, reply) => {
      send(reply, req, {
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: "No route matches this path.",
        instance: req.url,
      });
    });
  },
  { name: "problem-details", dependencies: ["tracing"] },
);
```

- [ ] **Step 6: Run tests to confirm they pass**

Run: `pnpm --filter @irp/api test problem-details`
Expected: PASS (all four).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/errors.ts apps/api/src/plugins/problem-details.ts \
  apps/api/test/helpers/problem-schema.ts apps/api/test/problem-details.test.ts
git commit -m "feat(api): RFC 7807 problem-details error handler with traceId (NFR-7)"
```

---

### Task 5: Prisma schema, migration, and user repository

**Files:**
- Create: `apps/api/docker-compose.yml`, `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts`
- Create: `apps/api/src/db/client.ts`, `apps/api/src/db/user-repo.ts`
- Create test: `apps/api/test/helpers/db.ts`, `apps/api/test/user-repo.test.ts`
- Create ADR: `docs/adr/0008-prisma-driver-adapter-over-accelerate.md`
- Modify: `apps/api/package.json` (add `@prisma/adapter-pg`, drop the now-redundant `prisma` key)
- Generated (git-ignored): `apps/api/prisma/migrations/**` is committed; `apps/api/src/generated/prisma/**` is not.

**Interfaces:**
- Produces: `createPrismaClient(url)`, `UserRecord`, `UserRepo`, `createUserRepo(prisma)`, `resetDb(prisma)`.

> #### ⚠️ Plan corrected 2026-07-28 — Prisma 7 removed both mechanisms this task originally used
>
> The first attempt at this task failed at Step 3 on `P1012`, before touching a database. Two
> separate Prisma 7 breaking changes were involved, and the original Steps 2–4 tripped both:
>
> 1. **`url` is no longer allowed in the schema's `datasource` block.** The CLI reads the
>    connection URL from a `prisma.config.ts` instead. `prisma validate`, `migrate` and
>    `generate` all refuse to load a schema that still declares it.
> 2. **`datasourceUrl` no longer exists as a `PrismaClient` option.** `PrismaClientOptions` is
>    now a union of `{ adapter }` and `{ accelerateUrl }` — a driver adapter is *required* for a
>    direct connection. Verified against `@prisma/client@7.9.1`'s own typings, which state
>    "A driver adapter (or, alternatively, a Prisma Accelerate URL) is **required**."
>
> Choosing `@prisma/adapter-pg` over Accelerate is a real decision with plausible alternatives,
> so it gets **ADR-0008** (Step 0 below). The whole corrected chain — config load, migrate,
> generate, adapter-backed client, CRUD, `TRUNCATE` — was verified end-to-end by the controller
> before this correction was written, so the code below is known-good rather than inferred.

- [ ] **Step 0: Write `docs/adr/0008-prisma-driver-adapter-over-accelerate.md`**

Decision: connect through the `@prisma/adapter-pg` driver adapter. Prisma 7 forces a choice
here; record it. Name at least two rejected alternatives, per `CLAUDE.md`:

- **Prisma Accelerate (`accelerateUrl`)** — rejected: a third-party connection-pooling proxy
  that student submissions (personal data) would transit, which is the same class of concern as
  O-5, and it needs an account the programme has not provisioned.
- **Downgrade to Prisma 6 to keep `url` + `datasourceUrl`** — rejected: `CLAUDE.md` pins Prisma
  7.9.1 and the rule is *newest version the ecosystem supports*; nothing here is unsupported,
  the API merely moved.
- **`@prisma/adapter-pg` (chosen)** — first-party, no external service, `pg` and `@types/pg`
  arrive as its own dependencies so it is a single line in `package.json`.

Note in the ADR that the adapter also becomes the seam where connection pooling is configured
later, which matters for the NFR-1 target of p95 < 250 ms at 50 RPS.

- [ ] **Step 1: Write `apps/api/docker-compose.yml`**

The host port is parameterised. A developer machine may already have another project's Postgres
on 5432 — this happened on the first run of this task — and hard-coding it makes the compose
file unusable there. The default keeps every command below, and CI, unchanged.

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: irp
      POSTGRES_PASSWORD: irp
      POSTGRES_DB: irp
    ports:
      - "${IRP_DB_PORT:-5432}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U irp -d irp"]
      interval: 2s
      timeout: 5s
      retries: 15
```

- [ ] **Step 2: Write `apps/api/prisma/schema.prisma`**

The Prisma 7 `prisma-client` generator emits ESM to a **git-ignored** output dir (mirrors
`packages/types`/`packages/client`). The `datasource` block carries **`provider` only** — see
the correction note above.

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
  runtime  = "nodejs"
}

datasource db {
  provider = "postgresql"
}

/// A registered participant. FR-5: removal hides via deletedAt, never deletes.
model User {
  id          String    @id @default(uuid())
  externalId  String    @unique // Entra oid claim
  email       String    @unique
  displayName String
  role        Role
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

enum Role {
  ADMIN
  STUDENT
}
```

- [ ] **Step 2a: Write `apps/api/prisma.config.ts`, add the adapter, drop the redundant `prisma` key**

```ts
import { defineConfig, env } from "prisma/config";

// Prisma 7 removed `url` from the schema's datasource block. The CLI (migrate,
// introspect) reads the connection URL from here instead; the runtime client
// gets it via a driver adapter in src/db/client.ts. See ADR-0008.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

Then in `apps/api/package.json`:
- add `"@prisma/adapter-pg": "7.9.1"` to `dependencies` (exact, matching the `prisma` /
  `@prisma/client` pin). It brings `pg` and `@types/pg` as its own dependencies — do **not** add
  those separately.
- **delete the `"prisma": { "schema": "prisma/schema.prisma" }` key.** `prisma.config.ts` now
  declares `schema`, and two sources for one value is exactly the drift this repo avoids.

`pnpm add` also appends `@prisma/adapter-pg@7.9.1` and `@prisma/driver-adapter-utils@7.9.1` to
`minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. That is expected — commit it.

- [ ] **Step 3: Start Postgres, create the initial migration, generate the client**

> **Run every database-touching command through PowerShell, not the Bash tool.** The Bash tool
> is sandboxed and cannot open a TCP connection to a localhost port — `migrate dev` fails with
> `P1001: Can't reach database server` even while the container is healthy and the port is
> proven reachable from the host. This wastes a diagnosis cycle if you hit it cold. Use
> `127.0.0.1` rather than `localhost`, since `localhost` resolves to `::1` here.

```powershell
$env:IRP_DB_PORT = "5432"   # set to 5433 if 5432 is already taken on this machine
docker compose -f apps/api/docker-compose.yml up -d
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:$($env:IRP_DB_PORT)/irp?schema=public"
pnpm --filter @irp/api exec prisma migrate dev --name init
pnpm --filter @irp/api exec prisma generate
```

Expected: `Loaded Prisma config from prisma.config.ts.`, then a migration under
`apps/api/prisma/migrations/<ts>_init/`, then `✔ Generated Prisma Client (7.9.1) to
.\src\generated\prisma`. Verify `git status` shows the migration but **not** the generated dir.

The generator emits its entry as `client.ts` → `client.js`, alongside `models.ts`, `enums.ts`,
`browser.ts`, `commonInputTypes.ts` and the `internal/` + `models/` dirs. This is confirmed
against 7.9.1, so `../generated/prisma/client.js` in Step 4 is correct as written.

- [ ] **Step 4: Implement `apps/api/src/db/client.ts`**

The generated path is `../generated/prisma` relative to `src/db/`, and the entry is `client.js`
as confirmed in Step 3. The connection URL reaches the client through a **`PrismaPg` driver
adapter**, not the removed `datasourceUrl` option — see the correction note and ADR-0008. The
signature stays `createPrismaClient(databaseUrl: string)`, so no caller changes.

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
```

<details>
<summary>Superseded pre-Prisma-7 version, kept so the correction is legible</summary>

```ts
import { PrismaClient } from "../generated/prisma/client.js";

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl });
}
```

`datasourceUrl` is not a valid `PrismaClientOptions` member in Prisma 7 — this does not compile.

</details>

- [ ] **Step 5: Write the failing repo test** — `apps/api/test/user-repo.test.ts`

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createPrismaClient } from "../src/db/client.js";
import { createUserRepo } from "../src/db/user-repo.js";
import { resetDb } from "./helpers/db.js";

const dbUrl = process.env.DATABASE_URL;

describe.skipIf(!dbUrl)("createUserRepo", () => {
  const prisma = createPrismaClient(dbUrl!);
  const repo = createUserRepo(prisma);

  beforeEach(async () => { await resetDb(prisma); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("finds an active user by externalId", async () => {
    await prisma.user.create({
      data: { externalId: "oid-1", email: "a@bistecglobal.com", displayName: "Amaya", role: "STUDENT" },
    });
    const found = await repo.findByExternalId("oid-1");
    expect(found?.email).toBe("a@bistecglobal.com");
    expect(found?.role).toBe("STUDENT");
  });

  it("returns null for an unknown externalId", async () => {
    expect(await repo.findByExternalId("nobody")).toBeNull();
  });

  it("hides a soft-deleted user (FR-5) — treated as unregistered", async () => {
    await prisma.user.create({
      data: { externalId: "oid-2", email: "b@bistecglobal.com", displayName: "Ben", role: "ADMIN", deletedAt: new Date() },
    });
    expect(await repo.findByExternalId("oid-2")).toBeNull();
  });
});
```

- [ ] **Step 6: Write `apps/api/test/helpers/db.ts`**

```ts
import type { PrismaClient } from "../../src/generated/prisma/client.js";

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" RESTART IDENTITY CASCADE');
}
```

- [ ] **Step 7: Run it to confirm it fails**

In PowerShell, with `$env:DATABASE_URL` still set from Step 3 (the Bash tool cannot reach the
database — see the Step 3 note):

```powershell
pnpm --filter @irp/api test user-repo
```

Expected: FAIL — `createUserRepo` not defined. If instead all three tests *skip*, `DATABASE_URL`
is unset in this shell and `describe.skipIf` swallowed them — a green-looking no-op. Confirm the
run reports three failures, not three skips.

- [ ] **Step 8: Implement `apps/api/src/db/user-repo.ts`**

```ts
import type { PrismaClient } from "../generated/prisma/client.js";

export interface UserRecord {
  id: string;
  externalId: string;
  email: string;
  displayName: string;
  // Mirrors the generated Prisma `Role` enum. Unlike the DayStatus duplication in
  // handoff.md §3, this one is compiler-checked: `role: u.role` below is assigned
  // against this interface, so a third Role member would fail typecheck, not drift.
  role: "ADMIN" | "STUDENT";
}

export interface UserRepo {
  findByExternalId(externalId: string): Promise<UserRecord | null>;
}

export function createUserRepo(prisma: PrismaClient): UserRepo {
  return {
    async findByExternalId(externalId) {
      const u = await prisma.user.findFirst({
        where: { externalId, deletedAt: null }, // FR-5: soft-deleted users are hidden
      });
      if (!u) return null;
      return {
        id: u.id,
        externalId: u.externalId,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
      };
    },
  };
}
```

- [ ] **Step 9: Run tests to confirm they pass**

In the same PowerShell session: `pnpm --filter @irp/api test user-repo`

Expected: PASS (all three). Then run the whole suite — `pnpm --filter @irp/api test` — and
confirm **20 passing** (the 17 from Tasks 1–4 plus these three), followed by
`pnpm --filter @irp/api typecheck` and the repo lint at zero warnings.

- [ ] **Step 10: Commit**

```bash
git add apps/api/docker-compose.yml apps/api/prisma/schema.prisma \
  apps/api/prisma.config.ts apps/api/prisma/migrations \
  apps/api/src/db/client.ts apps/api/src/db/user-repo.ts \
  apps/api/test/helpers/db.ts apps/api/test/user-repo.test.ts \
  apps/api/package.json pnpm-lock.yaml pnpm-workspace.yaml \
  docs/adr/0008-prisma-driver-adapter-over-accelerate.md \
  docs/superpowers/plans/2026-07-28-plan-2b-service-and-persistence.md
git commit -m "feat(api): User model, migration, soft-delete-aware repo (FR-5, FR-3)"
```

Confirm `git status` still shows `apps/api/src/generated/` as untracked/ignored — it must not be
staged. The plan file is included because this task's correction is committed alongside the code
it fixes, per `CLAUDE.md`.

---

### Task 6: Auth plugin (jose JWT verification → oid → user)

**Files:**
- Create: `apps/api/src/plugins/auth.ts`
- Create test: `apps/api/test/helpers/keys.ts`, `apps/api/test/helpers/fake-user-repo.ts`, `apps/api/test/auth.test.ts`

**Interfaces:**
- Produces: `authPlugin`, decorates `app.authenticate` and `request.user`.
- Consumes: `UnauthorizedError`, `ForbiddenError` (Task 4), `UserRepo`/`UserRecord` (Task 5).

- [ ] **Step 1: Write `apps/api/test/helpers/keys.ts`**

A local RS256 keypair + a `createLocalJWKSet`-compatible getKey and a signer — the identical `jwtVerify` code path production uses, with no HTTP (spec §10).

```ts
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWTVerifyGetKey } from "jose";

const ISS = "https://issuer.test/v2.0";
const AUD = "api://irp-test";
const KID = "test-key-1";

export const testIssuer = ISS;
export const testAudience = AUD;

const keys = await generateKeyPair("RS256", { extractable: true });

export async function getLocalKeySet(): Promise<JWTVerifyGetKey> {
  const jwk = await exportJWK(keys.publicKey);
  return createLocalJWKSet({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] });
}

interface SignOpts { oid?: string; issuer?: string; audience?: string; expiresIn?: string; }

export async function signToken(opts: SignOpts = {}): Promise<string> {
  return new SignJWT({ oid: opts.oid ?? "oid-1" })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuedAt()
    .setIssuer(opts.issuer ?? ISS)
    .setAudience(opts.audience ?? AUD)
    .setExpirationTime(opts.expiresIn ?? "5m")
    .sign(keys.privateKey);
}

export async function signExpiredToken(oid = "oid-1"): Promise<string> {
  return new SignJWT({ oid })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
    .sign(keys.privateKey);
}
```

- [ ] **Step 2: Write `apps/api/test/helpers/fake-user-repo.ts`**

```ts
import type { UserRepo, UserRecord } from "../../src/db/user-repo.js";

export function fakeUserRepo(users: UserRecord[]): UserRepo {
  return {
    async findByExternalId(externalId) {
      return users.find((u) => u.externalId === externalId) ?? null;
    },
  };
}
```

- [ ] **Step 3: Write the failing test** — `apps/api/test/auth.test.ts`

```ts
import { describe, it, expect, beforeAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { JWTVerifyGetKey } from "jose";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createTracerProvider, tracingPlugin } from "../src/telemetry.js";
import { problemDetailsPlugin } from "../src/plugins/problem-details.js";
import { authPlugin } from "../src/plugins/auth.js";
import { fakeUserRepo } from "./helpers/fake-user-repo.js";
import { getLocalKeySet, signToken, signExpiredToken, testIssuer, testAudience } from "./helpers/keys.js";

let getKey: JWTVerifyGetKey;
beforeAll(async () => { getKey = await getLocalKeySet(); });

async function buildApp() {
  const app = Fastify();
  await app.register(tracingPlugin, { tracerProvider: createTracerProvider(new InMemorySpanExporter()) });
  await app.register(problemDetailsPlugin);
  await app.register(authPlugin, {
    getKey, issuer: testIssuer, audience: testAudience,
    userRepo: fakeUserRepo([
      { id: "u1", externalId: "oid-1", email: "a@bistecglobal.com", displayName: "Amaya", role: "STUDENT" },
    ]),
  });
  app.get("/protected", { preHandler: [app.authenticate] }, async (req) => ({ email: req.user!.email }));
  return app;
}

function bearer(t: string) { return { authorization: `Bearer ${t}` }; }

describe("auth", () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });

  it("accepts a valid token and attaches the user", async () => {
    const res = await app.inject({ method: "GET", url: "/protected", headers: bearer(await signToken({ oid: "oid-1" })) });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe("a@bistecglobal.com");
  });

  it("rejects a missing Authorization header with 401", async () => {
    expect((await app.inject({ method: "GET", url: "/protected" })).statusCode).toBe(401);
  });

  it("rejects an expired token with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/protected", headers: bearer(await signExpiredToken()) });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a wrong-audience token with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/protected", headers: bearer(await signToken({ audience: "api://someone-else" })) });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a valid token whose oid has no user record with 403 (spec §7)", async () => {
    const res = await app.inject({ method: "GET", url: "/protected", headers: bearer(await signToken({ oid: "unknown-oid" })) });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `pnpm --filter @irp/api test auth`
Expected: FAIL — `authPlugin` not defined.

- [ ] **Step 5: Implement `apps/api/src/plugins/auth.ts`**

```ts
import fp from "fastify-plugin";
import { jwtVerify, type JWTVerifyGetKey } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError, ForbiddenError } from "../errors.js";
import type { UserRecord, UserRepo } from "../db/user-repo.js";

export interface AuthOptions {
  getKey: JWTVerifyGetKey;
  issuer: string;
  audience: string;
  userRepo: UserRepo;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: UserRecord | null;
  }
}

export const authPlugin = fp<AuthOptions>(
  async (app, opts) => {
    app.decorateRequest("user", null);

    app.decorate("authenticate", async (req: FastifyRequest) => {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        throw new UnauthorizedError("No bearer token was supplied.");
      }
      const token = header.slice("Bearer ".length);

      let oid: unknown;
      try {
        const { payload } = await jwtVerify(token, opts.getKey, {
          issuer: opts.issuer,
          audience: opts.audience,
        });
        oid = payload.oid;
      } catch {
        // Malformed, bad signature, wrong issuer/audience, or expired.
        throw new UnauthorizedError("The bearer token is invalid or has expired.");
      }

      if (typeof oid !== "string" || oid.length === 0) {
        throw new UnauthorizedError("The token is missing the oid claim.");
      }

      const user = await opts.userRepo.findByExternalId(oid);
      if (!user) throw new ForbiddenError(); // spec §7: valid token, no record → 403
      req.user = user;
    });
  },
  { name: "auth", dependencies: ["problem-details"] },
);
```

- [ ] **Step 6: Run tests to confirm they pass**

Run: `pnpm --filter @irp/api test auth`
Expected: PASS (all five). No DB needed — the fake repo covers auth in isolation.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/plugins/auth.ts apps/api/test/helpers/keys.ts \
  apps/api/test/helpers/fake-user-repo.ts apps/api/test/auth.test.ts
git commit -m "feat(api): JWT auth plugin, 401/403 per spec §7 (FR-1, FR-3, NFR-14)"
```

---

### Task 7: Routes + server composition + entrypoint

**Files:**
- Create: `apps/api/src/routes/health.ts`, `apps/api/src/routes/me.ts`
- Create: `apps/api/src/server.ts`, `apps/api/src/index.ts`
- Create test: `apps/api/test/server.test.ts`

**Interfaces:**
- Produces: `buildServer(deps)`, `healthRoutes`, `meRoutes`, `toApiUser`.
- Consumes: everything from Tasks 1–6, plus `@irp/types` for the compile-time response shape.

- [ ] **Step 1: Write `apps/api/src/routes/health.ts`**

Typed off the generated spec type so a drift from `HealthStatus` is a compile error.

```ts
import type { FastifyPluginAsync } from "fastify";
import type { components } from "@irp/types";

type HealthStatus = components["schemas"]["HealthStatus"];

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async (): Promise<HealthStatus> => ({
    status: "ok",
    version: app.config.version,
  }));
};
```

- [ ] **Step 2: Write `apps/api/src/routes/me.ts`**

```ts
import type { FastifyPluginAsync } from "fastify";
import type { components } from "@irp/types";
import type { UserRecord } from "../db/user-repo.js";

type ApiUser = components["schemas"]["User"];

export function toApiUser(record: UserRecord): ApiUser {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role === "ADMIN" ? "Admin" : "Student",
  };
}

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/api/v1/me", { preHandler: [app.authenticate] }, async (req): Promise<ApiUser> => {
    return toApiUser(req.user!);
  });
};
```

- [ ] **Step 3: Write `apps/api/src/server.ts`**

Composition order is expressed **only here** (spec §5): tracing first so every later hook is traced; problem-details next so it catches everything; auth; then routes. `app.config` is decorated for routes to read `version`.

```ts
import Fastify, { type FastifyInstance } from "fastify";
import type { JWTVerifyGetKey } from "jose";
import type { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { AppConfig } from "./config.js";
import type { UserRepo } from "./db/user-repo.js";
import { buildAjv, createValidatorCompiler } from "./validation.js";
import { tracingPlugin } from "./telemetry.js";
import { problemDetailsPlugin } from "./plugins/problem-details.js";
import { authPlugin } from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";

export interface ServerDeps {
  config: AppConfig;
  userRepo: UserRepo;
  getKey: JWTVerifyGetKey;
  tracerProvider: NodeTracerProvider;
}

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.config.nodeEnv !== "test" });
  app.decorate("config", deps.config);
  // Wired now so the moment a request body lands (Plan 6) it is validated
  // against the spec's 2020-12 schema, not Fastify's draft-07 default.
  app.setValidatorCompiler(createValidatorCompiler(buildAjv()));

  await app.register(tracingPlugin, { tracerProvider: deps.tracerProvider });
  await app.register(problemDetailsPlugin);
  await app.register(authPlugin, {
    getKey: deps.getKey,
    issuer: deps.config.jwtIssuer,
    audience: deps.config.jwtAudience,
    userRepo: deps.userRepo,
  });
  await app.register(healthRoutes);
  await app.register(meRoutes);

  await app.ready();
  return app;
}
```

- [ ] **Step 4: Write `apps/api/src/index.ts`** (production entrypoint)

```ts
import { createRemoteJWKSet } from "jose";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-node";
import { loadConfig } from "./config.js";
import { createPrismaClient } from "./db/client.js";
import { createUserRepo } from "./db/user-repo.js";
import { createTracerProvider } from "./telemetry.js";
import { buildServer } from "./server.js";

const config = loadConfig(process.env);
const prisma = createPrismaClient(config.databaseUrl);
const userRepo = createUserRepo(prisma);
const getKey = createRemoteJWKSet(new URL(config.jwksUri));
const tracerProvider = createTracerProvider(new ConsoleSpanExporter());

const app = await buildServer({ config, userRepo, getKey, tracerProvider });

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}
```

- [ ] **Step 5: Write the failing composition test** — `apps/api/test/server.test.ts`

Runs without a database by injecting a fake repo — proves wiring/order.

```ts
import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import type { JWTVerifyGetKey } from "jose";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createTracerProvider } from "../src/telemetry.js";
import { buildServer } from "../src/server.js";
import { fakeUserRepo } from "./helpers/fake-user-repo.js";
import { getLocalKeySet, signToken, testIssuer, testAudience } from "./helpers/keys.js";

let app: FastifyInstance;
beforeAll(async () => {
  const getKey: JWTVerifyGetKey = await getLocalKeySet();
  app = await buildServer({
    config: {
      port: 3001, databaseUrl: "unused", jwksUri: "unused",
      jwtIssuer: testIssuer, jwtAudience: testAudience, version: "0.0.0", nodeEnv: "test",
    },
    userRepo: fakeUserRepo([{ id: "u1", externalId: "oid-1", email: "a@bistecglobal.com", displayName: "Amaya", role: "STUDENT" }]),
    getKey,
    tracerProvider: createTracerProvider(new InMemorySpanExporter()),
  });
});

describe("buildServer", () => {
  it("serves GET /health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", version: "0.0.0" });
  });

  it("serves GET /api/v1/me for a valid token and maps the role to API casing", async () => {
    const res = await app.inject({
      method: "GET", url: "/api/v1/me",
      headers: { authorization: `Bearer ${await signToken({ oid: "oid-1" })}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: "u1", email: "a@bistecglobal.com", displayName: "Amaya", role: "Student" });
  });

  it("rejects GET /api/v1/me with no token (401)", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/me" })).statusCode).toBe(401);
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `pnpm --filter @irp/api test server`
Expected: FAIL — `buildServer` not defined.

- [ ] **Step 7: Implement Steps 1–4 files, then run tests**

Run: `pnpm --filter @irp/api test server`
Expected: PASS (all three).

- [ ] **Step 8: Typecheck the whole package**

Run: `pnpm --filter @irp/api typecheck`
Expected: PASS. (`index.ts`'s top-level `await` requires ESM module output — the base config's `module: ESNext` provides it.)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes apps/api/src/server.ts apps/api/src/index.ts apps/api/test/server.test.ts
git commit -m "feat(api): health + me routes and DI server composition (FR-2)"
```

---

### Task 8: Full-stack integration tests (real Fastify + real Postgres)

Proves the whole chain and the four negative tests of spec §10 against real infrastructure.

**Files:**
- Create test: `apps/api/test/helpers/build-test-server.ts`, `apps/api/test/integration.test.ts`

**Interfaces:**
- Consumes: `buildServer`, `createPrismaClient`, `createUserRepo`, key/db helpers.

- [ ] **Step 1: Write `apps/api/test/helpers/build-test-server.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createPrismaClient } from "../../src/db/client.js";
import { createUserRepo } from "../../src/db/user-repo.js";
import { createTracerProvider } from "../../src/telemetry.js";
import { buildServer } from "../../src/server.js";
import { getLocalKeySet, testIssuer, testAudience } from "./keys.js";

export async function buildTestServer(databaseUrl: string): Promise<{
  app: FastifyInstance;
  exporter: InMemorySpanExporter;
  prisma: ReturnType<typeof createPrismaClient>;
}> {
  const prisma = createPrismaClient(databaseUrl);
  const exporter = new InMemorySpanExporter();
  const app = await buildServer({
    config: {
      port: 3001, databaseUrl, jwksUri: "unused",
      jwtIssuer: testIssuer, jwtAudience: testAudience, version: "0.0.0", nodeEnv: "test",
    },
    userRepo: createUserRepo(prisma),
    getKey: await getLocalKeySet(),
    tracerProvider: createTracerProvider(exporter),
  });
  return { app, exporter, prisma };
}
```

- [ ] **Step 2: Write the integration test** — `apps/api/test/integration.test.ts`

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestServer } from "./helpers/build-test-server.js";
import { createPrismaClient } from "../src/db/client.js";
import { resetDb } from "./helpers/db.js";
import { buildAjv } from "../src/validation.js";
import { problemSchema } from "./helpers/problem-schema.js";
import { signToken, signExpiredToken } from "./helpers/keys.js";

const dbUrl = process.env.DATABASE_URL;
const validateProblem = buildAjv().compile(problemSchema);
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

// `res.json()` returns `unknown`, so every member access on it trips
// @typescript-eslint/no-unsafe-member-access and the repo lints at zero
// warnings. Pass the shape to `res.json<T>()` whenever you read a field —
// bare `res.json()` is fine only when handing the whole body to a validator
// or comparing it with toEqual/toMatchObject. This mirrors ProblemLike in
// test/problem-details.test.ts.
interface ProblemLike {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId?: string;
}

describe.skipIf(!dbUrl)("integration: spec → validated request → JWT → Prisma → traced response", () => {
  let app: FastifyInstance;
  let exporter: Awaited<ReturnType<typeof buildTestServer>>["exporter"];
  let prisma: ReturnType<typeof createPrismaClient>;

  beforeAll(async () => { ({ app, exporter, prisma } = await buildTestServer(dbUrl!)); });
  beforeEach(async () => { await resetDb(prisma); exporter.reset(); });
  afterAll(async () => { await app.close(); await prisma.$disconnect(); });

  it("GET /health → 200", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe("ok");
  });

  it("GET /api/v1/me returns the caller identity for a valid token", async () => {
    await prisma.user.create({ data: { externalId: "oid-42", email: "m@bistecglobal.com", displayName: "Mentor", role: "ADMIN" } });
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: bearer(await signToken({ oid: "oid-42" })) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: "m@bistecglobal.com", role: "Admin" });
  });

  it("expired token → 401 with a Problem body", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: bearer(await signExpiredToken("oid-42")) });
    expect(res.statusCode).toBe(401);
    expect(validateProblem(res.json())).toBe(true);
  });

  it("valid token, unregistered user → 403 (spec §7)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: bearer(await signToken({ oid: "ghost" })) });
    expect(res.statusCode).toBe(403);
    expect(validateProblem(res.json())).toBe(true);
  });

  it("a soft-deleted user is treated as unregistered → 403 (FR-5)", async () => {
    await prisma.user.create({ data: { externalId: "oid-gone", email: "x@bistecglobal.com", displayName: "Gone", role: "STUDENT", deletedAt: new Date() } });
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: bearer(await signToken({ oid: "oid-gone" })) });
    expect(res.statusCode).toBe(403);
  });

  it("every error body validates against Problem and carries the span's traceId", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me", headers: bearer(await signToken({ oid: "ghost" })) });
    const body = res.json<ProblemLike>();
    expect(validateProblem(body)).toBe(true);
    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThan(0);
    expect(body.traceId).toBe(spans.at(-1)?.spanContext().traceId);
  });
});
```

- [ ] **Step 3: Run the integration suite against Postgres**

> **Run these through PowerShell, not the Bash tool.** The Bash tool is sandboxed and cannot open
> TCP to a localhost port — the suite would fail `P1001`/connection-refused even with a healthy
> container. Use `127.0.0.1`, not `localhost` (which resolves to `::1` here), and host port
> **5433**, since 5432 is held by an unrelated project's container on this machine.

```powershell
$env:IRP_DB_PORT = "5433"
docker compose -f apps/api/docker-compose.yml up -d
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm --filter @irp/api exec prisma migrate deploy
pnpm --filter @irp/api test integration
```

Expected: PASS (all six). **If the run reports the suite skipped, `DATABASE_URL` is unset in that
shell and the tests did nothing** — `describe.skipIf` exits 0 on a skip, so a skip is a silent
false pass, not a green result. Confirm six tests ran.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/helpers/build-test-server.ts apps/api/test/integration.test.ts
git commit -m "test(api): full-stack integration incl the four negative tests (spec §10)"
```

---

### Task 9: CI — Postgres service, Prisma steps, and prove the DB gate

**Files:**
- Modify: `.github/workflows/ci.yml`, `apps/api/test/user-repo.test.ts` (CI skip guard, Step 3)

**Interfaces:** none (CI only).

- [ ] **Step 1: Add a Postgres service + Prisma steps + test env to the `verify` job**

Insert a `services:` block and, after the existing "Fail if generated output is tracked in git" step and before "Build @irp/core", add Prisma client generation. Add `prisma migrate deploy` before the test step, and the test env vars. The generated Prisma client is git-ignored, so `prisma generate` must run in CI before typecheck — exactly as `pnpm generate` does for `@irp/types`.

```yaml
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: irp
          POSTGRES_PASSWORD: irp
          POSTGRES_DB: irp
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U irp -d irp"
          --health-interval 2s --health-timeout 5s --health-retries 15
    env:
      TZ: ${{ matrix.timezone }}
      DATABASE_URL: postgresql://irp:irp@localhost:5432/irp?schema=public
      JWKS_URI: https://login.microsoftonline.com/common/discovery/v2.0/keys
      JWT_ISSUER: https://issuer.test/v2.0
      JWT_AUDIENCE: api://irp-test
```

New steps (place `Generate the Prisma client` immediately before `Build @irp/core`, and `Apply database migrations` immediately before `Test`):

```yaml
      - name: Generate the Prisma client
        run: pnpm --filter @irp/api exec prisma generate

      - name: Apply database migrations
        run: pnpm --filter @irp/api exec prisma migrate deploy
```

> **Run every database-touching command below through PowerShell, not the Bash tool.** The Bash
> tool is sandboxed and cannot open TCP to a localhost port (`P1001` even with a healthy
> container), and its inline `VAR=value cmd` prefix is not PowerShell syntax. Use `$env:` and
> `127.0.0.1`. Local Postgres is on **5433** here — 5432 is held by an unrelated project's
> container. CI is unaffected: on the runner the service binds 5432 and the `env` block above is
> correct as written.

- [ ] **Step 2: Confirm the porcelain gate still holds for the Prisma client**

The existing "Fail if generated output is tracked in git" step runs `git status --porcelain`. Because `apps/api/src/generated/` is git-ignored, `prisma generate` must leave the tree clean. **Locally verify:**

```powershell
pnpm --filter @irp/api exec prisma generate
git status --porcelain
```
Expected: **no output** (the generated dir is ignored). If `apps/api/src/generated/...` appears, the `.gitignore` entry from Task 1 is missing or wrong — fix it, do not commit the generated client.

- [ ] **Step 3: Close the skip-false-green hole, then prove it goes red**

> **This is the important one.** Task 5's review raised it as the single Important finding, and
> the naive version of this step tests the wrong thing. `apps/api/test/user-repo.test.ts` guards
> its suite with `describe.skipIf(!dbUrl)`. With `DATABASE_URL` unset the run reports
> `17 passed | 3 skipped` and **exits 0** — reproduced directly. So a CI job whose database
> failed to come up, or which simply lost its `DATABASE_URL`, goes **green while running zero
> database tests**, including the FR-5 soft-delete test this task exists to protect. Asserting
> that `migrate deploy` fails against a bad URL does *not* cover this: it checks a different
> step. `CLAUDE.md` is explicit that two of this project's four gates looked correct and did
> nothing — this is that failure mode, caught before it shipped.

`skipIf` is right for local dev (a laptop without Docker should not hard-fail the unit suite),
so keep it — but make its absence fatal in CI. In `apps/api/test/user-repo.test.ts`:

```ts
// A DB-less run is a developer convenience, never an acceptable CI result: skipping here
// would let a failed Postgres service report green. Fail loudly instead.
if (process.env.CI && !dbUrl) {
  throw new Error("DATABASE_URL is required in CI — the database suite must not be skipped");
}
```

Then demonstrate **both** directions, and record both in the PR description:

```powershell
# (a) the new skip guard must go red when CI has no database URL
$env:CI = "true"; Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
pnpm --filter @irp/api test user-repo; "exit=$LASTEXITCODE"   # expect NON-ZERO
Remove-Item Env:\CI

# (b) the migrate step must go red against a database that does not exist
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/nonexistent?schema=public"
pnpm --filter @irp/api exec prisma migrate deploy; "exit=$LASTEXITCODE"   # expect NON-ZERO
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
```

Both must exit non-zero. If (a) exits 0 the guard is not wired up and the hole is still open —
do not proceed on the assumption that it is closed.

- [ ] **Step 4: Run the full CI sequence locally to green**

From a clean tree with Postgres up, in PowerShell with `$env:DATABASE_URL` set to the 5433 URL:
```powershell
pnpm install --frozen-lockfile
pnpm spec:lint
pnpm generate
pnpm --filter @irp/api exec prisma generate
pnpm --filter @irp/core build
pnpm --filter @irp/api exec prisma migrate deploy
pnpm -r typecheck
pnpm lint
pnpm -r test
git status --porcelain   # must be empty
```
Expected: every command exits 0; the tree is clean. The `pnpm -r test` line must show the
database tests **running**, not skipped.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml apps/api/test/user-repo.test.ts
git commit -m "ci: postgres service + prisma generate/migrate, fail on skipped db suite"
```

`user-repo.test.ts` is included because Step 3's guard lives there. GitHub Actions sets `CI=true`
on every runner, so the guard arms itself with no workflow change.

---

### Task 10: Docs, ADR index, and spec reconciliation

**Files:**
- Modify: `handoff.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-07-28-plan-2-api-contract-design.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Reconcile the Plan 2 spec** — add a short note under §5 (and §14 "Carried forward")

Record the two scope decisions this plan took, so the spec and code do not silently diverge (`CLAUDE.md`: fix the plan/spec at source):
- `plugins/openapi.ts` (spec load + dereference + register) is deferred to **Plan 6**, when the first request-bodied endpoint exists to exercise it. In 2B, spec authority is compile-time (`@irp/types`) + the `ajv/dist/2020` validator compiler proven by unit test.
- Tracing is hand-written (**ADR-0007**), not auto-instrumented.
- The `DayStatus` set-equality decision is carried to Plan 6 (no day-status schema exists in 2B's surface).

- [ ] **Step 2: Update `handoff.md`**

- Move Plan 2B from "Next" to done-pending-PR in §2a and §1 tables (PR number filled at merge).
- Update the "Starting a fresh session" bootstrap (step 2) to include Prisma client generation:
  `pnpm install && pnpm generate && pnpm --filter @irp/api exec prisma generate && pnpm --filter @irp/core build`
- Add to "Hard-won constraints": the generated **Prisma** client lives in `apps/api/src/generated/` (git-ignored, eslint-ignored, `prisma generate` in CI before typecheck) — same discipline as `@irp/types`/`@irp/client`.
- Note the new gate: Postgres service + `prisma migrate deploy`, demonstrated red (Task 9 Step 3).
- Mark the DI architecture (`buildServer(deps)`) and the injectable trace exporter (Console → App Insights in Plan 4) as the seams Plan 3/4 extend.
- Set **Next: Plan 3 (Auth + web shell)** — still blocked on the Azure account.

- [ ] **Step 3: Update `CLAUDE.md`**

- Add the new runtime libraries to the "Pinned versions" table (Fastify 5.10.0 already present; add `jose` 6.2.4, `ajv` 8.20.0 + `ajv-formats` 3.0.1, the OpenTelemetry SDK pins, `fastify-plugin` ^5.1.0, `tsx` 4.23.1), each with a one-line "why this version".
- Under "Generated packages", add `apps/api/src/generated/prisma` to the list of git-ignored generated dirs regenerated by `prisma generate`.

- [ ] **Step 4: Verify docs are internally consistent**

Run: `pnpm spec:lint`
Expected: PASS (the spec note is prose in the design doc, not the OpenAPI file — but re-lint to be safe if `spec/openapi.yaml` was touched; it should not have been in this plan).

- [ ] **Step 5: Commit**

```bash
git add handoff.md CLAUDE.md docs/superpowers/specs/2026-07-28-plan-2-api-contract-design.md
git commit -m "docs: reconcile spec/handoff/CLAUDE with Plan 2B decisions"
```

---

## Definition of done (mirrors spec §12)

- [ ] `redocly lint` — zero errors and zero warnings (unchanged spec).
- [ ] Regenerating `@irp/types` and `@irp/client` produces no diff; `prisma generate` leaves the tree clean.
- [ ] `GET /health` returns `200 {status:"ok",version}`.
- [ ] `GET /api/v1/me` returns the caller's identity for a valid signed token, with the role mapped to API casing.
- [ ] All four negative tests pass: extra-property rejection is live in the validator (Task 2); expired token → 401; valid-but-unregistered → 403; every error body validates against `Problem`.
- [ ] A soft-deleted user is treated as unregistered → 403 (FR-5).
- [ ] A span is recorded per request and its `traceId` appears in the response's Problem body.
- [ ] `@irp/core` builds to `dist/` and `apps/api` imports it successfully (core-consumption test).
- [ ] CI green across all three timezones, including integration tests against the Postgres service; the DB gate was demonstrated red.
- [ ] `handoff.md`, `CLAUDE.md`, and the Plan 2 spec reflect the two scope decisions and ADR-0007.

## Self-review notes (author)

- **Spec coverage:** §4 → Task 2 (ajv 2020 compiler) + Task 7 (compile-time `@irp/types`); §5 layout → Tasks 3–7 (openapi.ts explicitly deferred, recorded Task 10); §6 two endpoints → Task 7; §7 the 403 rule → Task 6 + Task 8; §8 data model → Task 5; §9 error handling → Task 4; §10 testing → Tasks 2/6/8; §11 CI → Task 9; §12 DoD → above.
- **Type consistency:** `UserRecord` (`role: "ADMIN"|"STUDENT"`) is produced in Task 5 and consumed unchanged in Tasks 6/7/8; `toApiUser` maps to `ApiUser` (`role: "Admin"|"Student"`) once, in Task 7. `buildServer(ServerDeps)` fields match every call site (Tasks 7/8). `currentTraceId(request)` signature is identical in Tasks 3/4.
- **Known verification points flagged inline (not placeholders):** the Prisma 7 `prisma-client` generated entry path (Task 5 Step 4) and the ajv default-import interop fallback (Task 2 Step 3) — each has a concrete primary instruction plus the exact fallback.
```
