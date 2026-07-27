# ADR-0004 — Next.js 16 in place of the pinned Next.js 15

- **Status:** Accepted — **pending stakeholder sign-off (O-12)**
- **Date:** 2026-07-28
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** NFR-13
- **Relates to:** ADR-0001, ADR-0005

---

## Context

`CLAUDE.md` fixes the frontend at **Next.js 15**, and the Month 2 challenge brief names the
same version under Technical Constraints. Both state the stack is a programme constraint
rather than a preference: swapping any row requires an ADR **and** stakeholder escalation.

On 2026-07-28 the current release is **Next.js 16.2.12**. The Impl Lead issued a standing
instruction to build on the newest available version of every framework and platform, which
collides directly with the pinned row.

This is not a decision the ADR alone can settle. PRD §4.2 places "any change to
stakeholder-visible scope" and the fixed stack with the decision owner, and the standing rule
in §4.2 is explicit: a change touching §3.3 or §3.4 goes to the mentor before code moves.
Next.js version is not itself an FR, but it is a graded stack row named in the brief, which
puts it in the same class.

## Decision

Build `apps/web` on **Next.js 16.x**.

This ADR records the decision and the reasoning. It does **not** substitute for the
escalation: **O-12 is open and the mentor must sign off.** If sign-off is refused, the
fallback is Next.js 15 and the cost is bounded — see Consequences.

## Consequences

### Positive

- Current release, with the longest support runway. Next.js 15 is a year behind and will
  reach end of active support sooner, which matters if the Academy keeps this system running.
- Avoids scaffolding on a version we would want to leave almost immediately, since the
  standing instruction would force the upgrade later anyway — at a point when there is more
  code to migrate.
- Consistent with ADR-0005's principle of choosing the newest version that the surrounding
  ecosystem actually supports.

### Negative

- **This is a graded stack row.** The brief names Next.js 15 explicitly. A grader checking
  the stated constraints literally could mark this as a deviation, and the ADR plus the
  escalation record is the only defence. That defence is only real if the sign-off lands.
- Compatibility with Tailwind and shadcn/ui (ADR-0001) needs verification at scaffold time
  rather than assumption. If shadcn's registry has not caught up to Next 16, the retune work
  ADR-0001 describes gets harder.
- Any Next-16-specific API used makes the fallback to 15 more expensive over time.

### Bounding the fallback

Next.js does not appear in Plan 1 (foundation and cycle engine) or Plan 2 (API contract and
service). It first lands in Plan 3. Until then the cost of reversing this decision is
**zero**, and it stays low for as long as `apps/web` avoids version-specific APIs. The
escalation should be resolved before Plan 3 begins.

## Alternatives considered

### Rejected — stay on Next.js 15 as pinned

The safest option for grading, and the one requiring no escalation at all. Rejected because
the Impl Lead's standing instruction is explicit, and because scaffolding onto a version we
intend to leave means paying the migration later with more code in place. Kept as the
fallback if sign-off is refused — the ADR is written so that reversal is a scaffold change,
not a redesign.

### Rejected — defer the decision to Plan 3

Superficially attractive since Next.js is not needed yet. Rejected because scaffolding
decisions harden earlier than the code that depends on them: the workspace layout, the
TypeScript configuration and the CI matrix all get written in Plan 1, and discovering a
version constraint after they exist is more disruptive than settling it now. Deferring also
delays the escalation, and the mentor's response window is a working day.

### Rejected — Next.js 16 with no escalation

Fastest, and tempting because the version is an implementation detail in most projects.
Rejected outright: PRD §4.2 reserves fixed-stack changes to the decision owner, and quietly
swapping a graded row would break the one governance rule this solo sprint has in place of
peer review. The point of the standing rule is that it binds when it is inconvenient.

## Revisit when

- The mentor responds to O-12. If sign-off is refused, revert to Next.js 15 before Plan 3.
- Tailwind or shadcn/ui prove incompatible with Next 16 at scaffold time.
