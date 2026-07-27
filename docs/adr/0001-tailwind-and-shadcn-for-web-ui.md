# ADR-0001 — Tailwind CSS and shadcn/ui for the web UI

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Damian De Cruz (Spec / Build / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** FR-28, FR-29, FR-30, NFR-13
- **Relates to:** `docs/design-system.md` §9, ADR-0002, ADR-0003

---

## Context

`apps/web` is Next.js 16 with TypeScript strict (ADR-0004 moved this off the pinned 15; the
shadcn and Tailwind compatibility that ADR flags must be verified at scaffold time rather
than assumed). The stack rows fixed by the programme
(`CLAUDE.md`) specify the framework but say nothing about the CSS layer or component
sourcing, so both are open decisions.

What the UI actually has to build is component-heavy in the difficult places, not the easy
ones:

- A roster data table with sorting, filtering and selection (FR-28)
- Dialogs and confirmation flows for review state transitions (FR-18 to FR-20)
- Selects and comboboxes for batch switching and student lookup
- Tabs, toasts, and disclosure for the review surface
- A bespoke cycle ribbon (ADR-0003), which no library provides

The first four are standard, accessible-by-convention components where correctness is
well-defined and getting it wrong is easy: focus trapping, keyboard navigation, ARIA roles,
escape handling, scroll locking. `docs/design-system.md` §12 sets accessibility as a
non-negotiable floor, so these cannot be approximated.

Two constraints shape the choice further. This is a solo sprint against a fixed Demo Day,
so time spent re-implementing solved problems is time not spent on the graded deliverables.
And `docs/design-system.md` commits to a specific visual system — 12px card radius, an OKLCH
palette, Plus Jakarta Sans with IBM Plex Mono — so any component source must be **fully**
restylable, not merely themeable.

## Decision

Use **Tailwind CSS** for styling and **shadcn/ui** for component primitives, with shadcn's
components retuned to the design system's tokens.

Tailwind version is pinned during T-01; v4 at time of writing.

Retuning is token-first and non-negotiable in ordering: define the CSS custom properties from
`docs/design-system.md` §3–§5 **before** adding the first shadcn component. Never add a
component and restyle it afterwards.

## Consequences

### Positive

- shadcn/ui sits on Radix primitives, so keyboard navigation, focus management and ARIA
  semantics for dialog, select, combobox, tabs and popover arrive correct rather than
  hand-audited.
- Components are copied into the repository and owned outright. There is no upstream
  stylesheet to fight and no version pin on a design dependency.
- Tailwind's config is the enforcement mechanism for the spacing scale and radius ceiling in
  `docs/design-system.md` §5 — constraint by default rather than by review.
- Fastest credible route to a dense roster table, which is the must-ship surface (SC-4).

### Negative

- Copy-in means no automatic upstream fixes. We own maintenance of every component pulled in.
- **shadcn's defaults are the "quiet operator" aesthetic this project explicitly did not
  choose.** A partial retune will read as templated — the exact failure mode the design
  direction exists to avoid. This is the main risk of the decision.
- Utility classes reduce the readability of dense component markup. Mitigated by extracting
  components early rather than letting class strings grow.
- Adds the shadcn CLI and `components.json` to the toolchain.

### Mitigations

- Token-first ordering, as above. The retune is structural (radius, spacing, type, colour),
  not a primary-colour swap.
- Any component added without being brought onto the design tokens is a review blocker.

## Alternatives considered

### Rejected — Tailwind alone, components hand-rolled

Keeps the dependency surface minimal and gives total control. Rejected because it puts
accessibility for dialog, select, combobox and the roster table on the critical path of a
solo sprint. That work is well-understood, has no differentiating value, and is the single
easiest place to silently ship something broken. The genuinely distinctive part of this
interface is the cycle ribbon, which is hand-built either way.

### Rejected — CSS Modules with hand-rolled components

Carries the same accessibility burden as above, and additionally gives up Tailwind's
config-as-constraint, so the spacing scale and radius ceiling become review conventions
rather than enforced values. Slowest of the three options. This would be the right call only
if there were a reason to avoid utility CSS, and there is none.

### Rejected — a batteries-included library (MUI, Mantine, Chakra)

Would solve accessibility just as well and faster than hand-rolling. Rejected because each
imposes an opinionated visual system that actively fights `docs/design-system.md`. Restyling
an opinionated library to a custom token set is materially harder than styling unstyled
primitives, and the result tends to read as "MUI with different colours."

## Revisit when

- The retune proves incomplete at review and components still read as stock shadcn.
- A future requirement needs a component class Radix does not cover (complex data grid,
  virtualised table beyond simple windowing).
