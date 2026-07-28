# ADR-0006 — OpenAPI 3.1 rather than the brief's 3.0

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** NFR-7, NFR-8
- **Relates to:** ADR-0004 (Next.js 16 over the pinned 15)

---

## Context

The Month 2 challenge brief names **OpenAPI 3.0** under both its Week 7 material and
Deliverable 2, and Deliverable 2 is graded 25 points on the resulting spec. `CLAUDE.md`'s
fixed stack table does not name an OpenAPI version, so this is not a stack row swap in the
sense §4.2 reserves to the decision owner — but the brief is explicit and the artifact is
graded, so the deviation is worth recording.

The current release is **OpenAPI 3.1**, which differs from 3.0 in one way that matters here:
3.1 is a strict superset of **JSON Schema 2020-12**, whereas 3.0 uses a modified subset of
draft-04. That distinction is not cosmetic for this project, because
[Plan 2's spec](../superpowers/specs/2026-07-28-plan-2-api-contract-design.md) §4 makes the
OpenAPI document the *executed* source of validation, not merely a description of it.

The Impl Lead directed the move to 3.1 with grading risk explicitly accepted.

## Decision

Author `spec/openapi.yaml` as **OpenAPI 3.1.0**.

## Consequences

### Positive

- **Schemas in the document are real JSON Schema.** Under 3.0 they are a dialect that must be
  translated before a validator can use them; under 3.1 they can be handed to a 2020-12
  validator directly. Given that Plan 2 derives Fastify's runtime validation from this
  document, that removes a translation layer that would otherwise be a place for the spec and
  the running service to disagree — which is the exact failure the derive-from-spec decision
  exists to prevent.
- RFC 7807 Problem Details models more cleanly. 3.1 supports `type: ["string", "null"]` union
  syntax and full `$ref` sibling keywords, so the error schema does not need 3.0's
  `nullable: true` workaround.
- `webhooks`, `examples` on more nodes, and `const` become available if later plans need them.

### Negative

- **Deliverable 2 is graded against a brief that says 3.0.** A grader checking the stated
  constraint literally could mark this as a deviation. This ADR is the defence, and unlike
  ADR-0004 there is no escalation attached — the Impl Lead accepted the risk directly.
- **Fastify's default ajv is draft-07 and will not correctly interpret 2020-12 schemas.** The
  validator must be constructed from `ajv/dist/2020`. This is a real implementation
  requirement, not a footnote: leaving it on the default silently changes how keywords such as
  `prefixItems` and `$dynamicRef` behave, and would undermine the whole point of deriving
  validation from the spec. Recorded in Plan 2's spec so the implementation cannot miss it.
- **`ajv/dist/2020` alone is not enough — `ajv-formats` must be registered too.** The document
  uses `format: uri-reference` (throughout `Problem`), `format: uuid` (`User.id`) and
  `format: email` (`User.email`). Ajv implements no formats out of the box, and in strict mode
  an unknown format is a *schema-compile-time throw*, not a silently ignored keyword — so the
  API fails at boot, not at the first bad request. Installing `ajv-formats` and calling
  `addFormats(ajv)` is therefore a hard prerequisite for Plan 2B, and the alternative
  (`strict: false`, or `strictSchema: "log"`) is not acceptable here: it would turn every
  `format` in the contract into decoration, which is the drift this whole approach exists to
  prevent.
- Tooling support is good but marginally younger. `@redocly/cli`, `openapi-typescript` and
  `@hey-api/openapi-ts` all support 3.1; if any proves unreliable, the fallback is 3.0.3.

## Alternatives considered

### Rejected — OpenAPI 3.0.3, matching the brief

The safest option for grading, and it needs no ADR at all. Rejected on the Impl Lead's
explicit direction, and independently defensible: 3.0's schema dialect would force a
translation step between the document and the runtime validator, reintroducing the drift
surface that Plan 2's architecture is specifically designed to eliminate.

### Rejected — 3.1 for the document, 3.0-compatible schemas throughout

A hedge: author in 3.1 but avoid every 3.1-only construct, so downgrading is trivial. Rejected
as the worst of both — it accepts the grading risk while giving up the benefits that justify
taking it, and "avoid 3.1-only constructs" is a discipline with no mechanical enforcement, so
it would erode silently as later plans add operations.

### Rejected — defer the version choice until the spec is larger

Superficially prudent. Rejected because the version is the first line of the document and
every subsequent operation is authored against it; changing it later means re-verifying every
schema and re-running both generators. This is cheapest to decide now, with two endpoints.

## Revisit when

- `@redocly/cli`, `openapi-typescript` or `@hey-api/openapi-ts` proves unreliable against 3.1 —
  fallback is 3.0.3.
- The mentor or a grader objects to the deviation.
