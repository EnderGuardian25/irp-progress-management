# ADR-0020 — A collapsed, mentor-only key for the cycle ribbon

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Damian De Cruz (Spec / Build / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** FR-28 (must-ship, SC-4), FR-33, NFR-13
- **Relates to:** [ADR-0003](0003-cycle-ribbon-as-fr-28-summary.md), `docs/design-system.md` §7 / §8.1 / §12

---

## Context

ADR-0003 chose the cycle ribbon over a counter row because the domain has more structure than
a counter can express. That structure is exactly the cost: the ribbon carries seven day-mark
states (`docs/design-system.md` §7 — full, partial, ochre notch, slate, red, outline, ringed)
plus §3.2's half-width `+` slot for Extra, and until now **none of them was named anywhere on
screen.** They were documented only in the design system and in `apps/web/lib/ribbon.ts`.

One of those states is not merely unlabelled but actively misleading if guessed at. On the
mentor's dashboard a bar is not one student's status — it is the **worst unresolved outcome
across the whole batch for that day**, ranked `missed → late → absent → partial → ok`
(§7's "Batch aggregation", implemented in `batchDayMark`). Read as a per-student mark, a
single red bar looks like a collapsed batch when it may mean one student out of ten missed one
day. The mentor's must-ship screen was inviting a false reading of its own headline element.

The student ribbon uses the same colours for that student's *own* status, where the aggregation
does not apply at all.

## Decision

Add `RibbonKey` — a disclosure (`<details>`), **collapsed by default**, rendered **once** below
all batch sections on the mentor dashboard only. It names all eight marks with a swatch drawn
from the ribbon's own `MARK_COLOR` map, and states the precedence rule in prose.

Three properties are load-bearing:

1. **Collapsed.** §8.1 requires the ribbon and its figures above the fold at 1280×800 (NFR-13).
   A key is read once and then never again; spending that budget permanently on it inverts the
   priority the requirement sets.
2. **Once per page, not per ribbon.** The dashboard renders one ribbon per batch. A key inside
   `CycleRibbon` would repeat for every batch — two today, more as the programme grows.
3. **Swatches import `MARK_COLOR` from `cycle-ribbon.tsx`.** They are not re-declared. A legend
   that has drifted from what is on screen is worse than no legend, and `counts-row.tsx` records
   what re-declaring these tokens leads to: the status vocabulary reached four separate inline
   definitions before it was consolidated.

## Rejected alternatives

**1. An always-open key.** Simplest, no interaction, and discoverable without a click. Rejected
on §8.1: the mentor dashboard is the one screen the design system requires to fit 1280×800
without scrolling, and eight rows of reference copy is a permanent tax on the space FR-28's
figures are entitled to. The disclosure keeps the affordance visible ("How to read this") at one
line's cost.

**2. A key inside each `CycleRibbon`, adjacent to the marks it explains.** Proximity is where a
legend reads best, and this was the first instinct. Rejected because `CycleRibbon` is per batch:
the same eight rows would render twice today and N times later. It would also put the key on the
*student* ribbon, which uses the same component and where the aggregation copy is false.

**3. One shared key across mentor and student ribbons.** Cheapest to maintain — one component,
one set of copy. Rejected because the copy cannot be true of both without going vague. "Missed"
means "at least one student missed" to a mentor and "you missed" to a student; wording that
covers both explains neither, and the aggregation reading is the specific thing this key exists
to fix. A student key, if wanted later, gets its own first-person copy.

**4. Per-mark tooltips or `title` attributes on the bars instead of a key.** Zero layout cost and
information exactly where the mark is. Rejected on two counts: it is not discoverable — nothing
indicates a bar is hoverable — and there is nowhere in a per-bar tooltip to state a rule that is
*about the relationship between* marks. §12 also puts the floor at "glyph plus text label,
always", which a hover-only affordance does not meet.

**5. Documenting it in the walkthrough only, with no UI change.** `docs/walkthrough.md` already
explains the ribbon for demo purposes. Rejected: a mentor using the system daily does not read
the repo, and the misreading risk is highest for exactly the person who never sees the docs.

## Consequences

- §7's mark table and the key's copy must now agree. `test/ribbon-key.test.tsx` derives the mark
  set from `batchDayMark` itself, so a new mark fails the test rather than silently going
  undocumented; it also asserts every `MARK_COLOR` value appears among the swatches.
- The key is mentor-only. If the student ribbon ever gets one, this ADR is amended, not reused.
- Swatch geometry has a floor. At a 16px track a 55% `partial` fill was not distinguishable from
  a full `ok` bar, and the `today` ring had no room to clear its outline offset — the first
  implementation shipped an unreadable key past its own tests, which pass on text, not pixels.
  The track is 20px with 3px of horizontal clearance for that reason. **A key whose swatches
  cannot be told apart is not a key**; check it rendered, not just green.
