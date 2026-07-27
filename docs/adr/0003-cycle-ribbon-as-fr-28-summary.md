# ADR-0003 — Cycle ribbon as the FR-28 summary surface

- **Status:** Accepted, **amended 2026-07-28** (see Amendment 1)
- **Date:** 2026-07-27
- **Deciders:** Damian De Cruz (Spec / Build / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** FR-28 (must-ship, SC-4), FR-29, NFR-13
- **Relates to:** `docs/design-system.md` §7, T-06 (cycle/date engine), T-08 (OpenAPI spec)

---

## Context

FR-28 is the stakeholder's must-ship surface. Asked what had to exist if only one thing could
ship, the answer was *"the performance summary dashboard and the daily student submission
count"* (`docs/stakeholder-interview.md` Q4, traced as SC-4).

The requirement is specific: a per-batch performance summary, today's count in the form
"*N of M* submitted", and late and absent counts, **all visible without scrolling** at the
1280px minimum width set by NFR-13.

The obvious reading of that is a row of counters. But the domain has more structure than a
counter can express. Submissions run on a weekday-only cadence; cycles run the 10th to the
9th anchored to the batch's admission date, evaluated in Asia/Colombo; and a day resolves to
one of several distinct states — submitted, late (inside the one-day grace window), absent
(recorded with a reason), or missed (final). A single day's three numbers throw away the
shape of the cycle that produced them.

`docs/design-system.md` §2 also rules out charts for v1 and bans the identical-card-grid and
hero-metric patterns, which removes both of the reflexive answers.

## Decision

Render the FR-28 zone as a **cycle ribbon**: a single horizontal strip showing every working
day of the current cycle, each day a small bar whose fill represents that day's batch
compliance, with today marked and future days drawn as outlines. The three FR-28 figures sit
inline beneath it.

**Empty weekends are not rendered at all** — not greyed, not dimmed, absent. See Amendment 1
for weekends that carry extra work.

The same component serves the student dashboard (FR-29) showing personal marks instead of
batch compliance.

## Consequences

### Positive

- Shows the shape of the cycle rather than a snapshot. A mentor sees a recurring Tuesday dip;
  three counters cannot express that at any price.
- Satisfies FR-28's no-scroll constraint as one component rather than a card grid, leaving
  the remaining vertical budget to the roster.
- One component serves both dashboards, so there is one thing to build, test and keep
  visually consistent across the two audiences.
- **It is a live assertion on the date engine.** T-06 is identified in `handoff.md` §3 as the
  subtlest logic in the system. If the ribbon ever renders an *empty* weekend, or the wrong
  number of required days, or a boundary on the wrong date, the bug is visible on the landing
  screen rather than buried in a scoring calculation three weeks later. The UI becomes a
  permanent visual regression test on the hardest logic in the project.

### Negative

- It is bespoke. No library provides it, so it carries its own accessibility work: the ribbon
  must expose real semantics with per-day accessible names and status text, not a row of
  coloured `div`s. Colour alone is never the carrier (`docs/design-system.md` §12).
- It needs defined behaviour for edge states that a counter would not have: cycle day 1, a
  batch admitted mid-cycle, and a cycle viewed after it has closed.
- **It changes the API contract.** The dashboard endpoint must return per-day aggregates for
  the whole cycle, not just today's counts. This lands in T-08 and is the concrete case of
  design informing the spec before the spec hardens.

### Width budget

At the 1280px minimum with a 216px sidebar and 32px padding each side, roughly 1000px is
available. A long cycle runs 22–23 working days, giving about 43px per day — enough for a
narrow bar plus a two-digit date label in IBM Plex Mono at 11–12px. It fits, but there is no
slack: any additional per-day affordance needs the budget re-checked.

## Alternatives considered

### Rejected — a row of three stat cards (N of M / late / absent)

The literal, cheapest reading of FR-28, and it would pass the requirement as written.
Rejected on three counts. It is a snapshot with no trend, so it tells the mentor nothing they
could not get from a Teams message. It is the identical-card-grid and hero-metric pattern
that `docs/design-system.md` §2 bans. And it spends a large share of the no-scroll budget on
three numbers that occupy one line of text in the chosen design.

### Rejected — a full data-visualisation dashboard (trend lines, distribution, rubric breakdown)

The richest artefact for the leadership audience, and the most impressive at Demo Day.
Rejected on dependency and timing. The rubric breakdown depends on T-17, which is blocked on
O-5 (AI provider and data-processing approval), so a significant part of it cannot be built
or populated. It requires a chart library and a per-theme visualisation palette, which
ADR-0002 identifies as materially harder than per-theme UI colour. And trend charts are
close to meaningless until at least one full cycle of real data exists — the system starts
empty, with no data migration (`CLAUDE.md`, hard boundaries). Revisit for v2.

### Rejected — roster-only view with counts in the header bar

Maximises the number of student rows visible without scrolling, which has real value for a
mentor working through a batch. Rejected because it demotes the stakeholder's explicit
must-have to chrome, and because the "performance summary" half of FR-28 has nowhere to live
in a header strip. Failing the one requirement the stakeholder named is not a trade worth
making for row count.

## Amendment 1 — weekends carrying extra work (2026-07-28)

**Trigger.** FR-12 was revised and FR-33 added (see O-11): weekdays remain required, but
weekends became **optional days that may hold entries counted as Extra**. The original
decision's "weekends do not exist in this domain" premise no longer holds.

**What changes.** An *empty* weekend is still not rendered — unchanged. A weekend carrying
extra work renders as a **half-width `+` slot** between its Friday and Monday. The ribbon is
five-a-week by default and grows only where someone actually worked.

**What does not change.** Compliance figures — "N of M submitted", late, absent, missed — are
computed over required days only. Extra never enters a denominator, so the numbers the
stakeholder named in SC-4 mean exactly what they meant before.

**A rejected alternative, recorded because it was measured and failed.** The obvious move was
a fifth status colour for Extra. A teal at hue 200 came out within **1.01:1 luminance** of the
`ok` green at hue 155 — indistinguishable under colour-vision deficiency with the two marks
adjacent in a dense strip, and no lightness in the usable range separated them, because both
are mid-luminance hues. Distinguishing by **form** (half width plus a glyph) is
CVD-safe by construction, and it is the more honest representation anyway: Extra is not a
compliance outcome and does not belong in the compliance ramp.

**Cost accepted.** Ribbon width is now variable across students in the same batch, so the
43px-per-day budget in the width section above tightens when several weekends carry work. If
a cycle with heavy weekend activity overflows 1280px, the fallback is to collapse consecutive
extra slots into a single `+N` marker rather than to shrink the required days.

## Revisit when

- A full cycle of real data exists and trend visualisation becomes meaningful (v2).
- O-5 resolves and the rubric breakdown becomes buildable, which may justify a dedicated
  evaluation surface alongside the ribbon rather than instead of it.
- Batch sizes grow enough that per-day batch compliance stops being readable at 43px per day.
