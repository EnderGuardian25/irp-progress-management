# ADR-0023 — Create batch returns to Students

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Damian De Cruz (Spec / Build / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** FR-3
- **Relates to:** [ADR-0022](0022-settings-as-the-registration-home.md), `docs/superpowers/specs/2026-08-04-frame-and-brand-design.md` §D1

---

## Context

ADR-0022 moved both `Register` and `Create batch` off `apps/web/app/(app)/students/page.tsx` and
onto Settings, on the grounds that a page named "Students" should not also be the surface on which
mentors are created. It explicitly rejected moving all four of the page's panels — `Register`,
`CreateBatchForm`, `TransferForm`, and the directory itself — because that would leave Students with
no actions at all, contradicting the same decision's premise that Students remains the management
surface for people and batches that already exist.

That decision has now run in the built application, and it has a visual cost ADR-0022 did not
anticipate because it reasoned about the page in the abstract rather than about its rendered layout.
`students/page.tsx` lays its two remaining panels — `TransferForm` and the `People` directory — in a
`grid-cols-2` grid. `People` is a directory listing, several times taller than a short transfer form,
so the right column runs long while the left column ends after `Transfer` and leaves the rest of that
column visibly empty. A mentor looking at the page sees a page that appears to be missing content
below the fold on one side, not a deliberately trimmed action set.

## Decision

`Create batch` returns to Students as a third panel in the left column, stacked beneath `Transfer`.
`Register` stays in Settings.

This supersedes ADR-0022's scope for `Create batch` specifically. ADR-0022 is not edited — its
reasoning about `Register` and about the page's naming mismatch stays on record and stays correct.
This decision narrows what moved, it does not reverse the move.

### Why ADR-0022's rejection of "move all four" does not block this

ADR-0022 rejected two configurations: leaving both forms on Students (its Rejected 1), and moving all
four panels to Settings (its Rejected 3). It did not consider, and therefore never weighed, the
configuration this ADR adopts — `Register` moved out, `Create batch` moved back — which leaves
Students with two actions (`Transfer` and `Create batch`) rather than zero. "Move all four" fails for
exactly the reason ADR-0022 gives: an actionless management surface. Moving only `Create batch` back
does not recreate that condition, since `Transfer` remains. Because the specific arrangement adopted
here was never evaluated and rejected, this is a new decision responding to a layout fact ADR-0022
could not have observed from the page in the abstract, not a re-litigation of a settled question.

## Rejected alternatives

**1. Leave `Create batch` in Settings and accept the gap.** Zero additional work — the page as
ADR-0022 left it. Rejected because the empty half-column beneath `Transfer` is the single most visible
feature of the rendered page, and a mentor opening it reads an unstyled gap as a rendering fault, not
as an intentional trim. A layout defect that looks like a bug is a worse outcome than the naming
mismatch ADR-0022 set out to fix.

**2. Make Students a single-column layout.** This closes the gap without moving anything back —
`Transfer` and `People` simply stack instead of sitting side by side. Rejected on two grounds. First,
it gives up the width `NFR-13`'s 1280px floor guarantees the page, for no benefit beyond avoiding
imbalance; the floor exists because there is room to use. Second, `People` is a long, scrollable list,
and a list of that shape is better placed beside a short form than stacked above or below it, where
the form would either interrupt the list or be pushed far down the page beneath it.

**3. Move `Register` back as well, reverting ADR-0022 entirely.** This fills the left column evenly
and restores the page exactly as it stood before Plan 7A. Rejected because it reinstates precisely the
mismatch ADR-0022 exists to fix: a page titled "Students" becoming, again, the surface on which
mentors are created — `RegisterForm`'s role select offers both `Student` and `Admin`, and choosing the
latter creates a mentor account with no batch or enrolment fields at all. Undoing ADR-0022 to solve a
layout problem would trade a visual defect for the exact conceptual one that decision was written to
remove.

## Consequences

- A batch is not a person, and it no longer sits under a heading about registering people. Grouping
  "create a batch" with "register a person" in Settings was, on reflection, a weaker grouping than it
  appeared when ADR-0022 was written; separating them again is an incidental improvement to that
  grouping, not only a layout fix.
- Settings keeps exactly one section for mentors — `Register` — so the per-section role gating
  ADR-0022 introduced stays necessary and is not simplified away by this change.
- `students/page.tsx` returns to three panels in total: `Transfer` and `Create batch` stacked in the
  left column, and the `People` directory in the right; test coverage for `Create batch` moves from
  the Settings suite back to the Students suite, mirroring Plan 7A's Task 7 in reverse.
