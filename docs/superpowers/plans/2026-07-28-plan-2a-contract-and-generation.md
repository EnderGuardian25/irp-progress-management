# Plan 2A — Contract and Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `spec/openapi.yaml` the authoritative API contract, generate types and a client SDK from it, and gate both on lint and staleness in CI.

**Architecture:** One hand-written OpenAPI 3.1 document is the source of truth. `openapi-typescript` generates `packages/types`; `@hey-api/openapi-ts` generates `packages/client`. CI fails if `@redocly/cli` reports any warning, or if regenerating either package produces a diff — that staleness gate is what makes "generated, never hand-edited" enforceable rather than a convention. Plan 2B then derives Fastify's runtime validation from the same document.

**Tech Stack:** OpenAPI 3.1.0, `@redocly/cli`, `openapi-typescript`, `@hey-api/openapi-ts`, TypeScript 6.0.3, pnpm 11.17.0, Node 24.

## Global Constraints

- **Package manager:** pnpm workspaces. Not npm, not yarn.
- **TypeScript:** `strict: true`. No `any`, no `@ts-ignore`, **no non-null assertions (`!`)** — the type-aware lint rules reject them.
- **OpenAPI version is 3.1.0**, per [ADR-0006](../../adr/0006-openapi-3-1-over-3-0.md). Not 3.0, despite the challenge brief. 3.1 schemas are JSON Schema 2020-12, which is what lets Plan 2B feed them straight to a validator.
- **Contract rules** (`CLAUDE.md`, NFR-7, NFR-8): every operation defines `200`, `400`, `401` and `500`. Every schema carries examples. Every parameter carries a description. Request bodies are `additionalProperties: false`. Errors use RFC 7807.
- **`redocly lint` must pass with zero errors AND zero warnings.** A warning is a failure. Never silence a rule to pass — fix the document. **This is enforced by `extends: [recommended-strict]`, not by reading the console** — see Amendment 2. `redocly lint` exits 0 when warnings are present and has no `--fail-on-warnings` flag, so plain `recommended` leaves the bar unenforced.
- **`packages/types` and `packages/client` are generated and never hand-edited.** If output is wrong, the spec is wrong.
- **Strictness may be relaxed for generated code, but only in that package's own tsconfig — never in `tsconfig.base.json`.** Found during execution: `@hey-api/client-fetch`'s generated runtime assigns `undefined` to optional properties, which `exactOptionalPropertyTypes` forbids, and the base `lib` of `ES2023` leaves `Request`/`Response`/`Headers` undefined. `packages/client/tsconfig.json` therefore sets `lib: ["ES2023", "DOM"]` and `exactOptionalPropertyTypes: false`. Its `include` is `src/**/*`, every file of which is generated, so this touches zero hand-written code. **The line is: relax in a generated package's own config, never in the base.**

  `@types/node` alone was tried first and got 64 errors down to 1 — it shims most Fetch globals but has no `BodyInit`, which is DOM-only. DOM is the correct lib here regardless: `@irp/client` is a fetch SDK that `apps/web` imports into a browser. A hand-written ambient `.d.ts` declaring `BodyInit` was rejected — it would shadow a real standard type and drift the moment the generator emits another DOM type. Adding DOM to `tsconfig.base.json` was also rejected, since that would leak browser globals into the Fastify API package. Note `lib` **replaces** the inherited value, so `ES2023` must be restated. This reasoning is recorded in a `"_comment"` key in `packages/client/tsconfig.json` itself (JSON has no comment syntax; `tsc` ignores unknown top-level keys), so it survives outside this plan.
- **`@hey-api/openapi-ts` needs `-i ./spec/openapi.yaml`, with the `./` prefix.** Without it the CLI reads a two-segment path as a Hey API registry shorthand (`org/project`) and fails confusingly.
- **Generated directories must be added to `eslint.config.mjs`'s global `ignores`.** Found during execution: `openapi-typescript` output tripped `@typescript-eslint/consistent-indexed-object-style`, and linting generated code is pointless since the fix would have to be made in the generator. The existing list already ignores `dist/`, `.next/` and `coverage/` for the same reason — add `packages/types/src/**` and `packages/client/src/**` alongside them. Keep the patterns package-specific; a broad `**/src/**` would silence real source.
- **In OpenAPI 3.1 use `examples:` (an array), not `example:`.** `example` is 3.0 syntax and Redocly will flag it.
- **Commits:** conventional. No direct commits to `main` — this plan runs on `feat/api-contract-and-service`.
- **Before every commit:** `pnpm lint` exit 0 and `pnpm -r typecheck` exit 0.
- **Exact version pins** — verified against the registry 2026-07-28. Use verbatim:

  | Package | Pin |
  |---|---|
  | `@redocly/cli` | `^2.5.0` |
  | `openapi-typescript` | `^7.9.0` |
  | `@hey-api/openapi-ts` | `^0.87.0` |

  If any install reports a peer conflict, **stop and report it** rather than resolving it by bumping. Five of eleven tasks in Plan 1 contained a real defect in the plan's own code; escalating has been the highest-value action on this project.

- **CLI flags and config keys in this plan were written against the pinned versions but not executed.** `@redocly/cli` 2.x config format, `openapi-typescript` 7.x flags and `@hey-api/openapi-ts` 0.87 options all move between releases. If a command rejects a flag, or a config key is unrecognised, **report the exact error with the tool's `--help` output** rather than guessing at the replacement. A wrong guess here produces plausible output from the wrong invocation, which is worse than a clean failure.

## Amendment 1 — Tasks 2, 3 and 4 merge (2026-07-28)

**Found during execution.** Task 2 defined the shared components; Tasks 3 and 4 added the two
operations that reference them. Redocly's `no-unused-components` rule warns on every component
nothing references, so Task 2 in isolation produced **7 warnings against a zero-warning bar** —
`User`, `HealthStatus`, `bearerAuth` and the four error responses, all defined but not yet used.

The fault is the task boundary, not the document. **A partial OpenAPI spec cannot be
lint-clean under this rule**, and any split leaves some component orphaned: adding `/health`
alone still strands `User`, `Role`, `Forbidden` and `bearerAuth`. The plan's own right-sizing
rule says to split only where a reviewer could reject one task while approving its neighbour,
and a document defining seven unreferenced components is not independently valid.

**Tasks 2, 3 and 4 are therefore one task** — the complete document, lint-clean, in a single
step. The two rejected fixes: disabling `no-unused-components` (it is a genuinely useful rule
that will catch dead schema once the spec carries thirty operations), and accepting warnings
at intermediate boundaries (the zero-warning bar is the whole point of the gate).

Effective task numbering:

| Original | Now |
|---|---|
| 1 · `@irp/core` build | **1** |
| 2 + 3 + 4 · foundations, `/health`, `/api/v1/me` | **2** |
| 5 · generate `@irp/types` | **3** |
| 6 · generate `@irp/client` | **4** |
| 7 · CI lint and staleness gate | **5** |

The task bodies below keep their original numbering for reference; execution follows the table.

## Amendment 2 — whole-branch review fixes (2026-07-28)

Applied after Task 7, before the branch merged. The task bodies above have been edited in
place so the plan and the code agree; this section records what changed and why.

**1 · The zero-warning bar was never wired to anything.** `redocly lint` **exits 0 when it
reports warnings**, and there is no `--fail-on-warnings` flag. Under `extends: [recommended]`,
`pnpm spec:lint` and the CI step running it therefore passed green *with warnings present* —
verified: a spec carrying one `no-unused-components` warning exited **0**. The bar this plan
invokes in four places held only because a human read the console.

Fixed by `extends: [recommended-strict]`, the same rule set with warnings promoted to errors.
The real spec still passes clean (exit 0); the same one-warning spec now exits **1**. This is
the opposite of silencing a rule — nothing was disabled. It also raises
`no-invalid-schema-examples` to error, closing a second hole: schema-level `examples:` arrays
were unvalidated, so a value outside its own enum (`Role.examples: [Manager]`) linted green.

**2 · The four-response rule was trusted, not enforced.** `operation-4xx-response` requires
*at least one* 4xx, not a specific set — deleting `'401'` from `/api/v1/me` linted clean, while
`redocly.yaml`'s own comment claimed the CLAUDE.md rules were "enforced rather than trusted".
Fixed with a Redocly custom assertion on the `Responses` node requiring all four codes.
Verified against `@redocly/cli` 2.40.0: with `'401'` removed the lint fails with
`Error was generated by the rule/every-operation-defines-the-four-contract-responses rule`.

**3 · The force-commit hole.** `git add -f packages/types/src/schema.ts` would have committed a
hand-editable copy of the contract and no gate would have noticed — the staleness check
compares checksums of files it regenerates itself, and `.gitignore` is not a gate. CI now
asserts `git status --porcelain` is empty after regeneration. The redundant standalone
`pnpm generate` step was removed; the staleness step already runs it twice.

**4 · Redundant `security` on `/api/v1/me`,** restating the document-level default. Removed —
it would have silently survived a change to that default, which is the failure mode the
fail-closed default exists to prevent. Confirmed harmless: the generated SDK still emits the
bearer security block for `getCurrentUser`. `/health`'s `security: []` stays; that opt-out is
load-bearing.

**5 · The servers comment contradicted the artifact.** `redocly.yaml` said servers are declared
per environment at deploy time and not in the document — but the generator bakes
`http://localhost:3001` into the SDK as its default `baseUrl`. Comment corrected: it is a
local-development default that deployed consumers override.

**6 · ADR-0006 named `ajv/dist/2020` but not `ajv-formats`.** The document uses
`format: uri-reference`, `uuid` and `email`; ajv implements none natively and throws at
schema-compile time in strict mode. Added to that ADR's negative consequences and to the
follow-ups table so Plan 2B cannot miss it.

**7 · A false comment in `eslint.config.mjs`,** claiming both generated packages "typecheck
clean under the strict compiler settings". True of `@irp/types`, false of `@irp/client`, which
needs `lib` and `exactOptionalPropertyTypes` relaxed. Comment amended to state the difference,
and the relaxation's reasoning moved into a `"_comment"` key in
`packages/client/tsconfig.json` — it previously lived only in a gitignored scratch file.

**10 · Version mismatch.** `info.version` was `0.1.0` while every `package.json` is `0.0.0`,
which would have given Plan 2B's `/health` handler two disagreeing sources. Set to `0.0.0`,
along with the two `HealthStatus` examples that showed the same value.

## Prerequisites

`pnpm` 11.17.0, Node 24.15.0, Docker 29.6.1 — all installed. `@irp/core` is on `main` with 112 tests passing.

---

### Task 1: Build step for `@irp/core`

`@irp/core` currently sets `main` to raw `src/index.ts`. Fastify is not a bundler, so `apps/api` cannot consume that. This activates the `outDir` and `declaration` settings that have been inert since the package was scaffolded.

**Files:**
- Modify: `packages/core/package.json`
- Create: `packages/core/tsconfig.build.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `@irp/core` resolving to `dist/index.js` with `dist/index.d.ts` types, built by `pnpm --filter @irp/core build`.

- [ ] **Step 1: Create `packages/core/tsconfig.build.json`**

Tests must not be emitted into `dist`. The existing `tsconfig.json` deliberately includes them so typecheck and the editor cover them; the build uses a separate config that excludes them.

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 2: Update `packages/core/package.json`**

Replace the `main`, `types`, `exports` and `scripts` blocks. Leave `name`, `version`, `private`, `type` and `devDependencies` untouched.

```json
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:tz": "cross-env TZ=America/New_York vitest run"
  },
```

- [ ] **Step 3: Confirm `dist/` is git-ignored**

Read `.gitignore`. It should already contain `dist/`. If it does not, add it. Do not commit build output.

- [ ] **Step 4: Build and verify the output shape**

Run: `pnpm --filter @irp/core build`
Expected: exit 0.

Run: `ls packages/core/dist`
Expected: `index.js`, `index.d.ts`, and one `.js`/`.d.ts` pair per source module — `civil-date`, `programme-time`, `weekday`, `cycle`, `submission-window`, `classify-day`. **No `.test.js` files.** If any test file was emitted, `tsconfig.build.json` is not being applied — stop and report.

- [ ] **Step 5: Verify the built package is actually importable**

The point of this task is that a Node consumer can import the package. Prove it rather than assuming:

Run:
```bash
node --input-type=module -e "import('@irp/core').then(m => console.log('exports:', Object.keys(m).length))"
```
Expected: a count of 20 or more. If it throws a resolution error, the `exports` map is wrong — stop and report.

- [ ] **Step 6: Confirm existing gates still pass**

Run: `pnpm -r typecheck` → exit 0
Run: `pnpm -r test` → 112 passing
Run: `pnpm lint` → exit 0

- [ ] **Step 7: Commit**

```bash
git add packages/core/package.json packages/core/tsconfig.build.json .gitignore
git commit -m "build(core): emit dist so apps can consume @irp/core

main pointed at raw src/index.ts, which Fastify cannot consume. Activates
the outDir and declaration settings that were inert since scaffolding, and
excludes tests from the build via a separate tsconfig."
```

---

### Task 2: Spec foundations — skeleton, security scheme, shared components, lint gate

**Files:**
- Create: `spec/openapi.yaml`
- Create: `redocly.yaml`
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: nothing
- Produces: a lint-clean OpenAPI 3.1 document with `components.schemas.Problem`, `components.schemas.User`, `components.schemas.Role`, `components.schemas.HealthStatus`, and four reusable `components.responses` entries that later tasks `$ref`. Plus a root `pnpm spec:lint` script.

**Note on `paths`:** in OpenAPI 3.1 `paths` is optional, so this task omits it entirely and Task 3 introduces it. If Redocly objects to a document with no paths, **stop and report** rather than adding an operation early — that changes the task boundary and I want to know.

- [ ] **Step 1: Create `redocly.yaml`**

> **Superseded by Amendment 2.** The block below is what shipped after review. The
> original used `extends: [recommended]`, carried no assertion, and described the
> single server as a deploy-time placeholder — all three were wrong.

```yaml
# `recommended-strict`, not `recommended`. `redocly lint` exits 0 when it
# reports warnings — there is no `--fail-on-warnings` flag — so under
# `recommended` the zero-warning bar CLAUDE.md sets was enforced only by a
# human reading the console. `recommended-strict` is the same rule set with
# every warning promoted to an error, which is what makes the exit code, and
# therefore CI, actually reflect the bar. It also raises
# `no-invalid-schema-examples` to error, so schema-level `examples:` arrays
# are validated against their own schema rather than ignored.
extends:
  - recommended-strict

rules:
  # The contract rules from CLAUDE.md, enforced rather than trusted.
  operation-4xx-response: error
  operation-operationId: error
  operation-summary: error
  operation-description: error
  no-invalid-media-type-examples: error
  # The single declared server is a local-development default. Deployed
  # consumers override it — note the generated SDK bakes it in as its
  # fallback `baseUrl`, so it is not a placeholder that can be dropped.
  no-server-example.com: off

  # `operation-4xx-response` only requires *at least one* 4xx, so deleting
  # '401' from an operation lints clean under it. CLAUDE.md requires the
  # specific set 200 / 400 / 401 / 500 on every operation with no exceptions,
  # so that exact set is asserted here. Without this the four-response rule is
  # a convention, not a gate.
  rule/every-operation-defines-the-four-contract-responses:
    subject:
      type: Responses
    assertions:
      required:
        - '200'
        - '400'
        - '401'
        - '500'
    severity: error
    message: >-
      Every operation must define 200, 400, 401 and 500 responses (CLAUDE.md,
      API contract rules). Document an unreachable status rather than omitting
      it.
```

- [ ] **Step 2: Create `spec/openapi.yaml`**

```yaml
openapi: 3.1.0

info:
  title: IRP Progress Management API
  # Amendment 2: 0.0.0, matching every workspace package.json. `/health`
  # reports the running application version, so two disagreeing sources would
  # put a visible contradiction in the artifact.
  version: 0.0.0
  summary: Daily progress tracking and monthly evaluation for the Bistec Hearts Academy IRP.
  description: |
    Students submit a short text update on each working day. Mentors review those
    submissions, record attendance, and evaluate monthly against a fixed rubric.

    Weekdays are required submission days. Weekends are optional and may hold
    Extra work; a weekend is never counted as missed and never enters a
    compliance denominator.

    All timestamps are UTC. All deadlines and evaluation-cycle boundaries are
    evaluated in Asia/Colombo.
  contact:
    name: Damian De Cruz
    email: johann@bistecglobal.com
  license:
    name: UNLICENSED
    url: https://bistecglobal.com

servers:
  - url: http://localhost:3001
    description: Local development.

tags:
  - name: System
    description: Liveness and diagnostics. Unauthenticated.
  - name: Identity
    description: The authenticated caller.

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: |
        A JWT issued by Microsoft Entra ID. The token's `oid` claim is matched
        against a registered user. Authentication is not authorisation: a valid
        token whose subject has no user record is rejected with 403, because
        registration is an Admin action.

  schemas:
    Problem:
      type: object
      title: Problem
      description: |
        An error, as RFC 7807 Problem Details, extended with the OpenTelemetry
        trace id of the request that failed.

        `additionalProperties` is deliberately permitted here: RFC 7807 defines
        extension members, and `traceId` is one. The repository rule requiring
        `additionalProperties: false` applies to request bodies, not to this
        response shape.
      required: [type, title, status, traceId]
      additionalProperties: true
      properties:
        type:
          type: string
          format: uri-reference
          description: A URI reference identifying the problem type.
          default: about:blank
          examples:
            - https://irp.bistec.example/problems/validation-failed
        title:
          type: string
          description: A short, human-readable summary of the problem type. Stable across occurrences.
          examples:
            - Request validation failed
        status:
          type: integer
          minimum: 100
          maximum: 599
          description: The HTTP status code, repeated here for convenience.
          examples:
            - 400
        detail:
          type: string
          description: A human-readable explanation specific to this occurrence.
          examples:
            - body must NOT have additional properties
        instance:
          type: string
          format: uri-reference
          description: A URI reference identifying this specific occurrence.
          examples:
            - /api/v1/me
        traceId:
          type: string
          description: |
            The OpenTelemetry trace id of the failing request. Quote this when
            reporting a problem; it maps directly to the trace in Application Insights.
          examples:
            - 4bf92f3577b34da6a3ce929d0e0e4736

    Role:
      type: string
      title: Role
      enum: [Admin, Student]
      description: |
        Admin is a mentor. Every mentor holds an Admin account and there is no
        super-admin tier above it. Admins share access across all batches in v1.
      examples:
        - Student

    User:
      type: object
      title: User
      description: A registered participant in the programme.
      required: [id, email, displayName, role]
      additionalProperties: false
      properties:
        id:
          type: string
          format: uuid
          description: Stable internal identifier. Not the Entra object id.
          examples:
            - 3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8
        email:
          type: string
          format: email
          description: Bistec account email address. Unique across users.
          examples:
            - a.perera@bistecglobal.com
        displayName:
          type: string
          minLength: 1
          maxLength: 200
          description: Name as shown in the interface.
          examples:
            - Amaya Perera
        role:
          $ref: '#/components/schemas/Role'

    HealthStatus:
      type: object
      title: HealthStatus
      description: Liveness report.
      required: [status, version]
      additionalProperties: false
      properties:
        status:
          type: string
          enum: [ok]
          description: Always `ok`. A service that cannot report `ok` does not respond at all.
          examples:
            - ok
        version:
          type: string
          description: The running application version.
          examples:
            - 0.0.0

  responses:
    BadRequest:
      description: The request was malformed or failed schema validation.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/Problem'
          examples:
            additionalProperty:
              summary: A request body carried an unexpected property
              value:
                type: https://irp.bistec.example/problems/validation-failed
                title: Request validation failed
                status: 400
                detail: body must NOT have additional properties
                instance: /api/v1/me
                traceId: 4bf92f3577b34da6a3ce929d0e0e4736

    Unauthorized:
      description: No bearer token was supplied, or the token was malformed or expired.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/Problem'
          examples:
            expiredToken:
              summary: The bearer token had expired
              value:
                type: https://irp.bistec.example/problems/unauthorized
                title: Authentication required
                status: 401
                detail: The bearer token has expired.
                instance: /api/v1/me
                traceId: 4bf92f3577b34da6a3ce929d0e0e4736

    Forbidden:
      description: |
        The token was valid, but its subject is not a registered user.
        Registration is an Admin action; there is no self-registration.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/Problem'
          examples:
            unregistered:
              summary: Authenticated, but no user record exists
              value:
                type: https://irp.bistec.example/problems/not-registered
                title: Not a registered user
                status: 403
                detail: This account has not been registered by an Admin.
                instance: /api/v1/me
                traceId: 4bf92f3577b34da6a3ce929d0e0e4736

    InternalServerError:
      description: An unexpected error. The trace id identifies the failing request.
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/Problem'
          examples:
            unhandled:
              summary: An unhandled error
              value:
                type: about:blank
                title: Internal Server Error
                status: 500
                detail: An unexpected error occurred.
                instance: /api/v1/me
                traceId: 4bf92f3577b34da6a3ce929d0e0e4736
```

- [ ] **Step 3: Add the lint script and dev dependency to the root `package.json`**

Add to `scripts`:
```json
    "spec:lint": "redocly lint spec/openapi.yaml",
```

Add to `devDependencies`:
```json
    "@redocly/cli": "^2.5.0",
```

- [ ] **Step 4: Install**

Run: `pnpm install`
Expected: exit 0, no peer conflicts.

- [ ] **Step 5: Lint the document**

Run: `pnpm spec:lint`
Expected: **zero errors and zero warnings.**

If Redocly reports a warning, fix the document. Do not silence the rule in `redocly.yaml` — the zero-warning bar is the point. If a warning appears that you believe is wrong or unfixable, **stop and report it** with the exact rule name and message.

- [ ] **Step 6: Confirm existing gates still pass**

Run: `pnpm lint` → exit 0
Run: `pnpm -r typecheck` → exit 0

- [ ] **Step 7: Commit**

```bash
git add spec/openapi.yaml redocly.yaml package.json pnpm-lock.yaml
git commit -m "feat(spec): add OpenAPI 3.1 foundations and the lint gate

Security scheme, RFC 7807 Problem, User, Role and HealthStatus schemas,
plus four reusable error responses that operations reference. Redocly is
configured to enforce the contract rules from CLAUDE.md rather than trust
them, at zero warnings."
```

---

### Task 3: `GET /health`

**Files:**
- Modify: `spec/openapi.yaml`

**Interfaces:**
- Consumes: `HealthStatus`, and the `BadRequest` / `Unauthorized` / `InternalServerError` responses from Task 2
- Produces: operation `getHealth`

**On documenting unreachable responses:** `/health` takes no input and requires no token, so `400` and `401` cannot occur. They are documented anyway. `CLAUDE.md` states the four-response rule with "No exceptions," and a mechanically checkable blanket rule beats a per-endpoint judgement call about which deserve an exemption. If `/health` is ever placed behind auth, the contract already says what happens.

- [ ] **Step 1: Add the `paths` block**

Insert a top-level `paths:` key immediately after `tags:` and before `components:`:

```yaml
paths:
  /health:
    get:
      operationId: getHealth
      summary: Liveness probe
      description: |
        Reports that the service is running. Touches no database and requires
        no token, so it is safe to use as a container liveness probe.

        The 400 and 401 responses are unreachable on this operation — it accepts
        no input and requires no credentials — but are documented because the
        contract defines all four for every operation without exception.
      tags: [System]
      security: []
      responses:
        '200':
          description: The service is running.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HealthStatus'
              examples:
                running:
                  summary: A healthy service
                  value:
                    status: ok
                    version: 0.0.0
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '500':
          $ref: '#/components/responses/InternalServerError'
```

- [ ] **Step 2: Lint**

Run: `pnpm spec:lint`
Expected: zero errors, zero warnings.

- [ ] **Step 3: Commit**

```bash
git add spec/openapi.yaml
git commit -m "feat(spec): add GET /health"
```

---

### Task 4: `GET /api/v1/me`

**Files:**
- Modify: `spec/openapi.yaml`

**Interfaces:**
- Consumes: `User`, and all four `components.responses` from Task 2
- Produces: operation `getCurrentUser`

- [ ] **Step 1: Add the operation**

Inside the existing `paths:` block, after `/health`:

```yaml
  /api/v1/me:
    get:
      operationId: getCurrentUser
      summary: The authenticated caller
      description: |
        Returns the registered user matching the bearer token's `oid` claim.

        Authentication is not authorisation. A structurally valid, correctly
        signed, unexpired token whose subject has no user record receives 403,
        not an auto-created account — registration is an Admin action and there
        is no self-registration.
      tags: [Identity]
      # Amendment 2: no operation-level `security` here. The document-level
      # default already supplies `- bearerAuth: []`; restating it would
      # silently survive a change to that default. Only `/health`'s
      # `security: []` opt-out is load-bearing.
      responses:
        '200':
          description: The authenticated user.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
              examples:
                student:
                  summary: A student
                  value:
                    id: 3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8
                    email: a.perera@bistecglobal.com
                    displayName: Amaya Perera
                    role: Student
                mentor:
                  summary: A mentor
                  value:
                    id: 9c8b7a6d-5e4f-4a3b-9182-7c6d5e4f3a2b
                    email: d.decruz@bistecglobal.com
                    displayName: Damian De Cruz
                    role: Admin
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '500':
          $ref: '#/components/responses/InternalServerError'
```

- [ ] **Step 2: Lint**

Run: `pnpm spec:lint`
Expected: zero errors, zero warnings.

- [ ] **Step 3: Verify the `Forbidden` response is now referenced**

Task 2 defined `Forbidden` but nothing used it until now. Confirm it is reachable:

Run: `grep -c "responses/Forbidden" spec/openapi.yaml`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add spec/openapi.yaml
git commit -m "feat(spec): add GET /api/v1/me

Documents the FR-1/FR-3 reading in the operation description: a valid
token whose subject is unregistered gets 403, never an auto-created
account, because registration is an Admin action."
```

---

### Task 5: Generate `packages/types`

**Files:**
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/.gitignore`
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: `spec/openapi.yaml`
- Produces: `@irp/types` exporting the generated `paths`, `components` and `operations` types from `src/schema.ts`. Later tasks and Plan 2B type handlers off `paths["/api/v1/me"]["get"]`.

**Generated output is not committed.** It is produced by `pnpm generate` and verified fresh in CI. Committing it would create a second copy of the contract that can drift — exactly what the staleness gate exists to prevent.

- [ ] **Step 1: Create `packages/types/package.json`**

```json
{
  "name": "@irp/types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/schema.ts",
  "types": "./src/schema.ts",
  "exports": {
    ".": "./src/schema.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  }
}
```

This package is consumed only at compile time, so it can point at TypeScript source — unlike `@irp/core`, which Node must load at runtime.

- [ ] **Step 2: Create `packages/types/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "noEmit": true },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/types/.gitignore`**

```
src/
```

- [ ] **Step 4: Add the generator to the root `package.json`**

Add to `scripts`:
```json
    "generate:types": "openapi-typescript spec/openapi.yaml -o packages/types/src/schema.ts",
```

Add to `devDependencies`:
```json
    "openapi-typescript": "^7.9.0",
```

- [ ] **Step 5: Install and generate**

Run: `pnpm install && pnpm generate:types`
Expected: exit 0; `packages/types/src/schema.ts` exists.

- [ ] **Step 6: Verify the output has the shape later tasks depend on**

Run:
```bash
grep -c "export interface paths" packages/types/src/schema.ts
grep -c "/api/v1/me" packages/types/src/schema.ts
```
Expected: `1` and at least `1`.

If `paths` is absent, the generator did not see the operations — stop and report.

- [ ] **Step 7: Typecheck the generated output**

Run: `pnpm -r typecheck`
Expected: exit 0. Generated code must satisfy the same strict settings as hand-written code; if it does not, that is a real finding — report it rather than relaxing the config.

- [ ] **Step 8: Commit**

```bash
git add packages/types/package.json packages/types/tsconfig.json packages/types/.gitignore package.json pnpm-lock.yaml
git commit -m "feat(types): generate @irp/types from the OpenAPI document

Output is git-ignored and regenerated in CI. Committing it would create a
second copy of the contract that can drift from the spec."
```

---

### Task 6: Generate `packages/client`

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/.gitignore`
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: `spec/openapi.yaml`
- Produces: `@irp/client`, the typed SDK. `apps/web` imports only from here — a raw `fetch()` to our own API is a bug (`CLAUDE.md`). Unconsumed until Plan 3.

- [ ] **Step 1: Create `packages/client/package.json`**

```json
{
  "name": "@irp/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  }
}
```

- [ ] **Step 2: Create `packages/client/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "noEmit": true },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/client/.gitignore`**

```
src/
```

- [ ] **Step 4: Add the generator to the root `package.json`**

Add to `scripts`, and add an aggregate `generate` that runs both:
```json
    "generate:client": "openapi-ts -i spec/openapi.yaml -o packages/client/src -c @hey-api/client-fetch",
    "generate": "pnpm generate:types && pnpm generate:client",
```

Add to `devDependencies`:
```json
    "@hey-api/openapi-ts": "^0.87.0",
```

- [ ] **Step 5: Install and generate**

Run: `pnpm install && pnpm generate`
Expected: exit 0; `packages/client/src/` contains generated files including an entry module.

- [ ] **Step 6: Confirm the entry point matches `package.json`**

`package.json` declares `./src/index.ts`. Verify the generator actually produced that filename:

Run: `ls packages/client/src`
Expected: includes `index.ts`.

If the generator emits a different entry filename, **update `package.json` to match the generator** — do not rename generated output, and do not hand-write an index. Report which filename it produced.

- [ ] **Step 7: Typecheck**

Run: `pnpm -r typecheck`
Expected: exit 0. If the generated client does not satisfy strict mode, report it rather than relaxing the config.

- [ ] **Step 8: Commit**

```bash
git add packages/client/package.json packages/client/tsconfig.json packages/client/.gitignore package.json pnpm-lock.yaml
git commit -m "feat(client): generate the typed SDK from the OpenAPI document

apps/web will import only from here; a hand-written fetch to our own API
is a bug. Unconsumed until Plan 3."
```

---

### Task 7: CI — lint the spec and gate on staleness

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `spec:lint` and `generate` scripts from Tasks 2, 5 and 6
- Produces: a PR pipeline that fails on any Redocly warning, or if regenerating produces a diff

**Why the staleness gate matters:** without it, "generated, never hand-edited" is a convention nobody enforces. With it, editing generated output or forgetting to regenerate after a spec change fails the build. That is the mechanism making the spec authoritative.

The generated directories are git-ignored, so `git diff` will not see them. The gate compares a fresh generation against the previous one by checksum instead.

- [ ] **Step 1: Add the spec and generation steps**

In `.github/workflows/ci.yml`, insert these steps after `Install` and before `Typecheck`:

> **Superseded by Amendment 2.** The standalone `Generate types and client` step was
> redundant — the staleness step below already runs `pnpm generate` — and nothing
> detected generated output that had been force-committed past `.gitignore`.

```yaml
      - name: Lint the OpenAPI document
        run: pnpm spec:lint

      - name: Fail if regenerating changes anything
        run: |
          pnpm generate
          find packages/types/src packages/client/src -type f | sort | xargs sha256sum > /tmp/gen-before.txt
          pnpm generate
          find packages/types/src packages/client/src -type f | sort | xargs sha256sum > /tmp/gen-after.txt
          if ! diff -u /tmp/gen-before.txt /tmp/gen-after.txt; then
            echo "::error::Generation is not deterministic — the same spec produced different output."
            exit 1
          fi

      - name: Fail if generated output is tracked in git
        run: |
          # Generated packages are git-ignored, so a clean regeneration leaves
          # the tree clean. `--porcelain` excludes ignored files, so this fires
          # only if someone force-committed generated output
          # (`git add -f packages/types/src/schema.ts`) or .gitignore regressed
          # — either of which creates a second, hand-editable copy of the
          # contract, exactly what the staleness gate above exists to prevent.
          if [ -n "$(git status --porcelain)" ]; then
            echo "::error::Regeneration dirtied the working tree — generated output is tracked, or .gitignore regressed."
            git status --porcelain
            exit 1
          fi

      - name: Build @irp/core
        run: pnpm --filter @irp/core build
```

- [ ] **Step 2: Verify the YAML is well-formed**

Run:
```bash
node -e "const s=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!s.includes('spec:lint')||!s.includes('runs-on'))throw new Error('malformed'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 3: Run the same sequence locally**

CI cannot be observed until it runs on GitHub, so prove the commands work here first:

```bash
pnpm spec:lint
pnpm generate
pnpm --filter @irp/core build
pnpm -r typecheck
pnpm lint
pnpm -r test
```
Expected: all exit 0; tests 112 passing.

- [ ] **Step 4: Verify generation is genuinely deterministic**

The gate assumes it is. Check rather than assume — some generators embed timestamps or version banners, which would make the gate fail on every run:

```bash
find packages/types/src packages/client/src -type f | sort | xargs sha256sum > /tmp/a.txt
pnpm generate
find packages/types/src packages/client/src -type f | sort | xargs sha256sum > /tmp/b.txt
diff -u /tmp/a.txt /tmp/b.txt && echo "DETERMINISTIC"
```
Expected: `DETERMINISTIC`.

**If it differs, stop and report** with the offending file and the differing lines. Do not weaken the gate to make it pass — a non-deterministic generator needs a different check, and I want to decide which.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint the OpenAPI document and gate on generation staleness

Zero Redocly warnings, and the build fails if regenerating produces
different output. Without the staleness gate, 'generated, never
hand-edited' is a convention nobody enforces."
```

- [ ] **Step 6: Push and confirm CI is green**

```bash
git push
```

Watch the run. All three timezone legs must pass with the new steps. **Do not claim CI is green without seeing it.**

---

## Definition of done

- [ ] `pnpm --filter @irp/core build` emits `dist/` with no test files, and the package imports successfully from Node
- [ ] `pnpm spec:lint` — zero errors **and** zero warnings
- [ ] `pnpm generate` produces `@irp/types` and `@irp/client`, both typechecking under strict mode
- [ ] Generation is deterministic
- [ ] `pnpm -r typecheck`, `pnpm lint`, `pnpm -r test` all clean; 112 tests still passing
- [ ] CI green on all three timezone legs with the new steps

## Follow-ups this plan creates

| # | Item | When |
|---|---|---|
| — | **Plan 2B: service and persistence.** Prisma, Fastify, the four plugins, routes, integration tests. Must use `ajv/dist/2020` — Fastify's default ajv is draft-07 and will silently misinterpret 3.1's JSON Schema 2020-12 — **and must register `ajv-formats`**, because the document uses `format: uri-reference`, `uuid` and `email`, none of which ajv implements natively, and an unknown format in strict mode throws at schema-compile time (boot), not at request time. See [ADR-0006](../../adr/0006-openapi-3-1-over-3-0.md) negative consequences | After 2A merges |
| O-13 | OpenAPI 3.1 instead of the brief's 3.0 ([ADR-0006](../../adr/0006-openapi-3-1-over-3-0.md)). Grading risk accepted by the Impl Lead; mentor notification optional | Next Teams batch |
| — | `packages/types` and `packages/client` point at TypeScript source, which is fine for compile-time consumers. If `apps/api` ever needs `@irp/client` at runtime, it needs the same `dist` treatment `@irp/core` got in Task 1 | Plan 3 |
