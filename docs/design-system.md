# Design System — IRP Progress Management

**Status:** direction approved pending sign-off · no code written yet
**Register:** product (design serves the task) — not marketing
**Applies to:** `apps/web` only
**Related:** `CLAUDE.md` · `docs/interview-and-prd.md` (FR-28, FR-29, FR-30, NFR-13)

---

## 1. The thesis

**This system is a register.**

Not a dashboard, not an analytics product. The Academy's real artifact is a roll book: a
row per student, a mark per working day, a page per month. Every hard rule in the domain is
a register rule — weekdays only, one mark per day, a grace window for a late mark, a
distinction between *absent with reason* and *missed*, a page that closes on the 9th.

The interface makes that artifact legible rather than replacing it with generic SaaS
furniture. Where a decision is open, the register answer wins.

**Direction:** warm academic, delivered through colour temperature, surface hierarchy,
spacing rhythm and motion — carried on a geometric sans with monospaced figures.

**Scene sentence** (the basis for light-default): *a mentor in a Colombo office at 9:40am,
bright tropical daylight through the window, checking who has submitted before standing up
for the daily check-in.*

---

## 2. What this deliberately is not

Recorded so these don't get reintroduced later as "improvements."

| Rejected | Why |
|---|---|
| Cream / parchment / `#F4F1EA` body background | The single most saturated AI-design default. "Warm academic" is delivered by accent, surface tint and type — **not** by tinting the canvas beige. Stripe is warm on a pure-white canvas; so is this. |
| Crimson as the brand primary | The palette seed suggested it. Rejected: red already means **missed** here. Colliding the brand colour with the most alarming status in a status-legibility system is a usability fault, not a style choice. The seed's hue survives — reserved exclusively for `missed`. |
| A row of three identical stat cards | The hero-metric template. FR-28's three figures are carried by the cycle ribbon (§7) instead, which shows the same numbers plus the shape of the whole cycle. |
| Red for `absent` | Absence is recorded with a reason and carries **no** score penalty (`// ASSUMPTION: O-7`). Colouring it as a fault would contradict the policy the system implements. `absent` is neutral slate. |
| A sixth status colour for `extra` | Tried and measured. A teal at hue 200 lands within **1.01:1 luminance** of the `ok` green at hue 155 — indistinguishable for a colour-vision-deficient user with the two marks adjacent in a dense ribbon. No lightness in the usable range separated them adequately, because both are mid-luminance hues. Extra is also not a compliance *outcome*, so it does not belong in the compliance ramp. **Distinguished by form instead** — see §3.2. |
| Charts in v1 | Deferred. Numbers, status and the ribbon carry the dashboard. Revisit once real data exists. |
| Border-radius above 16px, gradient text, glassmorphism, side-stripe borders, decorative grid backgrounds | House bans. |

---

## 3. Colour

OKLCH throughout. Strategy: **restrained** — tinted neutrals plus one accent, accent ≤10% of surface.

Every pair below was verified with a WCAG contrast script against the sRGB conversion.
**35 pairs across both themes pass; every token is in gamut.**

### 3.1 Light (default)

| Token | OKLCH | Hex | Role |
|---|---|---|---|
| `--bg` | `oklch(1 0 0)` | `#ffffff` | Content canvas. Pure white, chroma 0 — no hidden warmth. |
| `--surface` | `oklch(0.976 0.006 272)` | `#f6f7fb` | Panels, sidebar, table header. Second neutral layer. |
| `--surface-sunk` | `oklch(0.988 0.004 272)` | `#fafbfe` | The dense roster zone. |
| `--line` | `oklch(0.912 0.010 272)` | `#dfe2e9` | Decorative hairlines, table dividers. No contrast requirement. |
| `--line-strong` | `oklch(0.64 0.015 272)` | `#898c96` | **Control borders** — inputs, selects, checkboxes. Meets 1.4.11 at 3.37:1. |
| `--ink` | `oklch(0.24 0.022 272)` | `#1b1f2a` | Primary text — 16.48:1 |
| `--ink-muted` | `oklch(0.50 0.018 272)` | `#5f636e` | Labels, secondary text, placeholders — 6.01:1 |
| `--primary` | `oklch(0.45 0.14 272)` | `#3c4ba2` | **Bistec slot.** Indigo ink. Primary actions, selection, focus — 7.71:1 |
| `--primary-weak` | `oklch(0.95 0.022 272)` | `#e9eefe` | Selected rows, active nav, primary-tinted fills. |

### 3.2 Status vocabulary

Load-bearing. These are the system's core semantic language.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--st-ok` | `#267b4c` · 5.22:1 | `#65c98c` · 9.24:1 | Submitted on time |
| `--st-late` | `#9f5c0c` · 5.24:1 | `#eeac53` · 9.54:1 | Submitted in the grace window. Burnt ochre — accepted, flagged, not punished. |
| `--st-absent` | `#6d717e` · 4.86:1 | `#9a9eaa` · 7.03:1 | Explicitly marked absent with a reason. **Neutral by design.** |
| `--st-missed` | `#be2132` · 6.09:1 | `#ed7473` · 6.58:1 | No entry, no absence, grace window closed. Final. The only true red. |
| `--st-review` | `--primary` | `--primary` | In Review |
| `--st-evaluated` | `--ink` + lock glyph | `--ink` + lock glyph | Evaluated — terminal, locked |

There is no `rejected` token. There is no rejected state.

### Extra — distinguished by form, not colour

Weekend work (FR-33) is **not** a compliance state and gets **no status colour**. It is drawn
differently instead:

- **In the ribbon** — a half-width slot in `--ink-muted` carrying a `+` glyph, inserted
  between the Friday and Monday it sits between. Narrower than a required day, so the
  weekday rhythm still reads at a glance.
- **In the roster** — a count, not a pill: `+2 extra`. A student can have several extra days
  in a cycle, which a single status pill cannot express.

This is deliberate on three grounds. Extra is a different *kind* of thing from
submitted/late/absent/missed, so putting it in the same ramp would misrepresent it. Form
survives colour-vision deficiency where a fifth hue does not. And the compliance palette is
already carrying four semantic colours — a fifth degrades all of them.

### 3.3 Dark

Light is the default; dark is supported. Canvas is chroma-0 near-black — surfaces lift
toward indigo, they do not warm.

| Token | OKLCH | Hex |
|---|---|---|
| `--bg` | `oklch(0.18 0 0)` | `#121212` |
| `--surface` | `oklch(0.235 0.010 272)` | `#1c1e23` |
| `--surface-sunk` | `oklch(0.205 0.008 272)` | `#16171b` |
| `--line` | `oklch(0.32 0.012 272)` | `#313339` |
| `--line-strong` | `oklch(0.52 0.018 272)` | `#656974` |
| `--ink` | `oklch(0.965 0.004 272)` | `#f2f3f6` |
| `--ink-muted` | `oklch(0.74 0.014 272)` | `#a7aab4` |
| `--primary` | `oklch(0.72 0.12 272)` | `#8a9ff0` |
| `--primary-weak` | `oklch(0.30 0.045 272)` | `#262c45` |

Status colours are **re-tuned, not reused** — see §3.2.

### 3.4 The Bistec slot

`--primary` is a placeholder pending the actual brand value. To swap: replace the single
`--primary` token, re-derive `--primary-weak` at roughly `L 0.95 / C 0.022` on the same hue,
and re-run the contrast check. Nothing else in the system references a brand colour directly.

**Constraint on any replacement:** the hue must stay clear of 20–70° (red/amber — reserved
for `missed`/`late`) and 140–170° (green — reserved for `ok`).

---

## 4. Typography

Geometric sans for text, monospace for every figure. Pairing works on a genuine contrast
axis (geometric vs. mono), not two similar sans.

| Role | Face | Notes |
|---|---|---|
| UI, headings, body, labels | **Plus Jakarta Sans** (variable, OFL) | Geometric skeleton with warm details — open apertures, soft terminals. Economical enough for a dense roster. Not Inter (the reflex), not Poppins (too wide for tables). |
| All figures and data | **IBM Plex Mono** (OFL) | Scores, streaks, `N of M`, dates, times, day marks, IDs. Academic-technical warmth. |

**Rules**

- Fixed rem scale, not fluid. No `clamp()` on headings — product UI is viewed at consistent DPI.
- Scale ratio ~1.2: `12 / 13 / 14 / 16 / 20 / 24 / 32`.
- Base UI 14px · roster table 13px · prose (AI summaries, entry text) 16px.
- Prose caps at 70ch. Tables may run to full width.
- `font-variant-numeric: tabular-nums` everywhere a figure appears, mono or not.
- Display letter-spacing floor `-0.03em`. Never tighter.
- `text-wrap: balance` on headings; `text-wrap: pretty` on summary prose.
- No display face in labels, buttons or data.

---

## 5. Space, radius, elevation

- **Grid:** 4px base. Scale `4 / 8 / 12 / 16 / 24 / 32 / 48`.
- **Rhythm is the density signal.** The warm zone uses 24–32px padding. The roster uses
  8–12px row padding. That contrast *is* the "warm shell, dense core" decision.
- **Radius:** cards and panels **12px**. Inputs and buttons 8px. Status pills and tags full. Nothing above 16px.
- **Elevation:** borders over shadows. Never `1px solid` and a ≥16px blur shadow on the same
  element. Overlays (dropdown, dialog, toast) may use a single defined shadow at ≤8px blur.
- **Z-index scale:** `dropdown 10 → sticky 20 → modal-backdrop 30 → modal 40 → toast 50 → tooltip 60`. No arbitrary values.

---

## 6. Layout frame

Desktop only, minimum 1280px (NFR-13). No mobile layout is provided or tested. Responsive
behaviour is structural (sidebar collapse below 1440px), never fluid typography.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ◆ Hearts Academy · IRP      Batch 12 ▾              Damian ▾        │  56px  --surface
├───────────┬──────────────────────────────────────────────────────────┤
│           │                                                          │
│  Today    │                                                          │
│  Roster   │                  content · --bg                          │
│  Review 3 │                                                          │
│  Cycles   │                                                          │
│  Students │                                                          │
│           │                                                          │
│ 216px     │                                                          │
│ --surface │                                                          │
└───────────┴──────────────────────────────────────────────────────────┘
```

---

## 7. The signature: the cycle ribbon

**The one element this system is remembered by.** It replaces the stat-card row and answers
FR-28 in a single component.

A horizontal strip of every **required day** in the current cycle — one bar per weekday,
filled by that day's batch compliance. Today is marked. Future days are outlines.

**An empty weekend is not rendered at all.** A weekend *with* extra work (FR-33) appears as a
half-width `+` slot between the Friday and Monday it falls between. So the ribbon is
five-a-week by default and grows only where someone actually worked.

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│  Cycle 2 · 10 Jul – 9 Aug                    Day 12 of 22 · Colombo    │
│                                                                        │
│  10  11 ⁺ 14  15  16  17  18  21  22  23  24  25  28  29  30  31  01   │
│  ▓   ▓  ┊ ▓   ▓   ▒   ▓   ▓   ▓   ░   ▓   ▓   ▓   ▓   ▉   ·   ·   ·    │
│         ↑                                        today                 │
│      extra                                                             │
│                                                                        │
│  8 of 10 submitted today          2 late · 1 absent · 0 missed         │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
   ↑ --surface, radius 12px, padding 24–32px — the warm zone
```

Note the dates: `10 11 ⁺ 14` — the 12th and 13th were a weekend. Someone worked one of them,
so a narrow slot appears; had nobody worked, the ribbon would run `10 11 14` with no gap. The
required-day rhythm stays legible either way, and the weekday rule remains visible in the
interface rather than only enforced in the backend.

**Extra days never enter the compliance figures.** The "8 of 10 submitted today" line and the
late/absent/missed counts are computed over required days only (FR-12).

**Why this over stat cards**

- It is the subject's own artifact — a register page.
- It shows the *shape* of the cycle, not a single day's snapshot. A mentor sees Tuesday's dip.
- It satisfies FR-28 as one element instead of a card grid.
- It serves both audiences from one component: the mentor sees batch compliance per day,
  the student sees their own marks.

**Day mark states:** full (all submitted) · partial (proportional fill) · ochre notch (late)
· slate (absent) · red (missed) · outline (not yet reached) · ringed (today).

**The key (Plan 7 follow-up, ADR-0020).** These eight states — the seven above plus §3.2's Extra
slot — are named on screen by `RibbonKey`, a `<details>` disclosure collapsed by default and
rendered **once** below all batch sections on the **mentor** dashboard. Collapsed because §8.1's
above-the-fold budget belongs to the figures; once because the dashboard renders a ribbon per
batch; mentor-only because a student's ribbon shows their own status and the aggregation copy
below would be false there. Its swatches import `MARK_COLOR` from `cycle-ribbon.tsx` rather than
re-declaring the tokens — see `counts-row.tsx` for what re-declaring them costs. Swatch track is
20px: at 16px a 55% `partial` fill did not read as different from a full `ok` bar and the `today`
ring had no clearance, so the key was unreadable while its tests were green.

**Batch aggregation (Plan 7).** A batch day holds a mix of outcomes and the ribbon draws one
mark, so precedence is fixed: **missed → late → absent → partial → ok**, with an outline for a
day nobody has reached. The failure outranks the warning, the warning outranks the excused
absence, and `partial` sits below all three because pending work is an unfinished afternoon,
not a problem. Only `partial` is filled proportionally (`submitted / enrolled`). Implemented
once, in `apps/web/lib/ribbon.ts`; a page that re-derives a mark is a bug.

---

## 8. Screens

### 8.1 Mentor dashboard — FR-28, must-ship (SC-4)

```
┌────────────────────────────────────────────────────────────────────────┐
│  [ cycle ribbon — the warm zone, §7 ]                                  │
├────────────────────────────────────────────────────────────────────────┤
│  Roster                                     Search  [        ]  Filter │
│  ──────────────────────────────────────────────────────────────────────│
│  Student           Today          Streak   Compliance   Index          │
│  A. Perera         ● Submitted        12       96%       84.2          │
│  N. Silva          ◐ In review         9       91%       78.5          │
│  R. Fernando       ✕ Missed            0       74%       71.0          │
│  S. Jayasuriya     ▲ Late              6       88%       80.1          │
│  K. Bandara        ○ Absent            4       85%       76.8          │
│                                                        ↓ scrolls       │
└────────────────────────────────────────────────────────────────────────┘
```

FR-28's required figures live entirely in the warm zone above the fold at 1280px. The roster
scrolls — permitted, since FR-28 names the summary and counts, not the full roster.

Every status carries **a glyph and a word**, never colour alone.

### 8.2 Student home — FR-29, FR-30

Same ribbon, personal marks. The submission box is the primary action and sits immediately
below it. No score, no rank, no other students, anywhere on this surface.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Month 2 of 6 · Cycle 2 · 10 Jul – 9 Aug                               │
│  ▓ ▓ ▓ ▓ ▒ ▓ ▓ ▓ ░ ▓ ▓ ▓ ▓ ▉ · · ·                                     │
├────────────────────────────────────────────────────────────────────────┤
│  Today · Tuesday 29 July                                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ What did you work on today?                                      │  │
│  │                                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  [ Submit today's update ]        Mark today as absent                 │
├────────────────────────────────────────────────────────────────────────┤
│  Strengths and areas to develop                                        │
│  ...current cycle summary, prose, no score...                          │
└────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Review — FR-18 to FR-20

Daily report as the reviewable unit, entries rolled up. `Submitted → In Review → Evaluated`,
one direction. Evaluated is terminal and visibly locked. No reject control exists anywhere in
the UI.

---

## 9. Components

shadcn/ui on Tailwind, **retuned to these tokens** — shadcn's defaults are the quiet-operator
look this project did not choose. Retuning means radius, spacing scale, type and colour, not
just a primary swap.

Every interactive component ships all seven states: default, hover, focus, active, disabled,
loading, error. Half a component is not a component.

- Skeletons for loading, never a centred spinner.
- Empty states teach the interface. "No entries yet" is a failure; see §11.
- One button vocabulary across every screen.
- Modals are a last resort — exhaust inline and progressive alternatives first.
- No custom scrollbars, no reinvented form controls.

---

## 10. Motion

Restrained, with a few deliberate moments. 150–250ms, ease-out-quart. No bounce, no elastic.

| Moment | Behaviour |
|---|---|
| Ribbon load | Marks fill left→right, staggered, **≤250ms total**. It's a list stagger, not a page-load sequence — the register drawing its own marks. |
| Submission lands | The student's day mark fills. The action visibly enters the register. This is the one delight moment in the system. |
| Review state change | 180ms crossfade on the status pill. |
| Everything else | 150ms, state only. |

`prefers-reduced-motion: reduce` → all of the above become instant or a plain crossfade.
Content is never gated behind a reveal transition: default state is visible, motion enhances it.

---

## 11. Copy

Plain verbs, sentence case, active voice. An action keeps its name through the whole flow —
"Submit today's update" produces "Submitted."

| Situation | Write | Not |
|---|---|---|
| Dashboard count | "8 of 10 submitted today" | "Submission rate: 80%" |
| Student, nothing yet | "No entry for today yet. You can still submit for Monday until 5:00 pm tomorrow." | "Nothing here" |
| Late | "Submitted late — Monday's entry, filed Tuesday." | "⚠ LATE" |
| Absent | "Marked absent — medical." | "Absent (unexcused?)" |
| Missed | "Missed — the grace window closed on 22 July." | "Failed to submit" |
| Wrong-date attempt | "You can submit for today or the previous working day. Older dates are closed." | "Invalid date" |
| Evaluated | "Evaluated on 9 August. This cycle is closed." | "Locked 🔒" |

Errors don't apologise and are never vague about what happened. Empty states are invitations.

---

## 12. Accessibility floor

Non-negotiable, verified rather than assumed.

- **Status is never colour alone.** Glyph plus text label, always. Load-bearing in a system whose whole job is status.
- Body text ≥4.5:1, non-text UI boundaries ≥3:1. Verified above for both themes.
- Placeholder text meets 4.5:1 — it uses `--ink-muted`, not a lighter grey.
- Visible keyboard focus: 2px `--primary` ring at 2px offset. Never `outline: none` without a replacement.
- Full keyboard path through submit and review — the two flows that matter.
- Roster table uses real `<table>` semantics with scope'd headers.
- `prefers-reduced-motion` honoured throughout.
- Timestamps render in Asia/Colombo with the zone named in the UI, never bare local time.

---

## 13. Open items

| # | Item | Effect |
|---|---|---|
| — | **Bistec brand colour** | `--primary` is a placeholder. One-token swap; see §3.4 for hue constraints. |
| — | **§6's topbar batch switcher is not built** | `Batch 12 ▾` in the §6 frame has no data behind it: `User` in `spec/openapi.yaml` carries no batch, and a mentor holds several, so one name in a global slot would be wrong for the primary audience. Batch selection is per-page instead, via the Roster and Cycles chips. Revisit only if a global batch context is ever genuinely needed; it would need a spec change first. |
| O-6 | Rubric criteria wording | Blocks the evaluation surface layout — five criteria need real labels before that screen is designed. |
| O-7 | Absence/lateness penalty | `--st-absent` is neutral on the stated assumption. If leadership rules that absence penalises the score, this token and its copy change. |
| O-5 | AI provider | Blocks every evaluation-output surface. Nothing here depends on it yet. |

---

## 14. Governing ADRs

Each names at least three rejected alternatives:

| ADR | Decision |
|---|---|
| [0001](adr/0001-tailwind-and-shadcn-for-web-ui.md) | Tailwind CSS + shadcn/ui, retuned token-first |
| [0002](adr/0002-light-default-with-dark-support.md) | Light default, dark supported, both contrast-verified |
| [0003](adr/0003-cycle-ribbon-as-fr-28-summary.md) | Cycle ribbon as the FR-28 summary surface |
| [0020](adr/0020-collapsed-ribbon-key-on-the-mentor-dashboard.md) | A collapsed, mentor-only key for the cycle ribbon (§7) |

Changing anything in §3–§7 means amending the ADR that governs it, not just this file.
