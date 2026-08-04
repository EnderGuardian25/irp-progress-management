# Settings Page — Appearance, Registration, and a Reachable Dark Theme — Design

**Date:** 2026-08-04
**Author:** Damian De Cruz (with Claude Code)
**Status:** Approved by the Impl Lead on 2026-08-04 — presented as one document and approved in
full, after three decisions were settled individually (D2, D4, D5)
**Feeds:** Plan 7A (this slice), one branch and one PR. Numbered 7A on the 4A/4B precedent — it
follows Plan 7 (dashboards) and precedes Plan 8, which `handoff.md` §2a already assigns to
Notifications (T-16). It is **not** part of Plan 8.
**FRs:** FR-3 (registration), FR-5 (archive, indirectly — the People panel it touches stays put)
**Governs / closes:** [ADR-0002](../../adr/0002-light-default-with-dark-support.md) · `docs/design-system.md` §3.3, §6
**ADRs owed by this slice:** two — see §9

---

## 1. Scope and decision record

Decisions taken in the 2026-08-04 brainstorm, all by the Impl Lead:

| # | Decision | Choice |
|---|---|---|
| D1 | Purpose of Settings | Personal preferences **and** the registration surface. Not a preferences-only page. |
| D2 | What moves out of Students | **`Register` and `Create batch`.** `Transfer` and `People` (directory, archive/restore, archived view) stay. Rejected: also moving a mentor-only directory (duplicates archive logic), and moving all four panels (leaves Students with no actions, against D1's "Students remains the management"). |
| D3 | Theme choices | **Light / Dark / System**, System the default. System is not optional: it is today's behaviour, so dropping it would regress everyone currently happy. |
| D4 | Theme persistence | **A server-readable cookie.** No OpenAPI change, no migration, no endpoint. Rejected: `localStorage` (needs a blocking inline `<script>` or the first paint is the wrong theme) and a per-user column (a spec-first cycle, a migration, and a handler — and it *still* needs a cookie to avoid the SSR flash). |
| D5 | Dark verification | **In scope.** All eight screens walked in dark, defects fixed, and a Playwright project that renders dark so it cannot rot. Rejected: shipping the switch and auditing later, which leaves a reachable unverified theme; and auditing without a guard, which lets the next change break dark unnoticed. |

**Out of scope.** Notifications (Plan 8, FR-21/T-16), AI evaluation (Plan 9, blocked on O-5),
winner + PDF (Plan 10), load testing (Plan 11). Every non-goal in `docs/interview-and-prd.md`
§3.3 stands — in particular **no configurable rubric weights**, which is the one "settings"
idea a reader will reach for and the one that is explicitly forbidden. No mobile layout: the
theme control is desktop-only like everything else (NFR-13).

## 2. The requirement problem, stated rather than buried

**The theme switch maps to no FR.** `CLAUDE.md` is explicit that a change mapping to no FR
does not belong in this repo, so this cannot be waved through.

The honest framing: this slice **closes ADR-0002**, it does not implement a requirement.
ADR-0002 accepted "light default, dark supported, both contrast-verified", and
`docs/design-system.md` §3.3 committed 13 dark tokens plus a re-tuned status ramp. Today none
of it is reachable without the user changing their operating system's theme. Support nobody can
reach is not support, and the tokens are carried in `globals.css` either way — so the choice is
between finishing ADR-0002 and reverting it.

The registration move **is** covered: FR-3 is registration, and moving where the form lives
changes no behaviour it specifies.

**Action:** logged as a new open point **O-14** for mentor sign-off, alongside O-12 (Next.js 16).
Implement behind the stated assumption that finishing ADR-0002 is wanted; mark the theme
control's entry point `// ASSUMPTION: O-14`. Do not silently claim an FR.

## 3. Route, and a new gating pattern

`apps/web/app/(app)/settings/page.tsx` — Server Component, inside the `(app)` route group so
it inherits the app frame and the `proxy.ts` auth guard.

**This slice introduces per-section role gating, which the codebase does not currently have.**
Every existing mentor page redirects the whole route:

```ts
// roster/page.tsx, review/[studentId]/page.tsx, students/page.tsx, cycles/page.tsx
if (user.role !== "Admin") redirect("/");
```

Settings must **not** do that — a Student needs it for Appearance. So:

| Section | Admin | Student |
|---|---|---|
| Appearance (theme) | yes | yes |
| Register | yes | **not rendered** |
| Create batch | yes | **not rendered** |

Gating is by *not rendering* on the server, so nothing Admin-only is serialised into a
Student's page. It is not CSS hiding and not a disabled control.

Sidebar note: Students already never see mentor destinations at all (`STUDENT_DESTINATIONS`),
so a Student reaching Settings has one section and no dead links.

## 4. Sidebar placement

Settings is **not** appended to `MENTOR_DESTINATIONS` / `STUDENT_DESTINATIONS`. Those render in
document order inside a `flex flex-col`, so an appended entry sits immediately under the last
item — not at the bottom of the column.

Instead: a separate `SETTINGS_DESTINATION`, rendered after an `mt-auto` spacer, reusing the
existing `nav-item` class and the existing `isActive` helper unchanged. Both role arrays stay
exactly as they are. "Pinned to the bottom" becomes structural rather than a margin guess, and
survives the nav list growing.

`typedRoutes: true` (`next.config.ts`) validates every `<Link href>` against routes that exist,
so `href: "/settings"` does not compile until the page does. **The page and the link land in the
same task.** The sidebar's `LabelOnlyDestination` branch exists for the other ordering; it is
not needed here and stays unused.

## 5. The theme override layer

### 5.1 CSS

`globals.css` currently carries exactly one dark block, inside
`@media (prefers-color-scheme: dark)`. It becomes three rules, and **the order matters**:

```css
:root { /* light tokens — unchanged, §3.1 */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* dark tokens — §3.3 */ }
}

:root[data-theme="dark"] { /* dark tokens — §3.3 */ }
```

| Cookie | Attribute stamped | Result |
|---|---|---|
| `dark` | `data-theme="dark"` | Explicit rule wins on any OS |
| `light` | `data-theme="light"` | `:not([data-theme="light"])` neutralises the media query |
| `system` or absent | none | Media query decides — today's behaviour exactly |

The explicit `[data-theme="dark"]` rule must come **after** the media query, or "OS light +
user chose dark" loses.

### 5.2 The duplication, and why it is tested rather than commented

The dark token block appears **twice**. CSS cannot combine a media query with a selector list,
and there is no preprocessor in this project. That is inherent, not laziness.

It is also dangerous: `docs/design-system.md` §3 states 35 pairs pass WCAG AA and **"do not
substitute values"**. A copy that drifts breaks verified contrast *silently* — nothing renders
wrong, the numbers are just no longer the audited ones.

**So a unit test parses `globals.css`, extracts both dark declaration blocks, and asserts they
are byte-identical after whitespace normalisation.** Cheap, and it converts a comment nobody
reads into a gate. If a future refactor removes the duplication legitimately, the test fails
loudly and is updated deliberately.

### 5.3 Reading — and its build-output cost

`apps/web/app/layout.tsx` reads the cookie and stamps `data-theme` on `<html>`.

**Naming the consequence: reading cookies in the root layout forces dynamic rendering.**
`/_not-found` and `/not-registered` are currently prerendered (`○` in `next build` output) and
will become `ƒ`. That is a real, visible change to the build report and should not surprise a
reviewer.

The alternative — stamping a wrapper `<div>` rather than `<html>` — keeps those two static,
because custom properties inherit and would still reach every component. It was rejected:
`<body>`'s own canvas sits outside that wrapper, so the page edges would keep the previous
theme. A theme switch that leaves a light gutter around a dark page is worse than a dynamic
404.

### 5.4 Writing

A client control that does two things on change:

1. Sets `document.documentElement.dataset.theme` **immediately** — zero-latency feedback. A
   theme switch that waits for a server round trip reads as broken (§10 budgets 150–250ms).
2. Calls a Server Action to persist the cookie.

No `revalidatePath`: the DOM is already correct, and re-rendering would be a visible flicker
for no gain. This is a Server Action, not `fetch` — the "no hand-written fetch" house rule is
about our own API, and `entry-actions.ts` already establishes the Server Action pattern.

Cookie: `httpOnly: true` (only the server reads it; the control receives the current value as a
prop from the server), `sameSite: "lax"`, `path: "/"`, `maxAge` one year, `secure` when not
development.

**The action accepts only `light | dark | system`.** Anything else is rejected and nothing is
written, so no arbitrary cookie value can reach a DOM attribute. The parse is one place, shared
by the action and the layout read, so a malformed pre-existing cookie degrades to `system`
rather than stamping garbage.

## 6. Moving Register and Create batch

Both panels move verbatim — `RegisterForm` and `CreateBatchForm` are already standalone in
`app/(app)/students/forms.tsx`. The forms themselves need no change; their *host* changes.

`students/page.tsx` after the move:

- Drops the `Register` and `Create batch` panels and the now-unused `batchOptions` feed into
  `RegisterForm` — but **keeps `listBatches`**, because `Transfer` still needs batch options.
- Keeps `Transfer` and `People` unchanged, including `ArchiveButton` and
  `/students?view=archived`.
- Grid becomes two panels instead of four.

**One loose end that would otherwise rot:** `students/page.tsx:159`'s empty state reads
*"No one registered yet." / "Use Register to add the first mentor or student."* — that hint now
points at a panel on another page and must be reworded to send the reader to Settings.

`settings/page.tsx` needs `listBatches` for `RegisterForm`'s batch select. Both pages calling
`listBatches` is correct, not duplication: they need it for different reasons and neither is
the other's parent.

## 7. The dark pass (D5)

**Nine views**, in dark, looked at — every rendering screen in the app: Today (mentor), Today
(student home), Roster, Review (list), Review detail, Cycles, Students, Settings, My month.
Plus the two bare-frame pages, `/signin` and `/not-registered`, which use the same tokens
outside the app frame and are the easiest to forget.

**Why this is not ceremony.** Dark's tokens were verified by a *contrast script* — 35 pairs,
computed. No test has ever rendered dark (`grep` for `colorScheme` across `apps/web` returns
nothing, and Playwright never sets it), and no toggle existed, so no human has plausibly seen
these screens in dark. Earlier in this project a ribbon key shipped visually unreadable while
its own tests were green; a computed guarantee is not a seen one.

Specific things to check rather than assume:

- Any inline colour that is not a token — a hardcoded hex or an assumed-light default
- `status-pill.tsx`, the one component whose source mentions theme
- The cycle ribbon's `future` mark: a transparent bar with a `var(--line)` border, which is the
  lowest-contrast element in the system and the most likely to vanish on a dark canvas
- Focus rings against `--surface` in dark (§12 requires a visible 2px `--primary` ring)
- The new `RibbonKey` swatches, whose whole job is to be distinguishable

**Guard:** a second Playwright project, `chromium-dark`, with `colorScheme: "dark"`.

**Corrected 2026-08-04 while writing Plan 7A** — an earlier draft of this section said the dark
project runs *the existing specs*. That would have reintroduced the defect fixed one PR earlier.
`mentor-flows` and `student-flows` **mutate shared state**: they submit an entry for today, walk a
report irreversibly to Evaluated, and call `reseed()` mid-run. Running them a second time inside
one serial run means the second pass meets state the first pass consumed — the exact
state-dependence that produced 24/24, 23/24, 19/24 before `workers: 1` was pinned.

So the dark project is scoped by `testMatch` to **one new read-only spec**, `dark-theme.spec.ts`,
which signs in, visits each view, and asserts rendering only — no submissions, no transitions, no
reseed. Cost is one extra sign-in chain rather than a doubled suite, and the mutating specs keep
running exactly once, in light, where they were verified.

## 8. Testing

| Level | Case |
|---|---|
| Unit | Settings renders Appearance for **both** roles |
| Unit | Register and Create batch render for Admin and are **absent** from a Student's markup — asserted on absence, not on being hidden |
| Unit | The theme control marks the active choice from its server-supplied prop |
| Unit | The Server Action writes the cookie for each of `light`/`dark`/`system` |
| Unit | The Server Action **rejects** an unknown value and writes nothing |
| Unit | A malformed existing cookie degrades to `system` |
| Unit | `globals.css`'s two dark blocks are identical (§5.2) |
| Unit | Students page: Transfer and People remain; Register and Create batch are gone |
| E2E | Switch theme in Settings, assert `<html data-theme>`, reload, assert it persisted |
| E2E | `chromium-dark` project over the existing specs |

## 9. ADRs owed

Per `CLAUDE.md`, a decision with a plausible rejected alternative needs an ADR naming at least
two. Two qualify, and both are written **before** implementation:

**ADR-0021 — Theme persistence by server-readable cookie.** Rejected: `localStorage` with a
blocking inline script (a flash of the wrong theme otherwise, and an inline `<head>` script is
exactly what this codebase avoids); a per-user column on `User` (a full spec-first cycle,
migration and handler — and it still needs a cookie for the first paint, so it is strictly
additive work, not an alternative to the cookie).

**ADR-0022 — Settings as the registration home.** Rejected: leaving registration on Students
(the page named "Students" stays the mentor-creation surface, which is the mismatch that
prompted this); renaming Students to "People" (fixes the label, but concedes that one page is
both directory and factory); moving all four panels (leaves Students with no actions at all,
contradicting D1).

## 10. Documentation to update

- `docs/design-system.md` §6 — the frame mock gains a bottom-pinned Settings entry
- `docs/design-system.md` §3.3 — dark is now user-reachable; record the `data-theme` contract
  and the two-block duplication with its parity test
- `docs/design-system.md` §14 — add ADR-0021
- `docs/interview-and-prd.md` §5 — add **O-14** (theme switch maps to no FR; ADR-0002 closure)
- `ONBOARDING.md` §8 — the demo flow gains the theme switch; note registration is now in
  Settings
- `docs/walkthrough.md` — the Students walkthrough loses two panels; add Settings
- `handoff.md` §1 — a dated entry for this slice

## 11. Risks

| Risk | Handling |
|---|---|
| The dark pass finds more defects than expected, and the slice grows | Fix what dark reveals in *this* slice — that is D5. If a defect needs a design decision rather than a fix, log it and keep the switch, since dark is no worse than it is today. |
| Root-layout cookie read makes two routes dynamic | Named in §5.3; assert the new build output deliberately rather than treating the change as a regression. |
| `chromium-dark` doubles e2e time | Accepted in §7. If CI time becomes the binding constraint, the dark project runs a subset — but the subset is chosen deliberately and logged, never silently. |
| A future edit desyncs the two dark blocks | The §5.2 parity test. |
| O-14 is answered "no" | The registration move (FR-3) stands on its own and is independent; the theme layer would be reverted without touching it. Keep the two in separate commits so that is a clean revert. |
