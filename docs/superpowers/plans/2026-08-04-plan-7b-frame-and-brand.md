# Plan 7B — The App Frame and the Brand Mark

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the app frame — a brand mark in the topbar and on both auth pages, an icon on every sidebar destination, Sign out moved into the sidebar, and `Create batch` returned to the Students page — plus two corrections carried over from Plan 7A's whole-branch review.

**Architecture:** The logo ships as two `sharp`-derived PNGs imported statically by Next (never `public/`, which would fail the Docker build) and sits on a new **theme-invariant** `--brand-card` token — white in dark by never being overridden. Icons are hand-drawn 16px SVGs using `currentColor`, so they inherit `.nav-item`'s hover and active colours with no new tokens. Sign out stays a server-rendered form: the Server Component layout builds it and passes it into the client sidebar as a `ReactNode` prop, so the client never imports `@/auth`.

**Tech Stack:** Next.js 16 App Router (Server Components, Server Actions, `next/image` static imports), Tailwind CSS 4 with CSS custom properties, `sharp` 0.34.5 (already in the tree), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-04-frame-and-brand-design.md` — all sections.

**Branch:** `feat/plan-7b-frame-and-brand` — already created; the spec commits `1fbae35` and `3be2e8d` are its first two. One branch, one PR, merged before the next plan starts.

**FRs:** `Create batch`'s relocation serves **FR-3**. **The other five items map to no FR** and are logged as **O-15**. See Task 1.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **No `apps/api` change, no `spec/openapi.yaml` change, no Prisma migration, no new route.**
- **No hand-written `fetch` in `apps/web`.** Import from `@irp/client` only. Server Actions are not `fetch` and are the established pattern.
- **`pnpm typecheck` is not sufficient for `apps/web`.** `AUTH_DEV_BYPASS=false pnpm --filter @irp/web build` is part of the required verification set for **every** task touching `apps/web`. Plain `tsc` does not run Next's own checks.
- **`pnpm --filter @irp/web build` needs `AUTH_DEV_BYPASS=false`** explicitly. `.env.local` sets it true, `next build` forces `NODE_ENV=production`, and `assertBypassNotInProduction` then correctly refuses. That is guard one working — never weaken it.
- **Any task that moves a UI surface between routes MUST run the Playwright suite.** Plan 7A's Task 7 moved registration off `/students` and broke `e2e/mentor-flows.spec.ts`; its unit-only verification set could not see it and the break surfaced two tasks later. `Create batch` moves in Task 7 of this plan.
- **Never weaken the dev-bypass guards.** Nothing here touches `auth.config.ts`, `proxy.ts`, `instrumentation.ts`, or `app/api/dev-jwks/route.ts`. Task 6 modifies `app/(app)/layout.tsx`, which is **not** one of the four guard entry points and must not become one.
- **Do not substitute token values.** design-system §3 states 35 pairs pass WCAG AA. Copy hex values verbatim; never retype from memory.
- **Every colour resolves through a token.** No literal hex and no Tailwind colour utility (`bg-white`, `text-slate-500`, …) in `apps/web`. Note 7A's grep only catches hex literals, so `bg-white` would slip past it — it is still forbidden.
- **Status is never colour alone** (design-system §12). Icons added here are decorative and `aria-hidden`; the text label remains the accessible name.
- **Desktop only, min 1280px** (NFR-13). No responsive or mobile treatment.
- **Playwright: `workers: 1` and `retries: 0` stay pinned, and `chromium-dark` stays scoped by `testMatch` to `dark-theme.spec.ts` alone.** Never widen it to the mutating specs.
- **Prove every new gate red before trusting it.** A gate never seen to fail is not a gate.
- **Conventional commits**, one per task. Any decision with a plausible rejected alternative gets an ADR naming **at least two** rejected alternatives.
- **`/c/WINDOWS/system32/convert` is Windows' filesystem tool, not ImageMagick.** Never invoke `convert` for image work.

### Environment

```bash
# Postgres — Docker Desktop is a per-user install and must be started manually
$env:IRP_DB_PORT = "5433"
docker compose -f apps/api/docker-compose.yml up -d
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"

# All five generated trees. Run these on a RETURNING clone too — they are
# git-ignored and survive a pull stale with nothing to invalidate them.
pnpm install
pnpm generate
pnpm --filter @irp/core build
pnpm --filter @irp/client build
pnpm --filter @irp/api exec prisma generate
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build

pnpm --filter @irp/api run db:seed        # API suites TRUNCATE, so re-seed after them
```

Playwright manages both dev servers itself via its `webServer` array, so the e2e suite needs no
hand-started terminals — only Postgres, seeded. **Killing a dev-server shell does not kill the server:**
orphaned node processes keep holding 3000/3001 and Playwright silently reuses them
(`reuseExistingServer` outside CI). Kill the PIDs.

### File structure

| File | Responsibility | Task |
|---|---|---|
| `docs/adr/0023-create-batch-returns-to-students.md` | Create — supersedes ADR-0022's scope | 1 |
| `docs/interview-and-prd.md` | Modify — add O-15 | 1 |
| `apps/web/app/globals.css` | Modify — `--brand-card` (T2), `.nav-item` flex (T5), corrected comment (T8) | 2, 5, 8 |
| `apps/web/test/theme-tokens.test.ts` | Modify — assert `--brand-card` does not flip | 2 |
| `docs/design-system.md` | Modify — §3 token (T2), §3.3 wording (T8), §6 frame mock (T9) | 2, 8, 9 |
| `apps/web/assets/hearts-academy-mark.png` | Create — 64px square, derived | 3 |
| `apps/web/assets/hearts-academy-lockup.png` | Create — 320px wide, derived | 3 |
| `apps/web/components/app-frame/brand-mark.tsx` | Create — the card + image, one component, two sizes | 3 |
| `apps/web/components/app-frame/topbar.tsx` | Modify — mark replaces the diamond | 3 |
| `apps/web/test/brand-mark.test.tsx` | Create — card token, alt behaviour, dimensions | 3 |
| `apps/web/app/(auth)/signin/page.tsx` | Modify — lockup becomes the `<h1>`'s content | 4 |
| `apps/web/app/(auth)/not-registered/page.tsx` | Modify — lockup added above the heading | 4 |
| `apps/web/test/signin.test.tsx` | Modify — heading is the named logo, diamond gone | 4 |
| `apps/web/components/ui/icons.tsx` | Create — seven 16px `currentColor` icons | 5 |
| `apps/web/components/app-frame/sidebar.tsx` | Modify — icons (T5), Sign out slot (T6) | 5, 6 |
| `apps/web/test/sidebar.test.tsx` | Modify — icons decorative, Sign out placement | 5, 6 |
| `apps/web/app/(app)/layout.tsx` | Modify — builds the sign-out form, passes it down | 6 |
| `apps/web/app/(app)/students/page.tsx` | Modify — `Create batch` returns | 7 |
| `apps/web/app/(app)/settings/page.tsx` | Modify — `Create batch` leaves | 7 |
| `apps/web/test/students-page.test.tsx` | Modify — regains `Create batch` coverage | 7 |
| `apps/web/test/settings-page.test.tsx` | Modify — loses it; gains the `listBatches` error path | 7 |
| `apps/web/e2e/dark-theme.spec.ts` | Modify — extend to all eleven views | 8 |
| `apps/web/e2e/README.md` | Modify — the extended walk | 8 |
| `ONBOARDING.md`, `docs/walkthrough.md`, `handoff.md` | Modify — demo flow, walkthrough, dated entry | 9 |

---

### Task 1: ADR-0023 and O-15

Documentation only; produces no behaviour. `CLAUDE.md` requires the ADR **before** the code it governs.

**Files:**
- Create: `docs/adr/0023-create-batch-returns-to-students.md`
- Modify: `docs/interview-and-prd.md` — §5's open-points table

**Interfaces:**
- Consumes: nothing.
- Produces: ADR number `0023` and open point `O-15`, referenced by later tasks' comments and commit messages.

- [ ] **Step 1: Confirm 0023 is free and O-15 is next**

```bash
ls docs/adr/ | tail -3
grep -o 'O-1[0-9]' docs/interview-and-prd.md | sort -u | tail -3
```

Expected: the highest ADR is `0022-settings-as-the-registration-home.md`; open points run to `O-14`. If either differs, use the next free numbers and update every reference in this plan.

- [ ] **Step 2: Write ADR-0023**

Create `docs/adr/0023-create-batch-returns-to-students.md`, following `docs/adr/0022-...md`'s shape (Status / Date / Deciders / Requirements / Relates to, then Context, Decision, Rejected alternatives, Consequences). Full prose that argues, not bullet fragments. British English.

Content requirements — the ADR must state:

- **Context:** ADR-0022 moved `Register` and `Create batch` from Students to Settings and explicitly rejected "move all four panels" because it would leave Students with no actions at all. In the running application, Students' `grid-cols-2` now leaves the left column visibly empty below `Transfer`, because the `People` directory is several times taller.
- **Decision:** `Create batch` returns to Students as a third panel in the left column, beneath `Transfer`. `Register` stays in Settings. **This supersedes ADR-0022's scope, and ADR-0022 is not edited** — its reasoning stays on record.
- **Why ADR-0022's rejection does not block this:** 0022 rejected moving *all four* panels, on the grounds Students would be left actionless. It did not consider Register-out-Create-batch-back, which leaves Students with two actions. That configuration was never weighed, so this is a new decision rather than a reversal of a considered one.
- **Rejected 1 — leave `Create batch` in Settings and accept the gap.** Zero work. Rejected: the empty half-column is the most visible thing on the page, and a mentor reads it as a rendering fault.
- **Rejected 2 — make Students a single-column layout.** Fixes the gap without moving anything. Rejected: it wastes the width NFR-13's 1280px floor guarantees, and `People` is a long list that benefits from sitting beside something rather than under it.
- **Rejected 3 — move `Register` back as well, reverting ADR-0022 entirely.** Fills the column and restores the old page. Rejected: it reinstates the exact mismatch 0022 existed to fix — a page titled "Students" being the surface on which mentors are created, since `RegisterForm`'s role select offers both roles.
- **Consequences:** a batch is not a person, so "create a batch" no longer sits under a heading about registering people — an incidental improvement. Settings keeps one section for mentors (`Register`), so its per-section role gating stays necessary and is not simplified away.

- [ ] **Step 3: Add O-15 to the open-points table**

Modify `docs/interview-and-prd.md` §5. Match the existing row shape (`| O-n | Question | Current assumption | Status |`) used by O-10 through O-14.

The row must say: **the frame and brand changes map to no FR** — the sidebar icons, the logo, and Sign out's relocation. `CLAUDE.md` states a change mapping to no FR does not belong in the repo. The assumption taken is that they are wanted, because the mentor requested them directly after reviewing the running application — the same footing as O-14. Status: mentor sign-off outstanding, non-blocking. Note that `Create batch`'s relocation is **excluded** from O-15 because it serves FR-3 and is covered by ADR-0023 instead.

- [ ] **Step 4: Verify the docs are internally consistent**

```bash
grep -n "O-15" docs/interview-and-prd.md docs/superpowers/specs/2026-08-04-frame-and-brand-design.md
grep -rn "0023" docs/adr/ | grep -v Binary
grep -n "0022" docs/adr/0023-create-batch-returns-to-students.md
```

Expected: O-15 appears in both the PRD and the spec; ADR-0023 exists and names ADR-0022. No code runs here.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0023-create-batch-returns-to-students.md docs/interview-and-prd.md
git commit -m "docs(adr): return Create batch to Students (0023), and log the frame changes as O-15"
```

---

### Task 2: The `--brand-card` token

The design system's first deliberately theme-invariant colour. Tasks 3 and 4 render on it.

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `docs/design-system.md` §3
- Test: `apps/web/test/theme-tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the CSS custom property `--brand-card`, consumed as `var(--brand-card)` by `brand-mark.tsx` in Task 3.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/test/theme-tokens.test.ts`:

```ts
/**
 * --brand-card is the ONLY token that is deliberately the same in light and
 * dark. The logo's wordmark is near-black green on a light field, so the card
 * behind it must not follow the theme — if it did, the wordmark would sit on
 * #1c1e23 and disappear.
 *
 * It achieves that by being declared once in the base :root and NEVER
 * overridden, which is also why it must stay OUTSIDE the dark-tokens markers:
 * inside them it would break the 13-declaration count and the byte-identity
 * check. This test is what stops someone "fixing the inconsistency" by adding
 * a dark value.
 */
describe("--brand-card is theme-invariant", () => {
  const css = readFileSync(
    path.join(import.meta.dirname, "..", "app", "globals.css"),
    "utf8",
  );

  it("is declared exactly once in the whole stylesheet", () => {
    expect(css.match(/--brand-card:/g)).toHaveLength(1);
  });

  it("is white", () => {
    expect(css).toMatch(/--brand-card:\s*#ffffff;/);
  });

  it("is not inside either dark token block, so it is never overridden", () => {
    const blocks = [
      ...css.matchAll(/\/\* dark-tokens:start \*\/([\s\S]*?)\/\* dark-tokens:end \*\//g),
    ];
    expect(blocks).toHaveLength(2);
    for (const [, body] of blocks) {
      expect(body).not.toContain("--brand-card");
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/theme-tokens.test.ts`
Expected: FAIL on "is declared exactly once" — received `null`, because the token does not exist yet.

- [ ] **Step 3: Add the token**

Modify `apps/web/app/globals.css`. In the base `:root` block, immediately after the existing `color-scheme: light;` declaration and its comment, add:

```css
  /* The ONE deliberately theme-invariant colour in the system. Declared here
     and never overridden, so it stays #ffffff in dark — that is the whole
     point, not an oversight.
     The brand lockup is near-black green on a light field (it is a supplied
     asset, not our palette), so a card that followed the theme would put that
     wordmark on #1c1e23 and erase it. Kept OUTSIDE the dark-tokens markers
     because it needs no dark entry; putting it inside would break the
     13-declaration count. test/theme-tokens.test.ts enforces both. */
  --brand-card: #ffffff;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/theme-tokens.test.ts`
Expected: PASS — the file's pre-existing assertions plus the three new ones.

- [ ] **Step 5: Prove the invariance gate fails when someone adds a dark value**

Temporarily add `--brand-card: #1c1e23;` inside **one** of the two dark blocks, between the markers.

```bash
pnpm --filter @irp/web exec vitest run test/theme-tokens.test.ts
```

Expected: **three** failures — "declared exactly once" (now 2), "not inside either dark token block", and the pre-existing byte-identity check (the blocks now differ) and 13-declaration count (now 14). **Revert and re-run to confirm PASS.** Do not commit the deliberate break.

- [ ] **Step 6: Document it in design-system §3**

Modify `docs/design-system.md` §3. Add `--brand-card` to the token table with the same row shape as its neighbours, and below the table record:

- it is the only token that is **identical in light and dark**, by never being overridden
- **why:** the brand lockup is a supplied asset whose own internal contrast is not ours to re-verify, and it carries near-black text on a light field
- it therefore sits outside the `dark-tokens` markers, and `apps/web/test/theme-tokens.test.ts` enforces that
- it is **not** a general-purpose surface — it exists for the brand card and nothing else. Anything else needing a fixed light surface is a new design decision, not a reuse of this.

- [ ] **Step 7: Full verification and commit**

```bash
pnpm --filter @irp/web test
pnpm typecheck
pnpm lint
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build
git add apps/web/app/globals.css apps/web/test/theme-tokens.test.ts docs/design-system.md
git commit -m "feat(web): add the theme-invariant --brand-card token, enforced by test (O-15)"
```

---

### Task 3: The logo assets and the topbar mark

**Files:**
- Create: `apps/web/assets/hearts-academy-mark.png`
- Create: `apps/web/assets/hearts-academy-lockup.png`
- Create: `apps/web/components/app-frame/brand-mark.tsx`
- Modify: `apps/web/components/app-frame/topbar.tsx`
- Test: `apps/web/test/brand-mark.test.tsx`

**Interfaces:**
- Consumes: `--brand-card` (Task 2).
- Produces: `<BrandMark variant="mark" | "lockup" />` — a Server-Component-safe React component. Task 4 renders the `lockup` variant on both auth pages.

- [ ] **Step 1: Derive the two assets**

The source is `C:\Users\DamianDeCruzBISTECCa\Downloads\hearts-academy.png` — 1080×1031, RGBA, 302 KB. The heart mark occupies roughly the top 45% and the left 60%; the wordmark is below it.

`sharp` is already installed at 0.34.5 (Next brings it). Create `apps/web/assets/`, then run this **throwaway** script from the repository root — it is not committed:

```bash
mkdir -p apps/web/assets
node --input-type=module -e "
import sharp from 'sharp';
const SRC = 'C:/Users/DamianDeCruzBISTECCa/Downloads/hearts-academy.png';
// The lockup: the whole asset, down to 320px wide. Rendered at ~140px, so 320
// covers a 2x display without shipping a 1080px file.
await sharp(SRC).resize({ width: 320 }).png({ compressionLevel: 9 })
  .toFile('apps/web/assets/hearts-academy-lockup.png');
// The mark: crop the heart, then down to 64px square. Rendered at 32px.
const meta = await sharp(SRC).metadata();
const side = Math.round(meta.height * 0.46);
await sharp(SRC).extract({ left: Math.round(meta.width * 0.07), top: Math.round(meta.height * 0.08), width: side, height: side })
  .resize({ width: 64, height: 64 }).png({ compressionLevel: 9 })
  .toFile('apps/web/assets/hearts-academy-mark.png');
console.log('done');
"
```

**Then look at both files.** The crop fractions above are estimates from the source's composition; open `hearts-academy-mark.png` and confirm it contains the whole heart with a little breathing room and **no** wordmark fragment. Adjust the `extract` numbers and re-run until it does. A crop that clips the heart or includes a sliver of "BISTEC" is a defect — record the final numbers in your report so the derivation is reproducible.

- [ ] **Step 2: Verify the size ceiling**

```bash
ls -l apps/web/assets/
```

Expected: `hearts-academy-lockup.png` under **40 KB**, `hearts-academy-mark.png` under **8 KB**. The source is 302 KB; if either exceeds its ceiling the resize did not take effect. Both must be materially smaller — "downscaled" has to be measurable, not asserted.

- [ ] **Step 3: Write the failing test**

Create `apps/web/test/brand-mark.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandMark } from "@/components/app-frame/brand-mark";

describe("BrandMark", () => {
  it("renders the mark variant with an EMPTY alt, because adjacent text names the product", () => {
    const { container } = render(<BrandMark variant="mark" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // Empty alt, not a missing alt: decorative. A name here would make every
    // screen reader user hear the product twice on every single page.
    expect(img).toHaveAttribute("alt", "");
  });

  it("renders the lockup variant with a real accessible name", () => {
    render(<BrandMark variant="lockup" />);
    expect(screen.getByRole("img", { name: "Bistec Hearts Academy" })).toBeInTheDocument();
  });

  it("sits on the theme-invariant card token, never a themed surface", () => {
    const { container } = render(<BrandMark variant="mark" />);
    const card = container.firstElementChild as HTMLElement;
    // If this ever reads var(--surface) or var(--bg), the wordmark will vanish
    // in dark. That is the entire reason --brand-card exists.
    expect(card.style.background).toBe("var(--brand-card)");
  });

  it("gives the two variants different rendered widths", () => {
    const mark = render(<BrandMark variant="mark" />).container.querySelector("img");
    const lockup = render(<BrandMark variant="lockup" />).container.querySelector("img");
    expect(Number(mark?.getAttribute("width"))).toBeLessThan(
      Number(lockup?.getAttribute("width")),
    );
  });
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/brand-mark.test.tsx`
Expected: FAIL — cannot resolve `@/components/app-frame/brand-mark`.

- [ ] **Step 5: Write the component**

Create `apps/web/components/app-frame/brand-mark.tsx`:

```tsx
import Image from "next/image";
import mark from "@/assets/hearts-academy-mark.png";
import lockup from "@/assets/hearts-academy-lockup.png";

/**
 * The Bistec Hearts Academy brand asset. ASSUMPTION: O-15 — the brand changes
 * map to no FR and were requested directly after a review of the running app.
 *
 * Two variants because the asset is a STACKED lockup (mark above a three-line
 * wordmark) and the topbar is 56px tall: the whole lockup fits there at ~40px,
 * at which the wordmark is illegible. So the frame gets the mark alone and the
 * auth pages, which have room, get the full lockup.
 *
 * The card is var(--brand-card) — the one deliberately theme-invariant token
 * (design-system §3). The wordmark is near-black green on a light field, so a
 * card that followed the theme would erase it in dark.
 *
 * Imported statically rather than served from public/: apps/web/public/ does
 * not exist and Dockerfile:231-232 records that a COPY of it fails the build,
 * whereas .next/static is already copied at :230. A static import lands in
 * .next/static and reaches the production image with no Dockerfile change.
 */
const VARIANTS = {
  mark: { src: mark, width: 32, height: 32, alt: "", padding: "4px", radius: "8px" },
  lockup: { src: lockup, width: 140, height: 134, alt: "Bistec Hearts Academy", padding: "16px", radius: "12px" },
} as const;

export function BrandMark({ variant }: { variant: "mark" | "lockup" }) {
  const v = VARIANTS[variant];

  return (
    <span
      className="inline-flex items-center justify-center"
      style={{ background: "var(--brand-card)", padding: v.padding, borderRadius: v.radius }}
    >
      <Image src={v.src} alt={v.alt} width={v.width} height={v.height} priority />
    </span>
  );
}
```

> **`alt=""` on the mark is deliberate and must not be "fixed".** The topbar renders "Hearts Academy · IRP" immediately beside it. A populated `alt` there means the product name is announced twice on every page of the application.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/brand-mark.test.tsx`
Expected: PASS, 4 tests.

If the `.png` imports fail to resolve under Vitest, the fix is a Vitest alias or asset stub — **not** deleting the import. `apps/web/next-env.d.ts` already references Next's image type declarations, so `tsc` is satisfied; Vitest is a separate concern. Record whatever you add in your report.

- [ ] **Step 7: Put the mark in the topbar**

Modify `apps/web/components/app-frame/topbar.tsx`. Replace the diamond `<span>` — currently:

```tsx
        <span aria-hidden="true" style={{ color: "var(--primary)" }}>
          &#9670;
        </span>
```

with `<BrandMark variant="mark" />`, and add `import { BrandMark } from "./brand-mark";`. Keep the adjacent "Hearts Academy · IRP" `<span>` exactly as it is, and keep the wrapping `<div className="flex items-center gap-2">`.

- [ ] **Step 8: Confirm the topbar still renders and the build emits the asset**

```bash
pnpm --filter @irp/web test
pnpm typecheck
pnpm lint
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build
```

Then confirm the asset actually reached the build output — a static import that typechecks but is not emitted would 404 at runtime, and no status-code check catches an unstyled or imageless page:

```bash
ls apps/web/.next/static/media/ | grep -i hearts
```

Expected: both derived PNGs (or their hashed forms) present. If `static/media` does not exist, search `.next/static` for the filenames and record where they landed.

- [ ] **Step 9: Commit**

```bash
git add apps/web/assets apps/web/components/app-frame/brand-mark.tsx apps/web/components/app-frame/topbar.tsx apps/web/test/brand-mark.test.tsx
git commit -m "feat(web): add the brand mark to the topbar, on the invariant card (O-15)"
```

---

### Task 4: The lockup on both auth pages

**Files:**
- Modify: `apps/web/app/(auth)/signin/page.tsx`
- Modify: `apps/web/app/(auth)/not-registered/page.tsx`
- Test: `apps/web/test/signin.test.tsx`

**Interfaces:**
- Consumes: `<BrandMark variant="lockup" />` (Task 3).
- Produces: nothing later tasks depend on.

> **The two pages are NOT symmetrical — read this before editing.** `/signin` has a blue diamond and an `<h1>Hearts Academy</h1>` that the lockup duplicates. `/not-registered` has **neither** — its heading is "Your account is not registered", a statement about the reader's state. So the lockup *replaces* content on one page and is *purely additive* on the other.

- [ ] **Step 1: Write the failing test**

Modify `apps/web/test/signin.test.tsx` — add these cases (keep every existing one):

```tsx
  it("uses the logo as the page heading, so there is still exactly one h1", async () => {
    // Deleting <h1>Hearts Academy</h1> outright would leave this page with no
    // heading at all. The lockup becomes the heading's content instead.
    const { container } = render(await SignInPage());
    const headings = container.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0]!.querySelector("img")).not.toBeNull();
    expect(screen.getByRole("img", { name: "Bistec Hearts Academy" })).toBeInTheDocument();
  });

  it("no longer renders the blue diamond", async () => {
    const { container } = render(await SignInPage());
    // U+25C6. It was decorative and the logo replaces it.
    expect(container.textContent).not.toContain("\u25c6");
  });

  it("keeps the programme tagline below the logo", async () => {
    render(await SignInPage());
    expect(screen.getByText("Industry Readiness Programme")).toBeInTheDocument();
  });
```

Match the file's existing render helper and mocks — read it first; if it renders `SignInPage` differently, follow the file rather than this snippet.

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/signin.test.tsx`
Expected: FAIL — no `img` inside the `h1`, and the diamond is still present.

- [ ] **Step 3: Edit `/signin`**

Modify `apps/web/app/(auth)/signin/page.tsx`. Replace this block:

```tsx
        <span aria-hidden="true" className="mb-6 text-xl" style={{ color: "var(--primary)" }}>
          &#9670;
        </span>
        <h1 className="mb-2 text-2xl font-bold" style={{ color: "var(--ink)" }}>
          Hearts Academy
        </h1>
```

with:

```tsx
        {/* The logo IS the heading. Its alt text is the accessible name, so the
            page keeps exactly one h1 and the wordmark is not duplicated —
            deleting the h1 outright would leave this page headingless. */}
        <h1 className="mb-2">
          <BrandMark variant="lockup" />
        </h1>
```

Add `import { BrandMark } from "@/components/app-frame/brand-mark";`. Leave the `Industry Readiness Programme` paragraph, the `SignInPanel`, and everything else untouched.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/signin.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the lockup to `/not-registered`**

Modify `apps/web/app/(auth)/not-registered/page.tsx`. Add the lockup **above** the existing `<PageTitle>`, and do **not** touch the heading:

```tsx
      <div className="max-w-[52ch] px-8">
        {/* Additive, not a replacement: this page's heading is about the
            reader's state, not the product, and nothing else here names the
            product — hence a populated alt, unlike the topbar's. */}
        <div className="mb-8">
          <BrandMark variant="lockup" />
        </div>
        <PageTitle>Your account is not registered</PageTitle>
```

Add `import { BrandMark } from "@/components/app-frame/brand-mark";`.

- [ ] **Step 6: Full verification and commit**

```bash
pnpm --filter @irp/web test
pnpm typecheck
pnpm lint
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build
git add "apps/web/app/(auth)/signin/page.tsx" "apps/web/app/(auth)/not-registered/page.tsx" apps/web/test/signin.test.tsx
git commit -m "feat(web): put the brand lockup on both auth pages (O-15)"
```

---

### Task 5: The icon set and icons on every sidebar destination

**Files:**
- Create: `apps/web/components/ui/icons.tsx`
- Modify: `apps/web/app/globals.css` — `.nav-item`
- Modify: `apps/web/components/app-frame/sidebar.tsx`
- Test: `apps/web/test/sidebar.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `TodayIcon`, `RosterIcon`, `ReviewIcon`, `CyclesIcon`, `StudentsIcon`, `SettingsIcon`, `SignOutIcon` — each `() => JSX.Element`, 16×16, `aria-hidden`. Task 6 uses `SignOutIcon`.

- [ ] **Step 1: Write the failing test**

Modify `apps/web/test/sidebar.test.tsx` — add these cases, keeping all seven existing ones:

```tsx
  it("renders an icon for every destination", () => {
    const { container } = render(<Sidebar role="Admin" />);
    // Five primary destinations + Settings = six rows, six icons.
    expect(container.querySelectorAll("nav svg")).toHaveLength(6);
  });

  it("keeps the accessible name as the text label alone — icons are decorative", () => {
    render(<Sidebar role="Admin" />);
    // If an icon ever contributed to the name, this exact-match query breaks.
    // That is the assertion that proves the icons are aria-hidden.
    for (const label of ["Today", "Roster", "Review", "Cycles", "Students", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks every icon aria-hidden", () => {
    const { container } = render(<Sidebar role="Admin" />);
    for (const svg of container.querySelectorAll("nav svg")) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("draws icons with currentColor, so they follow hover and active states", () => {
    const { container } = render(<Sidebar role="Admin" />);
    // A hardcoded stroke would not flip with .nav-item[data-active] or in dark.
    for (const svg of container.querySelectorAll("nav svg")) {
      expect(svg.getAttribute("stroke")).toBe("currentColor");
    }
  });
```

> The existing tests map `a.textContent?.trim()` to compare labels. An `<svg>` contributes no text content, so those assertions survive unchanged — do not rewrite them.

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/sidebar.test.tsx`
Expected: FAIL on "renders an icon for every destination" — received `0`.

- [ ] **Step 3: Write the icon set**

Create `apps/web/components/ui/icons.tsx`:

```tsx
/**
 * The sidebar's icon set. Hand-drawn rather than a dependency: no icon library
 * exists in this repo, the only other SVG is hand-drawn in status-pill.tsx, and
 * the stack is a fixed programme constraint — adding a package for seven glyphs
 * would need an ADR and stakeholder escalation for no real gain.
 *
 * Every icon is stroke-only with `stroke="currentColor"` and no fill, so it
 * inherits .nav-item's resting, hover and [data-active] colour automatically.
 * That is what makes dark work here with no new tokens and no dark-specific
 * rules.
 *
 * Every icon is aria-hidden. The text label beside it is the accessible name,
 * so these add no meaning a screen reader would miss — which is also what keeps
 * design-system §12 satisfied (nothing conveys meaning by colour or glyph
 * alone).
 */
import type { ReactElement } from "react";

function Icon({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** A calendar — one day. */
export function TodayIcon(): ReactElement {
  return (
    <Icon>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v2M10.5 2v2" />
    </Icon>
  );
}

/** A table: header row plus a divided column. */
export function RosterIcon(): ReactElement {
  return (
    <Icon>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M6.5 6.5v7" />
    </Icon>
  );
}

/** A check inside a circle — something reviewed. */
export function ReviewIcon(): ReactElement {
  return (
    <Icon>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5.6 8.2l1.8 1.8 3.1-3.7" />
    </Icon>
  );
}

/** A circular arrow — the monthly cycle. */
export function CyclesIcon(): ReactElement {
  return (
    <Icon>
      <path d="M13.4 8a5.4 5.4 0 1 1-1.9-4.1" />
      <path d="M13.5 2.3v2.6h-2.6" />
    </Icon>
  );
}

/** Two people. */
export function StudentsIcon(): ReactElement {
  return (
    <Icon>
      <circle cx="6.2" cy="6" r="2.3" />
      <path d="M2.6 13.3c0-2 1.6-3.6 3.6-3.6s3.6 1.6 3.6 3.6" />
      <path d="M10.9 4.2a2 2 0 0 1 0 3.7M11.3 10c1.2.4 2.1 1.6 2.1 3.3" />
    </Icon>
  );
}

/** Sliders — settings. */
export function SettingsIcon(): ReactElement {
  return (
    <Icon>
      <path d="M2.5 5.2h11M2.5 10.8h11" />
      <circle cx="6" cy="5.2" r="1.7" />
      <circle cx="10" cy="10.8" r="1.7" />
    </Icon>
  );
}

/** An arrow leaving an open door. */
export function SignOutIcon(): ReactElement {
  return (
    <Icon>
      <path d="M6.5 13.5H4A1.5 1.5 0 0 1 2.5 12V4A1.5 1.5 0 0 1 4 2.5h2.5" />
      <path d="M10.2 5.4L12.8 8l-2.6 2.6M12.8 8H6.2" />
    </Icon>
  );
}
```

- [ ] **Step 4: Make `.nav-item` a flex row**

Modify `apps/web/app/globals.css`. In the `.nav-item` rule, add the three declarations and the comment:

```css
.nav-item {
  /* A flex row so an icon and its label sit on one baseline-aligned line, with
     `gap` doing the spacing. Before the icons landed, the review-count badge
     was separated from the label by a literal " " text node; `gap` replaces it,
     and that space has been removed rather than left as a no-op. */
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: var(--radius-control);
  padding: 8px 12px;
  color: var(--ink-muted);
  transition: background-color 150ms var(--ease-out-quart),
    color 150ms var(--ease-out-quart);
}
```

> Leave every other `.nav-item` rule — `:hover`, `[data-active]`, `[aria-disabled="true"]`, and the reduced-motion block — exactly as they are.

Because `.nav-item` is now `display: flex`, the `block` class 7A added to the Settings link is redundant but harmless; **leave it**, because `sidebar.test.tsx` does not assert it and removing it is an unrelated change. Note it in your report.

- [ ] **Step 5: Wire icons into the sidebar**

Modify `apps/web/components/app-frame/sidebar.tsx`:

1. Import the set:

```tsx
import {
  TodayIcon, RosterIcon, ReviewIcon, CyclesIcon, StudentsIcon, SettingsIcon,
} from "@/components/ui/icons";
```

2. Add an `icon` field to the **shared** destination shape, so both union branches carry one. Change:

```tsx
interface LinkedDestination {
  readonly label: string;
  readonly href: Route;
}
interface LabelOnlyDestination {
  readonly label: string;
}
```

to:

```tsx
/** Every destination carries an icon, including the label-only branch — a
    future entry rendering without one would sit misaligned against every
    other row. */
interface LinkedDestination {
  readonly label: string;
  readonly href: Route;
  readonly icon: () => ReactElement;
}
interface LabelOnlyDestination {
  readonly label: string;
  readonly icon: () => ReactElement;
}
```

and add `import type { ReactElement } from "react";`.

3. Add the icons to both destination arrays and to `SETTINGS_DESTINATION`:

```tsx
const MENTOR_DESTINATIONS: readonly Destination[] = [
  { label: "Today", href: "/", icon: TodayIcon },
  { label: "Roster", href: "/roster", icon: RosterIcon },
  { label: "Review", href: "/review", icon: ReviewIcon },
  { label: "Cycles", href: "/cycles", icon: CyclesIcon },
  { label: "Students", href: "/students", icon: StudentsIcon },
];

const STUDENT_DESTINATIONS: readonly Destination[] = [
  { label: "Today", href: "/", icon: TodayIcon },
  { label: "My month", href: "/my-month", icon: CyclesIcon },
];
```

and `const SETTINGS_DESTINATION: LinkedDestination = { label: "Settings", href: "/settings", icon: SettingsIcon };`

4. Render the icon in **both** branches, and drop the `" "` separator before the badge. The linked branch becomes:

```tsx
          const Glyph = d.icon;
          return (
            <Link
              key={d.label}
              href={d.href}
              aria-current={active ? "page" : undefined}
              className="nav-item"
              data-active={active || undefined}
            >
              <Glyph />
              {d.label}
              {badge}
            </Link>
          );
```

and the label-only branch:

```tsx
        const Glyph = d.icon;
        return (
          <span key={d.label} aria-disabled="true" className="nav-item">
            <Glyph />
            {d.label}
            {badge}
          </span>
        );
```

Delete the two `{showCount && " "}` expressions — `gap` now does that spacing. Also render `<SettingsIcon />` inside the Settings link, before its label.

- [ ] **Step 6: Run the sidebar tests**

Run: `pnpm --filter @irp/web exec vitest run test/sidebar.test.tsx test/app-frame.test.tsx`
Expected: PASS. **Both files** — `app-frame.test.tsx` holds eight more Sidebar cases with a different `usePathname` mock, and it is the one most likely to break on a structural change.

- [ ] **Step 7: Prove the decorative-icon gate fails**

Temporarily remove `aria-hidden="true"` from the shared `Icon` wrapper in `icons.tsx`.

```bash
pnpm --filter @irp/web exec vitest run test/sidebar.test.tsx
```

Expected: FAIL on "marks every icon aria-hidden". **Revert and re-run to confirm PASS.** Do not commit the break.

- [ ] **Step 8: Full verification and commit**

```bash
pnpm --filter @irp/web test
pnpm typecheck
pnpm lint
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build
git add apps/web/components/ui/icons.tsx apps/web/app/globals.css apps/web/components/app-frame/sidebar.tsx apps/web/test/sidebar.test.tsx
git commit -m "feat(web): give every sidebar destination a currentColor icon (O-15)"
```

---

### Task 6: Sign out moves into the sidebar

**Files:**
- Modify: `apps/web/app/(app)/layout.tsx`
- Modify: `apps/web/components/app-frame/sidebar.tsx`
- Modify: `apps/web/components/app-frame/topbar.tsx`
- Test: `apps/web/test/sidebar.test.tsx`

**Interfaces:**
- Consumes: `SignOutIcon` (Task 5).
- Produces: `<Sidebar role signOutSlot reviewCount? />` — the `signOutSlot: ReactNode` prop. Nothing later depends on it.

> **Why a slot and not a move.** `sidebar.tsx` is a Client Component because it needs `usePathname`. `signOut` comes from `@/auth` and is server-side — `topbar.tsx` can use it today only because it is a Server Component with an inline `"use server"` action. Importing `@/auth` into the client sidebar would be a build error. `app/(app)/layout.tsx` is already a Server Component that renders `<Sidebar>`, so it builds the form and passes it down. **Rejected: the client `signOut` from `next-auth/react`** — it would let the sidebar own the control outright, but it changes the established auth path for a cosmetic relocation and would need its own ADR.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/test/sidebar.test.tsx`:

```tsx
  it("renders whatever sign-out slot the server layout hands it", () => {
    render(
      <Sidebar role="Admin" signOutSlot={<button type="submit">Sign out</button>} />,
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("puts the sign-out slot in the bottom group, AFTER Settings", () => {
    render(
      <Sidebar role="Admin" signOutSlot={<button type="submit">Sign out</button>} />,
    );
    const settings = screen.getByRole("link", { name: "Settings" });
    const signOut = screen.getByRole("button", { name: "Sign out" });
    const wrapper = settings.parentElement!;
    // Same wrapper, and Settings first. DOCUMENT_POSITION_FOLLOWING === 4.
    expect(wrapper.contains(signOut)).toBe(true);
    expect(settings.compareDocumentPosition(signOut) & 4).toBeTruthy();
  });

  it("renders nothing extra when no slot is supplied", () => {
    render(<Sidebar role="Admin" />);
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/sidebar.test.tsx`
Expected: FAIL — `Sidebar` accepts no `signOutSlot`, so nothing renders.

- [ ] **Step 3: Add the slot to the sidebar**

Modify `apps/web/components/app-frame/sidebar.tsx`:

1. Extend the props:

```tsx
export function Sidebar({
  role,
  reviewCount = 0,
  signOutSlot,
}: {
  role: "Admin" | "Student";
  reviewCount?: number;
  /**
   * The sign-out form, rendered by the SERVER layout and passed in. This
   * component is a Client Component (usePathname), and `signOut` from
   * `@/auth` is server-side — importing it here would be a build error. A
   * ReactNode slot keeps the existing inline `"use server"` action intact.
   */
  signOutSlot?: ReactNode;
}) {
```

and add `ReactNode` to the existing `import type { ReactElement } from "react";` → `import type { ReactElement, ReactNode } from "react";`.

2. Render it inside the existing `mt-auto` wrapper, immediately after the Settings `<Link>` and before the closing `</div>`:

```tsx
        {signOutSlot}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Move the form in the layout**

Modify `apps/web/app/(app)/layout.tsx`:

1. Add imports:

```tsx
import { signOut } from "@/auth";
import { SignOutIcon } from "@/components/ui/icons";
```

2. Pass the form to the sidebar, replacing `<Sidebar role={user.role} />`:

```tsx
        <Sidebar
          role={user.role}
          signOutSlot={
            /* Built HERE, in a Server Component, so the inline "use server"
               action stays valid — the sidebar is a client component and
               cannot import `@/auth`. */
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              {/* Styled as a nav row, not a Button, so the bottom group reads
                  as two peers. Still a form submit, so it is a real action
                  rather than a link. */}
              <button type="submit" className="nav-item w-full">
                <SignOutIcon />
                Sign out
              </button>
            </form>
          }
        />
```

- [ ] **Step 6: Remove Sign out from the topbar**

Modify `apps/web/components/app-frame/topbar.tsx`. Delete the `<form>` and its `Button`, and drop the now-unused `signOut` and `Button` imports. The right-hand `<div>` keeps only the user's name:

```tsx
      <div className="flex items-center gap-6">
        <span style={{ color: "var(--ink)" }}>{userName}</span>
      </div>
```

Update the file's doc comment: it currently says the Server Component status exists so the inline sign-out action is valid. That is no longer why — say the bar is still a Server Component and that sign-out moved to the sidebar (O-15), so a future editor does not "restore" it.

**An unused import is a lint error here** — run lint before committing.

- [ ] **Step 7: Update the app-frame test if it asserts Sign out in the topbar**

```bash
grep -n "Sign out" apps/web/test/*.tsx apps/web/e2e/*.ts
```

Any unit test asserting Sign out is in the topbar must move to asserting it is in the sidebar. **Any e2e helper or spec that clicks Sign out must still find it** — it is in the sidebar now, and if a helper scoped its query to the banner landmark it will break. Fix the query, not the test's intent.

- [ ] **Step 8: Full verification and commit**

```bash
pnpm --filter @irp/web test
pnpm typecheck
pnpm lint
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build
git add "apps/web/app/(app)/layout.tsx" apps/web/components/app-frame/sidebar.tsx apps/web/components/app-frame/topbar.tsx apps/web/test/sidebar.test.tsx
git commit -m "feat(web): move Sign out into the sidebar via a server-rendered slot (O-15)"
```

---

### Task 7: `Create batch` returns to Students

**This task moves a UI surface between routes, so the Playwright suite is part of its verification set.** Plan 7A's equivalent task broke `e2e/mentor-flows.spec.ts` and its unit-only gate could not see it.

**Files:**
- Modify: `apps/web/app/(app)/students/page.tsx`
- Modify: `apps/web/app/(app)/settings/page.tsx`
- Test: `apps/web/test/students-page.test.tsx`
- Test: `apps/web/test/settings-page.test.tsx`

**Interfaces:**
- Consumes: `CreateBatchForm` from `./forms` — unchanged and **not** modified.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

In `apps/web/test/students-page.test.tsx`, add:

```tsx
  it("carries Create batch again — it fills the column Transfer leaves short (ADR-0023)", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH], error: undefined });
    listUsers.mockResolvedValue({ data: [STUDENT_DETAIL, MENTOR_DETAIL], error: undefined });

    render(await StudentsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByLabelText("Batch name")).toBeInTheDocument();
  });

  it("still does NOT carry Register — that stayed in Settings (ADR-0022)", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH], error: undefined });
    listUsers.mockResolvedValue({ data: [STUDENT_DETAIL, MENTOR_DETAIL], error: undefined });

    render(await StudentsPage({ searchParams: Promise.resolve({}) }));

    // ADR-0023 supersedes only part of 0022. Register must not come back too.
    expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
  });
```

Use the file's own `searchParams()`/`defaultReads()` helpers if it has them — read it first and follow its conventions rather than these literals.

In `apps/web/test/settings-page.test.tsx`, change the existing `Create batch` expectations to their negation and add the error-path test that 7A deferred:

```tsx
  it("no longer carries Create batch — it went back to Students (ADR-0023)", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    render(await SettingsPage());
    expect(screen.queryByLabelText("Batch name")).not.toBeInTheDocument();
  });

  it("still carries Register for a mentor", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    render(await SettingsPage());
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
  });

  it("surfaces a batch-read failure instead of rendering an empty select", async () => {
    // Deferred in Plan 7A because nothing else touched this page. This task
    // edits it, so the gap closes here.
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    listBatches.mockResolvedValue({
      data: undefined,
      error: { title: "Bad Gateway", detail: "Batch service unavailable." },
    });
    render(await SettingsPage());
    expect(screen.getByRole("alert")).toHaveTextContent("Batch service unavailable.");
  });
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm --filter @irp/web exec vitest run test/students-page.test.tsx test/settings-page.test.tsx`
Expected: FAIL — Students has no `Batch name` field, and Settings still has one.

- [ ] **Step 3: Add the panel back to Students**

Modify `apps/web/app/(app)/students/page.tsx`:

1. Change the import to include the form again:

```tsx
import { TransferForm, CreateBatchForm, ArchiveButton, RestoreButton } from "./forms";
```

2. Inside the `grid grid-cols-2 gap-6` container, wrap the existing `Transfer` panel and a new `Create batch` panel in a single left-column `div`, so both stack in one grid cell beside `People`:

```tsx
        <div className="flex flex-col gap-6">
          <Panel>
            <SectionLabel>Transfer</SectionLabel>
            <div className="mt-3">
              {studentOptions.length === 0 || batchOptions.length === 0 ? (
                <EmptyState title="No active student or batch to transfer yet." />
              ) : (
                <TransferForm students={studentOptions} batches={batchOptions} />
              )}
            </div>
          </Panel>

          {/* ADR-0023. `grid-cols-2` with Transfer alone left this column
              visibly empty below it, because People is several times taller.
              A batch is also not a person, so this sits better here than
              under a heading about registering people. */}
          <Panel>
            <SectionLabel>Create batch</SectionLabel>
            <div className="mt-3">
              <CreateBatchForm />
            </div>
          </Panel>
        </div>
```

Keep the `People` panel exactly as it is, as the grid's second cell.

3. Update the file's top doc comment: it says two working panels. Change to three and name ADR-0023.

- [ ] **Step 4: Remove it from Settings**

Modify `apps/web/app/(app)/settings/page.tsx`:

1. Change the import to `import { RegisterForm } from "../students/forms";`
2. Delete the `<Panel title="Create batch">` block.
3. Update the doc comment to name ADR-0023 alongside ADR-0021 and ADR-0022.
4. **Keep `listBatches`, `batchOptions`, the error panel, and the non-Admin early return.** `RegisterForm` still needs the batch options, and the read must still be gated — a Student is not authorised to list batches.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @irp/web exec vitest run test/students-page.test.tsx test/settings-page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the e2e suite, because a surface moved between routes**

Bring Postgres up and seed, then:

```bash
cd apps/web
pnpm exec playwright test --reporter=line
```

Expected: all green except the one documented pre-existing skip (`student-flows.spec.ts:38`). **`mentor-flows.spec.ts` visits `/settings` to register a user and `/students` for the directory — if it also creates a batch, that step must now go to `/students`.** Fix any spec whose route assumption this task broke, minimally and without weakening an assertion, and say in your report exactly what you changed.

- [ ] **Step 7: Full verification and commit**

```bash
pnpm --filter @irp/web test
pnpm typecheck
pnpm lint
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build
git add "apps/web/app/(app)/students/page.tsx" "apps/web/app/(app)/settings/page.tsx" apps/web/test/students-page.test.tsx apps/web/test/settings-page.test.tsx
git commit -m "refactor(web): return Create batch to Students (FR-3, ADR-0023)"
```

---

### Task 8: The two Plan 7A carry-overs

Both are corrections to Plan 7A, one documentation and one coverage.

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `docs/design-system.md` §3.3
- Modify: `apps/web/e2e/dark-theme.spec.ts`
- Modify: `apps/web/e2e/README.md`

**Interfaces:**
- Consumes: `signInAsMentor`, `signInAsStudent` from `./helpers` — both already exported.
- Produces: nothing.

- [ ] **Step 1: Correct the `ORDER MATTERS` explanation**

Both `apps/web/app/globals.css` (the comment above the theme rules) and `docs/design-system.md` §3.3 claim `:root[data-theme="dark"]` must come last because an explicit dark choice must beat an OS reporting light. **That mechanism is wrong.** When the OS reports light, `@media (prefers-color-scheme: dark)` does not match at all, so there is nothing for source order to beat.

Rewrite both to say:

- the load-bearing part is **`:not([data-theme="light"])`** on the media-query rule — that is what lets an explicit light choice suppress a dark OS
- the two selectors have **equal specificity** (`:root` plus one pseudo-class or attribute selector each), so source order decides only when *both* match — which requires OS-dark **and** `data-theme="dark"`, and in that case the parity test guarantees the two blocks are identical, so the outcome is the same either way
- the order is therefore **defensive rather than load-bearing**: it costs nothing and becomes meaningful only if the two blocks ever legitimately diverge
- **do not delete the `:not()` guard.** Removing it would make OS-dark plus an explicit light choice render dark — a real bug. State this explicitly, because the wrong explanation invited exactly that deletion.

**Do not change the rule order itself.** It is correct; only its justification was wrong.

- [ ] **Step 2: Confirm nothing behavioural changed**

```bash
pnpm --filter @irp/web exec vitest run test/theme-tokens.test.ts
```

Expected: PASS. This step is a comment-and-prose change; if a test moves, you edited CSS you should not have.

- [ ] **Step 3: Extend the dark walk to all eleven views**

Modify `apps/web/e2e/dark-theme.spec.ts`. Its first test walks six mentor views. Add a second walk for the remaining five, keeping the file **strictly read-only** — navigation and visibility assertions only, no submissions, no state changes:

```ts
  test("the student's views and both bare pages render with the OS in dark", async ({ page }) => {
    await signInAsStudent(page);

    for (const [path, heading] of [
      ["/", "Today"],
      ["/my-month", "My month"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
  });

  test("the bare frames render with the OS in dark", async ({ page }) => {
    // /signin is reachable signed out; /not-registered needs the unregistered
    // dev identity. Both are outside the (app) route group, so neither has app
    // chrome — that is what makes them worth a separate check.
    await page.goto("/signin");
    await expect(page.getByRole("img", { name: "Bistec Hearts Academy" })).toBeVisible();
  });
```

Then add `/review/<id>` to the **mentor** walk in the existing first test, since it needs a mentor session. Read the file and `helpers.ts` first: the mentor walk already visits `/review`, so pick a student from the seeded roster the way `mentor-flows.spec.ts` does, and assert the day list renders. **Use the real helper names** — do not invent one.

`/not-registered` requires signing in as the unregistered dev identity. If `helpers.ts` has no helper for it, **do not add one in this task** — assert the four you can reach, and record `/not-registered` in your report as the one view still unguarded, so Task 9 can note it in `handoff.md`. Inventing an auth helper here is scope creep.

- [ ] **Step 4: Run the dark project only**

```bash
cd apps/web
pnpm exec playwright test --project=chromium-dark --reporter=line
```

Expected: all green. Confirm from the output that only `dark-theme.spec.ts` ran.

- [ ] **Step 5: Run the whole suite twice, to confirm the additions left no state**

```bash
pnpm exec playwright test --reporter=line
pnpm exec playwright test --reporter=line
```

Expected: identical results both times, all green except the documented `student-flows.spec.ts:38` skip. If the second differs, something you added mutates state — find it rather than re-running.

- [ ] **Step 6: Update `e2e/README.md`**

Record that the dark walk now covers the student views and the bare frames, which view (if any) is still unguarded and why, and that `chromium-dark` remains scoped to this one read-only spec and must never be widened to the mutating specs.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/globals.css docs/design-system.md apps/web/e2e/dark-theme.spec.ts apps/web/e2e/README.md
git commit -m "fix(web): correct the cascade-order rationale, and extend the dark walk"
```

---

### Task 9: The visual pass, remaining docs, and full verification

**Files:**
- Modify: whatever the pass reveals (expect `apps/web/components/**`)
- Modify: `docs/design-system.md` §6
- Modify: `ONBOARDING.md`, `docs/walkthrough.md`, `handoff.md`

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: the merge-ready branch.

- [ ] **Step 1: Update design-system §6**

Modify §6's frame mock to show: the brand mark replacing the diamond in the topbar, an icon on every sidebar row, and Sign out pinned below Settings inside the same divider group. Note that the topbar now holds only the brand and the user's name.

- [ ] **Step 2: Get the app running with fresh data**

```bash
$env:IRP_DB_PORT = "5433"
docker compose -f apps/api/docker-compose.yml up -d
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm --filter @irp/api run db:seed
# two terminals
cd apps/api; pnpm dev
cd apps/web; pnpm dev
```

- [ ] **Step 3: Look at it, in BOTH themes**

Sign in as Mentor. Check in light, then switch to Dark in Settings and check again:

1. **The topbar mark** — is the white card obviously intentional in dark, or does it read as a rendering fault? Is 32px enough to recognise the heart?
2. **Every sidebar icon** — do all six align on one baseline with their labels? Does the active row's icon change colour with its label? Is any glyph unrecognisable at 16px?
3. **Sign out** — does it sit below Settings inside the divider group, matching the nav rows rather than looking like a stray button? Does its hover match theirs?
4. **`/students`** — do `Transfer` and `Create batch` stack in the left column with `People` beside them, and is the dead space gone?
5. **`/signin`** and **`/not-registered`** — is the lockup legible on its card in dark? Is it the right size, or does it dominate the page?
6. **Focus rings** — tab through the sidebar. Every row, including Sign out, must show a visible ring.

- [ ] **Step 4: Check the back/forward theme-control question Plan 7A left open**

Choose **Dark** in Settings, click **Roster**, then press the browser **Back** button. Read the radio group.

Expected, per 7A's review: the page stays dark while the radio may read **Follow system**, because `theme-actions.ts` deliberately omits `revalidatePath` and `ThemeControl` seeds its state from the server prop. The theme is never wrong and it self-heals on reload.

If it reproduces, fix it by seeding the control's initial state from the live DOM, **not** with `revalidatePath` — that would contradict ADR-0021's instant-repaint reasoning. If it does not reproduce, say so; it has never been verified either way.

- [ ] **Step 5: Fix what you found**

Fix each defect with a **token**, never a hardcoded colour, and never by special-casing dark. Re-run the affected tests. If a defect needs a design decision rather than a fix, **log it in `handoff.md` and keep the change** — a half-made design call in a hurry is worse than a recorded gap.

```bash
grep -rn "#[0-9a-fA-F]\{6\}\|#[0-9a-fA-F]\{3\}\b" apps/web/components apps/web/app --include=*.tsx | grep -v node_modules
grep -rn "bg-white\|text-white\|bg-slate\|text-slate\|bg-gray\|text-gray" apps/web/components apps/web/app --include=*.tsx
```

Expected: **no matches** from either. The second catches Tailwind colour utilities, which the first cannot see — `bg-white` is exactly the shortcut `--brand-card` exists to make unnecessary.

- [ ] **Step 6: Update the remaining docs**

- **`ONBOARDING.md` §8** — Sign out is in the sidebar now, not the topbar; `Create batch` is on Students, `Register` in Settings.
- **`docs/walkthrough.md`** — the Students section regains `Create batch`; the Settings section loses it; note the brand mark and the icons.
- **`handoff.md` §1** — a dated entry: what this slice shipped, that **O-15** is outstanding, **ADR-0023** superseding ADR-0022's scope, the `--brand-card` invariance decision and why it is exempt from the pairing rule, what the visual pass found, the outcome of the back/forward check, and any view still missing dark e2e cover.

- [ ] **Step 7: Full verification**

```bash
pnpm typecheck                                                  # 6 projects
pnpm --filter @irp/core test                                    # 113
pnpm --filter @irp/api test                                     # 269
pnpm --filter @irp/api run db:seed                              # the api suite TRUNCATEs
pnpm --filter @irp/web test                                     # 239 + this plan's new tests
pnpm lint                                                       # exit 0
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build
cd apps/web; pnpm exec playwright test --reporter=line          # 1 skip, the documented one
```

Also confirm the derived assets reached the build:

```bash
ls apps/web/.next/static/media/ | grep -i hearts
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix(web): finish the frame pass, and document the slice"
```

The PR is opened by `superpowers:finishing-a-development-branch` **after** the whole-branch review, not here. Its body must name **FR-3**, state that the frame and brand changes map to no FR and are logged as **O-15**, list **ADR-0023** and what it supersedes, and say what the visual pass found.

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| D1 `Create batch` returns; ADR-0023 supersedes 0022's scope | 1 (ADR), 7 (code) |
| D2 mark in the frame, lockup on the auth pages; two diamonds removed | 3 (topbar), 4 (auth pages) |
| D2 `/signin`'s h1 survives; `/not-registered` is additive; per-placement `alt` | 4 |
| D3 `--brand-card`, theme-invariant, outside the markers | 2 |
| D4 hand-drawn `currentColor` icons, decorative | 5 |
| D5 sign-out slot from the server layout | 6 |
| D6 corrected `ORDER MATTERS`; extended dark walk | 8 |
| §1 `Create batch` panel; `listBatches` kept on both pages | 7 |
| §2 two derived assets, `sharp`, size ceiling, static import | 3 |
| §3 icon set, `.nav-item` flex, badge separator removed, label-only branch | 5 |
| §4 Sign out styled as a nav row; `parentElement` test survives | 6 |
| §5 documentation | 1, 2, 8, 9 |
| §6 all nine test rows | 2, 3, 4, 5, 6, 7, 8 |
| §7 risks — shared `.nav-item`, route move, `next/image` unproven, wrong `alt` | 5, 7, 3, 3+4 |
| §8 back/forward open item | 9 |
| §9 non-goals | Global Constraints |

**Correction (whole-branch review, post-merge-prep fix wave):** the "§6 all nine test rows" row
above is wrong — two of the nine were never written, and no task closed them:

- **"The sidebar never imports `@/auth`"** was carried into the fix wave and landed as a source
  assertion in `test/sidebar.test.tsx` (`readFileSync` + a regex against `sidebar.tsx`, in the
  style `test/theme-tokens.test.ts` uses for `globals.css`).
- **"The label-only branch renders an icon"** was investigated in the same fix wave and found to
  need a fixture destination that no task's data model provides: `MENTOR_DESTINATIONS` and
  `STUDENT_DESTINATIONS` in `sidebar.tsx` contain only `LinkedDestination` entries, both arrays
  are module-private with no export, and the `Sidebar` component takes no prop that reaches them —
  so there is no way to render the `LabelOnlyDestination` branch through the component's existing
  public surface. Closing this row would require exporting the destination lists/types or adding
  a testing-only prop, i.e. reshaping `sidebar.tsx` to make it testable, which was judged worse
  than the gap it would close. **This row remains open** — the `<Glyph />` Task 5 added to that
  branch is still unexercised by any test, and the whole suite stays green if it is deleted.

Both gaps are the plan grading its own coverage wrongly, not an implementer omission — see
`.superpowers/sdd/2026-08-04-plan-7b-frame-and-brand/final-review-fixes.md` item 2 and
`final-fix-report.md` for the full account.

**Type consistency:** `BrandMark({ variant }: { variant: "mark" | "lockup" })` is defined in Task 3 and used with that exact prop in Tasks 3 and 4. The seven icon components are defined in Task 5 with the names `TodayIcon`, `RosterIcon`, `ReviewIcon`, `CyclesIcon`, `StudentsIcon`, `SettingsIcon`, `SignOutIcon`; Task 5 consumes the first six and Task 6 consumes `SignOutIcon`. `icon: () => ReactElement` is added to both destination interfaces in Task 5 and every array literal in that task supplies one. `signOutSlot?: ReactNode` is added in Task 6 and passed in Task 6's layout edit. `--brand-card` is created in Task 2 and read as `var(--brand-card)` in Task 3.

**Placeholder scan:** no `TBD`, no "add error handling", no "similar to Task N", no "write tests for the above". Every code step carries the actual code. Three steps deliberately require the implementer to read a file and follow it over the plan's snippet — Task 4 Step 1 (`signin.test.tsx`'s render helper), Task 7 Step 1 (`students-page.test.tsx`'s fixture helpers), and Task 8 Step 3 (`helpers.ts`'s real export names) — because a snippet that contradicts the file is how Plan 7A's `getByText("Transfer")` defect happened. Each says so explicitly rather than leaving it implicit.

**Two things this plan cannot promise.** Task 3 Step 1's crop fractions are estimates from the source image's composition; the step requires the implementer to look at the output and adjust, which is why the numbers are framed as a starting point rather than a result. And Task 9 is a human visual pass, so its outcome is unknown by construction — the plan handles both branches, fix with a token or log the gap, and Task 9 Step 4 may likewise find nothing.
