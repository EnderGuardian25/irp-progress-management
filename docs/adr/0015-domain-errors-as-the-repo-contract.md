# ADR-0015: DomainError subclasses are the repository error contract

## Status
Accepted (2026-08-02). Implements decision 1 of Plan 5's pre-PR pass.

## Context
Plan 5's review recorded four places a repository failure leaks something a
caller cannot act on: `batch-repo.transfer` throws a bare `Error`, `enrol()`
surfaces Prisma's P2002 directly, `absence.create` has the same raw P2002 on
a duplicate, and `absence.remove` succeeds silently when nothing exists.
Plan 6 adds fourteen endpoints that must turn these into RFC 7807 responses.

## Decision
Every repository failure a caller can act on is a `DomainError` subclass
carrying a stable machine-readable `code`, an HTTP `status`, and a human
`title`. The problem-details plugin maps any `DomainError` to
`application/problem+json` centrally: `type` is
`https://irp.bistec.example/problems/<code>`, `detail` is the message.
Handlers and services throw domain errors and never translate them.

## Rejected alternatives
1. **Per-route try/catch translation** — N routes × M errors of mapping code;
   the first forgotten catch leaks a Prisma error shape as a 500.
2. **Reusing the existing `HttpError` hierarchy directly in repos** — couples
   the persistence layer to HTTP vocabulary; the seed (a repo consumer with
   no HTTP context) treats domain errors as seed bugs, which `HttpError`
   would misrepresent as transport concerns.
