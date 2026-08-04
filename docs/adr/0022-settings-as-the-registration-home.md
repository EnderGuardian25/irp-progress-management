# ADR-0022 — Settings as the registration home

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Damian De Cruz (Spec / Build / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** FR-3, FR-5
- **Relates to:** `docs/design-system.md` §6

---

## Context

`apps/web/app/(app)/students/page.tsx` renders four panels: `RegisterForm`, `CreateBatchForm`,
`TransferForm`, and the directory itself (with an archive/restore view behind
`?view=archived`). `RegisterForm`'s role select offers **Student and Mentor** — its options are
literally `Student` and `Admin` (`students/forms.tsx:39-54`), and choosing the latter creates a
mentor account with no batch or enrolment fields rendered at all, per the same form's
FR-3 contract.

That makes a page titled "Students" the surface a mentor uses to create other mentors. The name
promises a roster of learners; the page also promises to mint colleagues. Nothing about the
directory, the transfer control, or the archive view is wrong — the mismatch is specifically
that registration, an act that is not about students at all when the role chosen is Mentor,
lives on a page named for the thing it is not always creating.

## Decision

Move `Register` and `Create batch` to Settings. `Transfer` and `People` — the directory,
archive, restore, and the `?view=archived` list — stay on Students, which remains the
management surface for the people and batches that already exist.

## Rejected alternatives

**1. Leave registration on Students.** Zero work, and both forms are already built and wired
in exactly the place they'd need to be. Rejected because doing nothing here preserves the exact
mismatch that prompted the change: a page named "Students" would go on being the place mentors
are made, and the confusion is not cosmetic — it is a wrong mental model of what the page is
for, handed to every future reader of the code and every mentor who opens it.

**2. Rename Students to "People".** Cheap, and it fixes the label honestly: a page called
"People" can defensibly create a mentor. Rejected on two grounds. First, it concedes rather
than resolves the underlying problem — one page would still be both the directory and the
factory, just under a name broad enough to cover both jobs instead of a name that actually
describes what happens on it. Second, it renames a route (`/students`) that the e2e suite, the
sidebar navigation, and `docs/walkthrough.md` all address by that exact name; the rename cost is
real and lands on files this decision does not otherwise need to touch.

**3. Move all four panels to Settings.** The cleanest admin/view separation on paper — Settings
becomes where mentors act, Students becomes where they look. Rejected because it leaves Students
with no actions at all, which contradicts the decision, made in the same breath, that Students
remains the management surface. A management surface with nothing to manage from is not a
smaller version of the page; it is a different page that happens to share a route.

## Consequences

- The directory and the archive controls are **not** duplicated between the two pages. Mentors
  are created in Settings; both Students and Mentors are archived from Students. That split is
  deliberate rather than an oversight: archive is FR-5, it applies identically to both roles, and
  it belongs in exactly one place — the place that already holds the list it acts on.
- `RegisterForm` and `CreateBatchForm` move as components; their FR-3 contract, `admin-actions.ts`
  bindings, and validation are unchanged by the move. This is a placement decision, not a
  behaviour change.
- Students loses two of its four panels but keeps its route, its e2e coverage by name, and its
  role as the page a mentor opens to see and manage who already exists.
