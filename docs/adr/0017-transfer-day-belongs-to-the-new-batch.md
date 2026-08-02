# ADR-0017: The transfer day belongs to the new batch

## Status
Accepted (2026-08-02). Implements decision 3 of Plan 5's pre-PR pass.

## Context
`transfer()` closed the old enrolment AT the effective date and opened the
new one ON it, so both enrolments contained that day. Harmless while nothing
counted per-batch; Plan 6's roster and Plan 7's compliance denominators make
the overlap a double-count.

## Decision
The old enrolment's endDate becomes `effectiveDate − 1 day`; the new
enrolment starts on `effectiveDate`. Enrolment intervals are disjoint by
construction, so "which batch owns this day" is a lookup, not a rule every
query must re-implement. An `effectiveDate` on or before the open
enrolment's start is rejected (400) — it would produce an empty or negative
interval.

## Rejected alternatives
1. **Old batch keeps the day** (new starts at +1): the student's submission
   on transfer day would be reviewed by the batch they are leaving; the
   stakeholder framing is "starts with the new batch on the effective date".
2. **Keep the overlap, resolve at query time**: every roster/compliance
   query carries a tie-break clause forever, and the first one that forgets
   double-counts silently.
