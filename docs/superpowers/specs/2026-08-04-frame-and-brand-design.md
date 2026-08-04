# Design — the app frame and the brand mark (Plan 7B)

**Date:** 2026-08-04
**Status:** approved
**Supersedes in part:** [ADR-0022](../../adr/0022-settings-as-the-registration-home.md) — see D1
**Follows:** Plan 7A (`2026-08-04-settings-page-design.md`), merged as `d63a295`

---

## Goal

Finish the app frame. Plan 7A made dark reachable and moved registration into Settings; a manual dark
visual pass of that work produced six follow-ups. Two were dark-mode defects and shipped with 7A. The
remaining four are design changes, and this slice implements them alongside two carry-overs from 7A's
whole-branch review.

The frame gains a brand mark, an icon per destination, and Sign out; the Students page gets its
`Create batch` panel back; and two pieces of 7A's own documentation and test coverage are corrected.

## Why this is a slice and not a set of tweaks

Every item touches the same three surfaces — `sidebar.tsx`, `topbar.tsx`, and the two bare auth pages —
so shipping them separately would mean editing the sidebar four times and re-reviewing it four times.
They also share one new design-system token and one new icon module.

**None of these map to an FR.** `CLAUDE.md` states that a change mapping to no FR does not belong in
the repo, so this is recorded rather than assumed: they were requested directly by the mentor after
reviewing the running application, which is the same footing as **O-14** (the theme switch). They are
logged under **O-15** and, like the theme layer, are kept in commits separable from anything an FR
depends on. `Create batch`'s relocation is the exception — it serves **FR-3**, which is why it needs an
ADR rather than an open point.

---

## Decisions

### D1 — `Create batch` returns to the Students page

It becomes a third `<Panel>` in the left column of `students/page.tsx`, beneath `Transfer`. `Register`
stays in Settings.

**This reverses part of ADR-0022,** which moved both panels and explicitly rejected "move all four" on
the grounds that it would leave Students with no actions at all. It also rejected leaving registration
in place. Neither rejection covered *this* arrangement — Register out, Create batch back — so the
reversal is a new decision, not a re-litigation.

The reason it changes: `grid-cols-2` with two panels leaves the left column visually empty below
`Transfer`, because the `People` directory is several times taller. A batch is also not a person, so
grouping "create a batch" with "register a person" was a weaker grouping than it appeared.

**ADR-0023 records this and supersedes ADR-0022's scope.** ADR-0022 is committed and its reasoning is
on record; it is not edited. ADR-0023 must name at least two rejected alternatives, per `CLAUDE.md`.

### D2 — The logo appears as a mark in the frame and as the full lockup on the auth pages

The supplied asset (`hearts-academy.png`, 1080×1031, RGBA) is a stacked lockup: a heart mark above a
three-line wordmark reading BISTEC / Hearts / Academy, in near-black green on an off-white field.

The topbar is 56px tall, so the whole lockup fits at roughly 40px — at which the wordmark is
illegible. It would also sit beside text already reading "Hearts Academy · IRP", and on `/signin`
directly above an `<h1>Hearts Academy</h1>`. So:

| Placement | Asset | Size | Adjacent text |
|---|---|---|---|
| `topbar.tsx` | heart mark only | 32px square | keeps "Hearts Academy · IRP" |
| `/signin` | full lockup | ~140px wide | **replaces** the duplicated heading |
| `/not-registered` | full lockup | ~140px wide | **replaces** the duplicated heading |

Both existing blue diamonds (`&#9670;`) are removed — `topbar.tsx` and `signin/page.tsx`. There are
two, not one.

### D3 — The brand card is a deliberately theme-invariant token

The logo's wordmark is near-black green on a light field, so it must not sit directly on a dark
surface. It gets a white rounded card.

No existing token can back that card: `--bg` is `#ffffff` in light but `#121212` in dark, and every
other neutral flips too. A Tailwind `bg-white` or a literal hex would violate the project's rule that
every colour resolves through a token — and would slip past 7A's hardcoded-colour grep, which only
matches hex literals.

So a new token, **`--brand-card: #ffffff`**, is defined once in the base `:root` and **deliberately
absent from both dark blocks**. It stays white in dark by never being overridden, which is also why it
needs no dark entry and therefore sits outside the `/* dark-tokens */` markers — leaving the parity
test's 13-declaration assertion untouched.

This is the design system's first intentionally theme-invariant colour and must be documented as such
in §3, including *why* it is exempt from the light/dark pairing rule. Its contrast is not ours to
verify: the pairing inside the card is the supplied asset's own.

### D4 — Icons are hand-drawn, inherit `currentColor`, and are decorative

Seven icons: Today, Roster, Review, Cycles, Students, Settings, Sign out. A new
`apps/web/components/ui/icons.tsx` exports them as 16px stroke SVG components.

Hand-drawn rather than a library. No icon dependency exists in the repo, the only SVG anywhere is
hand-drawn in `status-pill.tsx`, and the stack is a fixed programme constraint — adding a dependency
for seven glyphs would need an ADR and stakeholder escalation for no real gain.

Every icon uses `stroke="currentColor"` and no fill, so it inherits `.nav-item`'s resting, hover and
`data-active` colour automatically. That is what makes dark work with no new tokens and no
dark-specific rules.

Every icon carries `aria-hidden="true"`. The text label remains the accessible name, so the design
system's rule that nothing conveys meaning by colour alone is unaffected — and the icons add no
meaning a screen reader would miss.

### D5 — Sign out is rendered by the server layout and passed into the client sidebar

`sidebar.tsx` is a Client Component because it needs `usePathname`. `signOut` comes from `@/auth` and
is server-side; `topbar.tsx` can use it today only because it is a Server Component with an inline
`"use server"` action.

`app/(app)/layout.tsx` is already a Server Component that renders `<Sidebar role={user.role} />`. It
therefore builds the sign-out form — the existing inline action verbatim — and passes it to the
sidebar as a `ReactNode` prop. The client sidebar renders it in its bottom group and never imports
`@/auth`.

**Rejected — the client `signOut` from `next-auth/react`.** It would let the sidebar own the control
outright, but it changes the established auth path for a cosmetic relocation and would need its own
ADR. The server action already works and is already reviewed.

The topbar keeps the brand mark and the user's name. It remains a `banner` landmark with content.

### D6 — Two carry-overs from 7A's whole-branch review

**The `ORDER MATTERS` comment states a wrong mechanism.** `globals.css` and design-system §3.3 both
claim `:root[data-theme="dark"]` must come last so an explicit dark choice beats an OS reporting
light. When the OS reports light, `@media (prefers-color-scheme: dark)` does not match at all — there
is nothing for source order to beat. The two selectors have equal specificity, so order matters only
when *both* match, and in that case the parity test guarantees the blocks are identical.

The load-bearing part is the `:not([data-theme="light"])` guard. The rule order does not change; only
the justification. The risk being fixed is concrete: a reader who works this out may conclude the
guard is the redundant half and delete it, which *would* be a bug (OS-dark plus explicit light would
render dark).

**The dark e2e walk covers six of the eleven views its own spec named.** Student Today, `/my-month`,
`/review/<id>`, `/signin` and `/not-registered` have no dark rot-protection, and they are exactly the
screens a human was asked to check by eye. All five are read-only to visit.

---

## 1. `Create batch` returns to Students

`students/page.tsx` regains the `<Panel title="Create batch">` block and imports `CreateBatchForm`
from `./forms` again. `settings/page.tsx` drops it and its grid becomes two panels. `forms.tsx` is
**not** modified — as in 7A, only the host changes.

`listBatches` and `batchOptions` stay on Students (`TransferForm` needs them) and stay on Settings
(`RegisterForm` needs them). Both pages continue to gate the read for non-Admins.

The empty-state hint added in 7A — "Register the first mentor or student from Settings." — stays
correct and is not reworded: registration is still in Settings.

## 2. The logo assets

Two derived assets, committed under `apps/web/assets/`:

| File | Derivation | Purpose |
|---|---|---|
| `hearts-academy-mark.png` | crop the mark region, resize to 64px square | topbar, rendered at 32px |
| `hearts-academy-lockup.png` | full image, resize to 320px wide | auth pages, rendered at ~140px |

Both are produced with **`sharp`**, which is already in the dependency tree at 0.34.5 (Next brings
it). The exact invocation is recorded in the implementation plan so the derivation is reproducible;
the throwaway script is not committed. **`/c/WINDOWS/system32/convert` is Windows' filesystem tool,
not ImageMagick — it must not be used.**

The source PNG is 302 KB; both derived assets must be materially smaller, and the plan states a size
ceiling so "downscaled" is verifiable rather than asserted.

**Delivery is by Next static import, never `public/`.** `apps/web/public/` does not exist, and the
Dockerfile at the **repository root** (`Dockerfile:231-232`) carries an explicit note that a `COPY` of
it would fail the build, inviting one to be added only if that directory is ever created. `.next/static`
is copied separately at `Dockerfile:230`, because static assets are deliberately not traced into
`.next/standalone`. A static import is emitted into `.next/static` and therefore reaches the production
image with no Dockerfile change at all.

Type support is already present: `apps/web/next-env.d.ts` references Next's image type declarations, so
a `.png` import typechecks without new configuration.

Rendered with `next/image` and explicit `width`/`height`, inside a card using `--brand-card`, with
`alt` text — `alt="Bistec Hearts Academy"` on the auth pages where the logo *is* the heading, and
`alt=""` in the topbar where the adjacent text already names the product.

## 3. The icon set

`apps/web/components/ui/icons.tsx` — one exported component per destination, each a 16×16 `<svg>` with
`stroke="currentColor"`, `fill="none"`, `strokeWidth={1.5}`, and `aria-hidden="true"`.

`.nav-item` in `globals.css` gains `display: flex; align-items: center; gap: 8px`. Two consequences
the implementation must handle:

- The sidebar's review-count badge is currently separated from the label by a literal `" "` text node.
  With `gap`, that space is redundant; it is removed rather than left as a no-op.
- The label-only `<span aria-disabled="true">` rendering branch — deliberately kept so a future
  destination can exist before its page does — needs an icon too, or the first entry to use it will
  render misaligned against every other row.

Sidebar destinations gain an `icon` field. `Destination` is a union of `LinkedDestination` and
`LabelOnlyDestination`; the field goes on the shared shape so both branches carry one.

## 4. Sign out in the sidebar

The `mt-auto border-t pt-1` group gains Sign out below Settings. Settings keeps `className="nav-item
block"` — 7A added `block` because the group's children are not flex items and the link would
otherwise stay inline, and that remains true.

The sign-out control is styled as a nav row, not a `Button`, so the bottom group reads as two peers.
It remains a `<form>` with a submit control, so it is still a real action rather than a link.

`sidebar.test.tsx` asserts the Settings link's `parentElement` carries `mt-auto` and `border-t`; adding
a sibling inside that same div does not disturb it, and the test must continue to pass unchanged.

## 5. Documentation to update

- `docs/adr/0023-*.md` — new, superseding ADR-0022's scope (D1)
- `docs/interview-and-prd.md` §5 — **O-15**, the frame and brand changes mapping to no FR
- `docs/design-system.md` §3 — `--brand-card` and its theme-invariance rationale (D3)
- `docs/design-system.md` §3.3 — corrected `ORDER MATTERS` wording (D6)
- `docs/design-system.md` §6 — the frame mock: icons, Sign out's new home, the topbar mark
- `apps/web/app/globals.css` — corrected comment (D6)
- `apps/web/e2e/README.md` — the extended dark walk
- `ONBOARDING.md`, `docs/walkthrough.md`, `handoff.md` — the demo flow, and a dated entry

## 6. Testing

| What | Where | Notes |
|---|---|---|
| Each destination renders its icon | `test/sidebar.test.tsx` | icons are `aria-hidden`, so query by role/label must still resolve to the text label alone |
| The accessible name is unchanged by icons | `test/sidebar.test.tsx` | `getByRole("link", { name: "Roster" })` must still match exactly — this is the assertion that proves the icons are decorative |
| Sign out renders in the bottom group, below Settings | `test/sidebar.test.tsx` | asserted by DOM order within the `mt-auto` wrapper |
| The sidebar never imports `@/auth` | `test/sidebar.test.tsx` or a source assertion | the slot prop is the whole point of D5; a regression here would be a build error in production only |
| The label-only branch renders an icon | `test/sidebar.test.tsx` | needs a fixture destination, since no real one uses that branch |
| Students renders `Create batch`; Settings does not | `test/students-page.test.tsx`, `test/settings-page.test.tsx` | the mirror of 7A's Task 7, in reverse — coverage moves, it is not deleted |
| The `listBatches` error path on Settings | `test/settings-page.test.tsx` | a gap 7A logged and deferred; this slice edits that page, so it closes it |
| `--brand-card` is white in dark | `test/theme-tokens.test.ts` or the dark e2e spec | the token's entire purpose is not flipping, so something must assert it does not |
| The dark walk covers all eleven views | `e2e/dark-theme.spec.ts` | read-only; `chromium-dark` stays scoped; `workers: 1` stays 1 |

**Every new gate is proven red before it is trusted.** 7A's parity test, its sidebar-pinning assertion
and its computed-style assertion were each demonstrated failing under the exact mutation they target,
and the same standard applies here — in particular to the `--brand-card` assertion, which would
otherwise pass trivially.

## 7. Risks

- **The icon change touches `.nav-item`, which every sidebar row shares.** `test/app-frame.test.tsx`
  already holds eight sidebar cases including active-fill behaviour, and `test/sidebar.test.tsx` holds
  more. Sidebar coverage is split across two files with different `usePathname` mocking; the plan must
  run both and should cross-reference them.
- **Any task moving a UI surface between routes must run the Playwright suite.** 7A's Task 7 moved
  registration and broke `mentor-flows.spec.ts`, and its unit-only verification could not see it. This
  slice moves `Create batch`, so the same hazard applies — and `mentor-flows` registers a user, so it
  is the spec most likely to care.
- **`next/image` with a static import is new to this repo.** No image is currently rendered anywhere.
  The plan must verify a production build actually emits the asset and that the page renders it, not
  merely that typecheck passes — 7A established that `tsc` alone is never sufficient for `apps/web`.
- **A wrong `alt` is an accessibility regression that no test catches by default.** The auth pages'
  logo replaces a heading, so it must be named; the topbar's must not be, or every screen reader user
  hears the product name twice.

## 8. Open items carried

- **Unverified, from 7A's review:** on a back/forward navigation the theme control's radio may read
  `Follow system` while the page is correctly dark, because the action deliberately omits
  `revalidatePath` and the control seeds state from its server prop. The theme is never wrong and it
  self-heals on reload. This slice should confirm it during its own visual pass and then either fix it
  by seeding from the live DOM or document it — **not** with `revalidatePath`, which would contradict
  ADR-0021's instant-repaint reasoning.
- **Pre-existing, out of scope:** `e2e/student-flows.spec.ts:38` skips whenever today already carries a
  submission, so FR-12's absence round trip has no e2e coverage for roughly the last seven hours of
  every Colombo day. Recorded in `handoff.md`; fixing it means changing the seed contract.

## 9. Non-goals

- No icon library dependency.
- No change to `students/forms.tsx`.
- No new route, no API change, no `spec/openapi.yaml` change, no Prisma migration.
- No mobile or responsive treatment — desktop only, min 1280px.
- No change to the dev-bypass guards, and no new process-level entry point.
- No re-theming. `--brand-card` is an addition, not a revision of the audited pairs.
- No change to `workers: 1`, to `retries: 0`, or to the `chromium-dark` scoping.
