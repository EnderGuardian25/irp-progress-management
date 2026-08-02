# ADR-0018 — Dashboard aggregates read a batch-cycle in one batched pass

**Status:** Accepted · **Date:** 2026-08-03 · **Plan:** 7, Task 1

## Context

FR-28's mentor dashboard renders the cycle ribbon: every required day in the
current cycle, filled by that day's batch compliance. That is ~22 required days
× ~10 students of classification, per batch, per page load — and the page is
must-ship (SC-4), the one a mentor keeps open, and the one Plan 11's k6 run will
hammer against NFR-1 (p95 < 250 ms at 50 RPS).

`RosterService` already reads days for a batch, but per student: `listDays`
issues four queries (entries, absences, reports, enrolments) and the roster
calls it once per member via `Promise.all`. Its own comment records this as
"accepted for now… no premature batching until a real roster size demands it."
A whole-cycle read is that demand: 10 × 4 = 40 queries for one ribbon, 80 for a
two-batch dashboard.

## Decision

`DayService` gains `listDaysForStudents(studentIds, from, to, now)`, backed by
four `WHERE studentId IN (...)` repository reads, returning a
`Map<studentId, DayView[]>`. `listDays` becomes a one-student call through it,
so **classification stays on a single code path** — `classifyDay` remains the
only thing that decides late/missed/extra, and no aggregate re-derives a status.
`BatchRepo.enrolmentsInRange` supplies per-day membership in one further query,
replacing a `rosterMembers` call per date. Five queries per batch-cycle, flat in
roster size.

## Rejected alternatives

**Reuse the per-student fan-out.** Zero new code, and correct. Rejected on the
numbers above: it is 8× the queries on the project's most-loaded page, and
retrofitting it during Plan 11 — after the load test has already produced the
figures that go in the report — is strictly more work than doing it here.

**SQL `GROUP BY` aggregates.** One query returning counts per day. Rejected
because it would compute compliance *in SQL*, duplicating `classifyDay`'s grace
window, weekday rule and enrolment clipping in a second dialect. Spec §3 makes
the engine the source of the arithmetic; two implementations of "missed" is
exactly the drift that rule exists to prevent.

**Materialised per-day counters.** A table updated on write. Rejected: spec §3
says `Missed` is "computed, never stored" precisely because the grace rule is
still only mentor-assumed (O-10), and stored counters would strand stale rows
the day it moves.

## Consequences

Three repository interfaces grow four batched siblings between them —
`EntryRepo` gains two (`listEntriesForStudents`, `listReportsForStudents`),
`AbsenceRepo` and `BatchRepo` one each — and the DB-less test fakes grow with
them. `listDays`'s single-student behaviour is unchanged and its existing
tests are the regression guard for the delegation.
