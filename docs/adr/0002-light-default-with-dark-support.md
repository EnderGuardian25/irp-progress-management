# ADR-0002 — Light theme default, dark theme supported

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Damian De Cruz (Spec / Build / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** NFR-13
- **Relates to:** `docs/design-system.md` §3, ADR-0001

---

## Context

`docs/design-system.md` is built on OKLCH design tokens, which makes theming a token-set
swap rather than a parallel stylesheet. That lowers the cost of supporting a second theme
enough that the decision is worth making deliberately instead of by default.

The usage context is concrete. NFR-13 fixes the client to desktop browsers at minimum 1280px
— this is office software, used at a desk. The scene that drove the theme choice: *a mentor
in a Colombo office at 9:40am, bright tropical daylight through the window, checking who has
submitted before standing up for the daily check-in.* Students use it from the same rooms.

Two secondary audiences matter. Demo Day #2 puts this on a projector in front of the
stakeholder, and Deliverable 3 and 4 documents will carry screenshots read by the Hearts
Academy leadership team.

The complicating factor is that this system's colour vocabulary is load-bearing.
`docs/design-system.md` §3.2 defines `ok` / `late` / `absent` / `missed` as semantic status
colours that a mentor scans to make decisions. Status colours cannot simply be reused across
themes — they must be re-tuned per theme and re-verified, or they fail contrast or lose their
distinctions in one of them.

## Decision

Ship **light as the default theme, with dark supported from day one**, both driven off the
same token names with separate value sets.

Both themes are contrast-verified before build, not after. Status colours are re-tuned per
theme, never reused. Theme follows the OS preference by default with a persisted user
override.

Verification has been performed: 35 pairs across both themes pass WCAG AA (4.5:1 text,
3:1 non-text UI boundaries), with every token inside the sRGB gamut. Values and ratios are
recorded in `docs/design-system.md` §3.

## Consequences

### Positive

- Matches the physical usage context, which is the only reason that should drive this choice.
- Projects reliably at Demo Day and keeps screenshots legible in the graded deliverables.
- Because the token architecture already exists, dark costs one additional value set and one
  verification pass rather than a parallel implementation.
- Deciding now avoids the retrofit: adding dark in Month 3 would mean auditing every colour
  that had been hard-coded in the interim.

### Negative

- **The contrast-verification surface is permanently doubled.** Every colour introduced from
  here on needs checking in both themes. This is a standing cost on every UI PR, not a
  one-time cost.
- Dark-mode QA is required on every screen, including states that are awkward to reach
  (error, loading, empty, evaluated-and-locked).
- If charts are ever added — deferred in `docs/design-system.md` §2 — they will need a
  per-theme visualisation palette, which is meaningfully harder than per-theme UI colour.

### Mitigations

- The contrast checker used for the initial verification is kept and re-run whenever a token
  changes, so verification stays evidence-based rather than assumed.

## Alternatives considered

### Rejected — light only

The cheapest option, and defensible for a sprint. Rejected on retrofit cost rather than on
principle: dark is a baseline expectation for a developer-adjacent internal tool, so it is
likely to be asked for. Adding the second token set now costs one verification pass while the
palette is already open on the desk. Adding it after the UI is built costs a full colour
audit across every component, which is strictly worse work.

### Rejected — dark only

Distinctive, and popular with the developer-adjacent audience this serves. Rejected on the
usage scene: the room is a bright daylight office, which is the worst ambient condition for a
dark interface. It also carries real legibility risk on a projector at Demo Day in front of
the stakeholder who signs off the tool — a bad place to discover that a dark UI washes out.

## Revisit when

- Dark-mode QA proves to be a consistent drag on PR throughput, in which case dark ships
  behind a flag until it can be done properly rather than being half-maintained.
- Charts are introduced, which reopens the per-theme palette question.
