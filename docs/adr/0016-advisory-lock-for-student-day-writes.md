# ADR-0016: Transaction-scoped advisory locks serialise student-day writes

## Status
Accepted (2026-08-02). Implements decision 2 of Plan 5's pre-PR pass.

## Context
"A day cannot hold both entries and an absence" spans two tables, so no
unique index can express it. Both write paths are check-then-write; under
READ COMMITTED two concurrent requests can each pass the check and both
commit (Plan 5 final review).

## Decision
`pg_advisory_xact_lock(hashtextextended(studentId || ':' || date, 0))` as the
first statement of both transactions. The lock is per student-day, held to
commit/rollback, and cannot be leaked (xact-scoped). Whichever transaction
wins, the loser re-runs its check after the lock clears and throws the
correct DomainError.

## Rejected alternatives
1. **SERIALIZABLE + retry-on-40001** — correct but general-purpose machinery
   (retry loops, error classification) for exactly one conflict pair; every
   other write in the system is single-row and does not need it.
2. **A DB-level exclusion constraint via a shared "day claim" table** — makes
   the invariant declarative but adds a table whose only purpose is locking,
   plus insert/delete bookkeeping on every entry and absence write.
