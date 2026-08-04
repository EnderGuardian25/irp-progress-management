# Plan 7A — Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Settings page pinned to the bottom of the sidebar carrying a Light/Dark/System theme switch for everyone plus the two registration forms for mentors, and make the dark theme reachable and verified for the first time.

**Architecture:** Theme is a server-readable cookie. One parser module (`lib/theme.ts`) is shared by the root layout (which stamps `data-theme` on `<html>` during SSR, so there is no wrong-theme flash) and a Server Action (which writes the cookie). `globals.css` gains an explicit `[data-theme="dark"]` rule alongside its existing media query, and a unit test keeps the two dark token blocks identical. `Register` and `Create batch` move from Students to Settings unchanged; Students keeps `Transfer` and `People`. Nothing touches `apps/api`, `spec/openapi.yaml`, or Prisma.

**Tech Stack:** Next.js 16 App Router (Server Components, Server Actions, `next/headers` cookies), Tailwind CSS 4 with CSS custom properties, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-04-settings-page-design.md` — all sections.

**Branch:** `feat/plan-7a-settings-page` — already created; the spec commit `df12f5b` is its first commit. One branch, one PR, merged before Plan 8 (Notifications) starts.

**FRs:** FR-3 (registration — the forms that move). **The theme switch maps to no FR** and is logged as **O-14**; it closes ADR-0002 rather than implementing a requirement. See Task 1.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **No `apps/api` change, no `spec/openapi.yaml` change, no Prisma migration.** If a task appears to need one, stop — the design chose a cookie precisely to avoid it (spec D4).
- **No hand-written `fetch` in `apps/web`.** Import from `@irp/client` only. Server Actions are not `fetch` and are the established pattern (`app/(app)/entry-actions.ts`).
- **`pnpm typecheck` is not sufficient for `apps/web`.** `AUTH_DEV_BYPASS=false pnpm --filter @irp/web build` is part of the required verification set for **every** task in this plan. Plain `tsc` does not run Next's `typedRoutes` check.
- **`pnpm typecheck` can be falsely red for `apps/web`** if `.next/types/routes.d.ts` predates a new route. After Task 6 adds `/settings`, run the build **before** trusting a `TS2322: Type '"/settings"' is not assignable to type 'Route'`. Never fix such an error with a cast.
- **`pnpm --filter @irp/web build` needs `AUTH_DEV_BYPASS=false`** explicitly. `.env.local` sets it true, `next build` forces `NODE_ENV=production`, and `assertBypassNotInProduction` then correctly refuses. That is guard one working.
- **Status is never colour alone** (design-system §12). Every theme option carries a text label; swatches and decorative marks are `aria-hidden`.
- **Do not substitute token values.** design-system §3 states 35 pairs pass WCAG AA. Copy hex values verbatim; never retype from memory.
- **Desktop only, min 1280px** (NFR-13). No responsive or mobile treatment.
- **Conventional commits**, one per task. Any decision with a plausible rejected alternative gets an ADR naming **at least two** rejected alternatives.
- **Never weaken the dev-bypass guards.** Nothing in this plan touches `auth.config.ts`, `proxy.ts`, `instrumentation.ts`, or `app/api/dev-jwks/route.ts`. Task 3 modifies `app/layout.tsx`, which is **not** one of the four guard entry points and must not become one.
- **Playwright: `workers: 1` stays pinned.** Do not raise it. See Task 8 for why the dark project must not re-run mutating specs.

### Environment

```bash
# Postgres — Docker Desktop is a per-user install at
# $env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe and must be started manually
$env:IRP_DB_PORT = "5433"
docker compose -f apps/api/docker-compose.yml up -d
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"

# All five generated trees. Run these on a RETURNING clone too, not just a fresh one —
# they are git-ignored and survive a pull stale with nothing to invalidate them.
pnpm install
pnpm generate                                   # packages/types + packages/client source
pnpm --filter @irp/core build                   # packages/core/dist
pnpm --filter @irp/client build                 # packages/client/dist
pnpm --filter @irp/api exec prisma generate     # apps/api/src/generated/prisma
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build   # apps/web/.next/types

pnpm --filter @irp/api run db:seed              # demo data; API suites TRUNCATE, so re-seed after them

# Two dev servers, in two terminals. They do not survive an agent session —
# run them in a real terminal.
cd apps/api; pnpm dev      # :3001
cd apps/web; pnpm dev      # :3000 — browse at localhost, NEVER 127.0.0.1
```

### File structure

| File | Responsibility | Task |
|---|---|---|
| `docs/adr/0021-theme-persistence-by-cookie.md` | Create — why a cookie, not localStorage or a column | 1 |
| `docs/adr/0022-settings-as-the-registration-home.md` | Create — why registration moves to Settings | 1 |
| `docs/interview-and-prd.md` | Modify — add O-14 | 1 |
| `apps/web/lib/theme.ts` | Create — the cookie name, the three valid values, and the one parser. No Next imports, so client and server both use it | 2 |
| `apps/web/app/globals.css` | Modify — add the `[data-theme]` override rules and the block markers | 2 |
| `apps/web/test/theme-tokens.test.ts` | Create — asserts the two dark blocks stay identical | 2 |
| `apps/web/app/layout.tsx` | Modify — read the cookie, stamp `data-theme` on `<html>` | 3 |
| `apps/web/test/root-layout.test.tsx` | Create — stamping behaviour per cookie value | 3 |
| `apps/web/app/(app)/settings/theme-actions.ts` | Create — the Server Action that writes the cookie | 4 |
| `apps/web/test/theme-actions.test.ts` | Create — writes valid values, rejects invalid ones | 4 |
| `apps/web/app/(app)/settings/theme-control.tsx` | Create — the client radio group; instant DOM write + persist | 5 |
| `apps/web/test/theme-control.test.tsx` | Create — selection, instant stamp, error surfacing | 5 |
| `apps/web/app/(app)/settings/page.tsx` | Create — the page, with per-section role gating | 6 |
| `apps/web/components/app-frame/sidebar.tsx` | Modify — bottom-pinned Settings entry | 6 |
| `apps/web/test/settings-page.test.tsx` | Create — role gating, both sections | 6 |
| `apps/web/test/sidebar.test.tsx` | Modify or create — Settings present for both roles, rendered last | 6 |
| `apps/web/app/(app)/students/page.tsx` | Modify — drop two panels, reword the empty state | 7 |
| `apps/web/test/students-page.test.tsx` | Modify — the two panels are gone | 7 |
| `apps/web/e2e/dark-theme.spec.ts` | Create — read-only walk of every view | 8 |
| `apps/web/e2e/settings.spec.ts` | Create — theme switch persists across reload | 8 |
| `apps/web/playwright.config.ts` | Modify — add the scoped `chromium-dark` project | 8 |
| `docs/design-system.md` | Modify — §3.3 the `data-theme` contract (Task 2), §6 the frame mock (Task 6), §14 ADR-0021 (Task 1) | 1, 2, 6 |
| `ONBOARDING.md`, `docs/walkthrough.md`, `handoff.md` | Modify — demo flow, walkthrough, dated entry | 9 |

---

### Task 1: The two ADRs and O-14

`CLAUDE.md` requires the ADR **first**, before the code it governs. This task is documentation only and produces no behaviour.

**Files:**
- Create: `docs/adr/0021-theme-persistence-by-cookie.md`
- Create: `docs/adr/0022-settings-as-the-registration-home.md`
- Modify: `docs/interview-and-prd.md` — §5's open-points table
- Modify: `docs/design-system.md` — §14's governing-ADR table

**Interfaces:**
- Consumes: nothing.
- Produces: ADR numbers `0021` and `0022`, and open point `O-14`, referenced by later tasks' comments and commit messages.

- [ ] **Step 1: Confirm 0021 and 0022 are free, and that O-14 is the next open point**

```bash
ls docs/adr/ | tail -3
grep -o 'O-1[0-9]' docs/interview-and-prd.md | sort -u
```

Expected: highest ADR is `0020-collapsed-ribbon-key-on-the-mentor-dashboard.md`; open points run to `O-13`. If either differs, use the next free numbers and update every reference in this plan.

> **Note:** `O-13` is already OpenAPI 3.1 (ADR-0006) and Plan 8 is already Notifications. Both were mis-numbered in an early draft of the spec. Verify rather than assume.

- [ ] **Step 2: Write ADR-0021**

Create `docs/adr/0021-theme-persistence-by-cookie.md`, following `docs/adr/0020-...md`'s shape (Status / Date / Deciders / Requirements / Relates to, then Context, Decision, Rejected alternatives, Consequences).

Content requirements — the ADR must state:

- **Context:** ADR-0002 accepted "light default, dark supported, both contrast-verified". `globals.css` carries 13 dark tokens plus a re-tuned status ramp, reachable only by changing the operating system's theme. There is no `data-theme` hook and no toggle.
- **Decision:** persist the choice in a server-readable cookie (`irp-theme`, `httpOnly`, `sameSite=lax`, `path=/`, one year, `secure` outside development). The root layout reads it and stamps `data-theme` on `<html>` during SSR.
- **Rejected 1 — `localStorage`.** The server cannot read it, so the first paint is the wrong theme unless a blocking inline `<script>` runs before hydration. An inline `<head>` script is exactly the kind of thing this codebase avoids, and the flash is visible on every cold navigation.
- **Rejected 2 — a `themePreference` column on `User`.** It follows the person across devices, which is genuinely better. Rejected on cost and on logic: it is a full spec-first cycle (`openapi.yaml` with the four mandated responses, examples and Problem Details; a Prisma migration; a handler; regenerate types and client) **and it still needs a cookie** to avoid the SSR flash, because the layout renders before any API call resolves. It is therefore additive work on top of this decision, not an alternative to it. Revisit if cross-device preference is ever asked for.
- **Rejected 3 — no switch at all; leave dark to the OS.** The status quo. Rejected because it makes ADR-0002's "dark supported" untrue in practice, and because the tokens are shipped and audited either way — the choice is between finishing ADR-0002 and reverting it.
- **Consequences:** reading cookies in the root layout forces dynamic rendering, so `/_not-found` and `/not-registered` stop being prerendered. The dark token block must appear twice in CSS and is kept honest by a parity test, not a comment.

- [ ] **Step 3: Write ADR-0022**

Create `docs/adr/0022-settings-as-the-registration-home.md`. Must state:

- **Context:** `app/(app)/students/page.tsx` renders `RegisterForm`, whose role select offers Student **and** Mentor (`students/forms.tsx:39-54`). A page titled "Students" is the mentor-creation surface.
- **Decision:** `Register` and `Create batch` move to Settings. `Transfer` and `People` (directory, archive/restore, `?view=archived`) stay on Students, which remains the management surface.
- **Rejected 1 — leave registration on Students.** Zero work, and the forms are already there. Rejected: it preserves the mismatch that prompted the change.
- **Rejected 2 — rename Students to "People".** Fixes the label honestly and moves no code. Rejected: it concedes that one page is both the directory and the factory, and it renames a route (`/students`) that the e2e suite, the sidebar, and `docs/walkthrough.md` all address by name.
- **Rejected 3 — move all four panels.** Cleanest admin/view separation. Rejected: it leaves Students with no actions at all, contradicting the decision that Students remains the management surface.
- **Consequences:** the directory and archive controls are **not** duplicated — mentors are created in Settings and archived in Students. That split is deliberate: archive is FR-5 and applies identically to both roles, so it belongs in one place, with the list it acts on.

- [ ] **Step 4: Add O-14 to the open-points table**

Modify `docs/interview-and-prd.md` §5. Match the existing row shape (`| O-n | Question | Current assumption | Status |`) used by O-10 through O-13.

The row must say: **the theme switch maps to no FR.** `CLAUDE.md` states a change mapping to no FR does not belong in the repo. The assumption taken is that finishing ADR-0002 is wanted — support nobody can reach is not support, and the dark tokens ship either way. Status: mentor sign-off outstanding, non-blocking; the theme layer is kept in commits separate from the FR-3 registration move so a "no" reverts cleanly.

- [ ] **Step 5: Add ADR-0021 to design-system §14**

Modify `docs/design-system.md` §14's table, after the ADR-0020 row added last PR:

```markdown
| [0021](adr/0021-theme-persistence-by-cookie.md) | Theme persistence by server-readable cookie; dark becomes user-reachable (§3.3) |
```

- [ ] **Step 6: Verify the docs are internally consistent**

```bash
grep -n "O-14" docs/interview-and-prd.md docs/superpowers/specs/2026-08-04-settings-page-design.md
grep -rn "0021\|0022" docs/adr/ docs/design-system.md | grep -v Binary
```

Expected: O-14 appears in both the PRD and the spec; both new ADR files exist and 0021 is linked from §14. No task runs code here, so there is nothing else to verify.

- [ ] **Step 7: Commit**

```bash
git add docs/adr/0021-theme-persistence-by-cookie.md docs/adr/0022-settings-as-the-registration-home.md docs/interview-and-prd.md docs/design-system.md
git commit -m "docs(adr): record theme-by-cookie (0021) and Settings as the registration home (0022)"
```

---

### Task 2: The theme contract and the CSS override layer

**Files:**
- Create: `apps/web/lib/theme.ts`
- Modify: `apps/web/app/globals.css`
- Modify: `docs/design-system.md` §3.3
- Test: `apps/web/test/theme-tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces — every later task imports from `@/lib/theme`:
  - `THEME_COOKIE: "irp-theme"`
  - `THEMES: readonly ["light", "dark", "system"]`
  - `type Theme = "light" | "dark" | "system"`
  - `parseTheme(value: string | undefined): Theme` — returns `"system"` for anything unrecognised, including `undefined`

- [ ] **Step 1: Write the failing test for the parser**

Create `apps/web/test/theme-tokens.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES, THEME_COOKIE, parseTheme } from "@/lib/theme";

describe("parseTheme", () => {
  it("accepts exactly the three offered values", () => {
    expect(THEMES).toEqual(["light", "dark", "system"]);
    for (const theme of THEMES) {
      expect(parseTheme(theme)).toBe(theme);
    }
  });

  it("degrades anything else to system, so a malformed cookie cannot reach a DOM attribute", () => {
    for (const bad of [undefined, "", "purple", "DARK", "light ", "system;", "<script>"]) {
      expect(parseTheme(bad)).toBe("system");
    }
  });

  it("names the cookie once, so the layout and the action cannot disagree", () => {
    expect(THEME_COOKIE).toBe("irp-theme");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/theme-tokens.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/theme"`.

- [ ] **Step 3: Write the module**

Create `apps/web/lib/theme.ts`:

```ts
/**
 * The theme contract, in one place because three consumers must agree: the root
 * layout (reads the cookie, stamps the attribute), the Server Action (writes the
 * cookie), and the client control (renders the options).
 *
 * Deliberately free of `next/*` imports and of `server-only` — the client
 * control imports THEMES and Theme, and a server-only marker here would make
 * that a build error.
 */
export const THEME_COOKIE = "irp-theme";

export const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];

/**
 * The single gate between untrusted input and a DOM attribute. Written as an
 * explicit disjunction rather than `THEMES.includes(value as Theme)` so that
 * TypeScript narrows `value` itself and no cast is needed — a cast here would
 * be asserting exactly the thing this function exists to check.
 *
 * Anything unrecognised degrades to "system", which is also the no-cookie
 * default, so a tampered or stale cookie is indistinguishable from a first
 * visit rather than being an error state to handle.
 */
export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/theme-tokens.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing parity test for the CSS**

Append to `apps/web/test/theme-tokens.test.ts`:

```ts
/**
 * The dark token block appears TWICE in globals.css — once inside
 * `@media (prefers-color-scheme: dark)` for "follow the OS", once as
 * `:root[data-theme="dark"]` for an explicit choice. CSS cannot combine a media
 * query with a selector list and this project has no preprocessor, so the
 * duplication is inherent.
 *
 * It is also dangerous. design-system §3 states 35 pairs pass WCAG AA and "do
 * not substitute values": a copy that drifts breaks AUDITED contrast silently —
 * nothing renders visibly wrong, the numbers simply are no longer the ones that
 * were checked. This test is why the duplication is acceptable.
 */
describe("globals.css dark token blocks", () => {
  const css = readFileSync(
    path.join(import.meta.dirname, "..", "app", "globals.css"),
    "utf8",
  );

  function darkBlocks(source: string): string[] {
    const blocks = [...source.matchAll(/\/\* dark-tokens:start \*\/([\s\S]*?)\/\* dark-tokens:end \*\//g)];
    // Whitespace-normalised so indentation differences between the two nesting
    // depths (inside a media query vs at top level) are not treated as drift.
    return blocks.map((m) => m[1]!.replace(/\s+/g, " ").trim());
  }

  it("has exactly two marked dark blocks", () => {
    expect(darkBlocks(css)).toHaveLength(2);
  });

  it("keeps the two blocks byte-identical after whitespace normalisation", () => {
    const [mediaQuery, explicit] = darkBlocks(css);
    expect(explicit).toBe(mediaQuery);
  });

  it("actually carries the §3.3 tokens, so an empty pair cannot pass vacuously", () => {
    const [block] = darkBlocks(css);
    expect(block).toContain("--bg: #121212");
    expect(block).toContain("--st-missed: #ed7473");
    // 13 declarations in §3.3's dark table.
    expect(block!.match(/--[a-z-]+:/g)).toHaveLength(13);
  });
});
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/theme-tokens.test.ts`
Expected: FAIL on "has exactly two marked dark blocks" — received `0`, because the markers do not exist yet.

- [ ] **Step 7: Restructure globals.css**

Modify `apps/web/app/globals.css`. Replace the existing `@media (prefers-color-scheme: dark) { :root { ... } }` block with the three rules below. **Copy the hex values from the file you are editing — do not retype them from this plan.** The values shown here are for orientation only.

```css
/* docs/design-system.md §3.3. Light is the default (ADR-0002); dark is
   supported, never the default. §3.3's canvas is deliberately chroma-0
   near-black (#121212 is R=G=B=18) — surfaces lift toward indigo, the
   canvas does not.

   ADR-0021 made dark user-reachable. Three rules, and THE ORDER MATTERS:

     1. :root above — light, always the base.
     2. the media query below — "follow the OS", suppressed by
        :not([data-theme="light"]) when the user has explicitly chosen light.
     3. :root[data-theme="dark"] LAST — an explicit dark choice must beat an
        OS that says light, which it can only do by coming after the query.

   No attribute at all means "system", which is why the media query needs no
   [data-theme="system"] case.

   The block is duplicated because CSS cannot combine a media query with a
   selector list and there is no preprocessor here. test/theme-tokens.test.ts
   asserts the two copies stay identical — do not edit one without the other. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* dark-tokens:start */
    --bg: #121212;
    --surface: #1c1e23;
    --surface-sunk: #16171b;
    --line: #313339;
    --line-strong: #656974;
    --ink: #f2f3f6;
    --ink-muted: #a7aab4;
    --primary: #8a9ff0;
    --primary-weak: #262c45;
    --st-ok: #65c98c;
    --st-late: #eeac53;
    --st-absent: #9a9eaa;
    --st-missed: #ed7473;
    /* dark-tokens:end */
  }
}

:root[data-theme="dark"] {
  /* dark-tokens:start */
  --bg: #121212;
  --surface: #1c1e23;
  --surface-sunk: #16171b;
  --line: #313339;
  --line-strong: #656974;
  --ink: #f2f3f6;
  --ink-muted: #a7aab4;
  --primary: #8a9ff0;
  --primary-weak: #262c45;
  --st-ok: #65c98c;
  --st-late: #eeac53;
  --st-absent: #9a9eaa;
  --st-missed: #ed7473;
  /* dark-tokens:end */
}
```

> **`--st-review: var(--primary)` is deliberately NOT inside the marked blocks.** It is an alias, not a value: it resolves to whichever `--primary` is in scope, so it needs no dark-specific copy and would make the 13-declaration count wrong. Leave it where the light `:root` defines it. If the existing dark block currently repeats it, drop that line — and confirm by grepping for `--st-review` after the edit.

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/theme-tokens.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 9: Prove the parity test actually fails when the blocks drift**

A gate that has never been seen red is not a gate. Temporarily change one hex in the **second** block only:

```bash
# change --bg: #121212 to --bg: #121213 inside :root[data-theme="dark"] only
pnpm --filter @irp/web exec vitest run test/theme-tokens.test.ts
```

Expected: FAIL on "keeps the two blocks byte-identical". **Revert the change** and re-run to confirm PASS. Do not commit the deliberate break.

- [ ] **Step 10: Verify dark is now reachable by hand**

```bash
cd apps/web; pnpm dev
```

In the browser devtools, on `http://localhost:3000/signin`, set `data-theme="dark"` on the `<html>` element. The page must go dark. Set `data-theme="light"` with the OS in dark mode: the page must go light. Remove the attribute: the page must follow the OS again.

- [ ] **Step 11: Update design-system §3.3**

Modify `docs/design-system.md` §3.3. After the dark token table, record the contract:

- Dark is user-reachable as of ADR-0021, selected by `data-theme` on `<html>`
- `data-theme="dark"` forces dark; `data-theme="light"` forces light; **no attribute means follow the OS**
- The rule order is load-bearing, and why
- The token block is duplicated, and `apps/web/test/theme-tokens.test.ts` is what keeps the copies honest

- [ ] **Step 12: Full verification and commit**

```bash
pnpm --filter @irp/web test
pnpm typecheck
pnpm lint
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build
git add apps/web/lib/theme.ts apps/web/app/globals.css apps/web/test/theme-tokens.test.ts docs/design-system.md
git commit -m "feat(web): add the data-theme override layer, with a token-parity test (ADR-0021)"
```

---

### Task 3: The root layout stamps `data-theme`

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Test: `apps/web/test/root-layout.test.tsx`

**Interfaces:**
- Consumes: `THEME_COOKIE`, `parseTheme` from `@/lib/theme` (Task 2).
- Produces: `<html data-theme>` is present and correct on every server-rendered page. Later tasks rely on the attribute existing; the client control in Task 5 mutates the same attribute.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/root-layout.test.tsx`:

```tsx
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// next/headers' cookies() is async in Next 16 and only resolves inside a request
// scope, so it is mocked. The value under test is what layout.tsx DOES with the
// cookie, not next/headers itself.
const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies }));

// next/font/google reaches the network at build time and returns a font object;
// a stub keeps this a unit test.
vi.mock("next/font/google", () => ({
  Plus_Jakarta_Sans: () => ({ variable: "--font-jakarta" }),
  IBM_Plex_Mono: () => ({ variable: "--font-plex-mono" }),
}));
vi.mock("../app/globals.css", () => ({}));

function mockCookie(value: string | undefined): void {
  cookies.mockResolvedValue({
    get: (name: string) => (name === "irp-theme" && value !== undefined ? { name, value } : undefined),
  });
}

async function renderLayout(): Promise<string> {
  const { default: RootLayout } = await import("@/app/layout");
  return renderToStaticMarkup(await RootLayout({ children: null }));
}

describe("RootLayout data-theme stamping", () => {
  it("stamps dark when the cookie says dark", async () => {
    mockCookie("dark");
    expect(await renderLayout()).toContain('data-theme="dark"');
  });

  it("stamps light when the cookie says light, so an OS in dark mode is overridden", async () => {
    mockCookie("light");
    expect(await renderLayout()).toContain('data-theme="light"');
  });

  it("omits the attribute entirely for system, leaving the media query in charge", async () => {
    mockCookie("system");
    expect(await renderLayout()).not.toContain("data-theme");
  });

  it("omits the attribute when there is no cookie at all — a first visit follows the OS", async () => {
    mockCookie(undefined);
    expect(await renderLayout()).not.toContain("data-theme");
  });

  it("omits the attribute for a tampered value rather than stamping it", async () => {
    mockCookie('dark" onload="alert(1)');
    const html = await renderLayout();
    expect(html).not.toContain("onload");
    expect(html).not.toContain("data-theme");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/root-layout.test.tsx`
Expected: FAIL — the first three cases fail because `RootLayout` is not async and stamps nothing.

- [ ] **Step 3: Modify the layout**

Modify `apps/web/app/layout.tsx`. Add the imports and make `RootLayout` async:

```tsx
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
```

Replace `RootLayout` with:

```tsx
/**
 * ASSUMPTION: O-14 — the theme switch maps to no FR and closes ADR-0002.
 *
 * Reading the cookie HERE, on the server, is the whole point: the attribute is
 * in the initial HTML, so there is no flash of the wrong theme and no blocking
 * inline script. See ADR-0021.
 *
 * Known cost, accepted: a cookie read makes the root layout dynamic, so
 * /_not-found and /not-registered are no longer prerendered (they show as `ƒ`
 * rather than `○` in `next build` output). Stamping a wrapper <div> instead
 * would keep them static — custom properties inherit — but <body>'s own canvas
 * sits outside that wrapper, so the page edges would keep the previous theme.
 *
 * "system" deliberately stamps NOTHING. An absent attribute is what lets
 * globals.css's `@media (prefers-color-scheme: dark)` rule apply, so following
 * the OS needs no value of its own.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${plexMono.variable}`}
      {...(theme !== "system" && { "data-theme": theme })}
    >
      <body>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/root-layout.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Confirm the documented build-output change actually happens**

```bash
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build
```

Expected: the route table now shows `ƒ /_not-found` and `ƒ /not-registered` where it previously showed `○`. **This is the change ADR-0021 predicted, not a regression.** If they are still `○`, the cookie read is not reached and the stamping is dead code — investigate before continuing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/test/root-layout.test.tsx
git commit -m "feat(web): stamp data-theme on <html> from the theme cookie (ADR-0021)"
```

---

### Task 4: The Server Action that writes the cookie

**Files:**
- Create: `apps/web/app/(app)/settings/theme-actions.ts`
- Test: `apps/web/test/theme-actions.test.ts`

**Interfaces:**
- Consumes: `THEME_COOKIE`, `parseTheme`, `type Theme` from `@/lib/theme` (Task 2).
- Produces: `setTheme(value: string): Promise<{ error: string } | null>` — `null` on success, `{ error }` on a rejected value. Task 5's control calls it.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/theme-actions.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies }));

const set = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  cookies.mockResolvedValue({ set });
});

async function setTheme(value: string) {
  const mod = await import("@/app/(app)/settings/theme-actions");
  return mod.setTheme(value);
}

describe("setTheme", () => {
  it("writes each offered value", async () => {
    for (const theme of ["light", "dark", "system"]) {
      set.mockClear();
      expect(await setTheme(theme)).toBeNull();
      expect(set).toHaveBeenCalledTimes(1);
      expect(set.mock.calls[0]![0]).toMatchObject({ name: "irp-theme", value: theme });
    }
  });

  it("sets the attributes the cookie needs to survive and stay server-only", async () => {
    await setTheme("dark");
    expect(set.mock.calls[0]![0]).toMatchObject({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  });

  it("rejects an unknown value and writes NOTHING", async () => {
    const result = await setTheme("purple");
    expect(result).not.toBeNull();
    expect(result?.error).toMatch(/theme/i);
    // The important half: a rejected value must not reach the cookie, because
    // the cookie's value is stamped straight into a DOM attribute.
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects a value that only looks close", async () => {
    for (const bad of ["DARK", "light ", "", "system;path=/"]) {
      set.mockClear();
      expect(await setTheme(bad)).not.toBeNull();
      expect(set).not.toHaveBeenCalled();
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/theme-actions.test.ts`
Expected: FAIL — cannot resolve `@/app/(app)/settings/theme-actions`.

- [ ] **Step 3: Write the action**

Create `apps/web/app/(app)/settings/theme-actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

/**
 * Persists the theme choice. ADR-0021.
 *
 * No `revalidatePath`: the control has already set the attribute on the live
 * document, so the DOM is correct before this resolves. Revalidating would
 * re-render the tree for no change and show as a flicker — §10 budgets
 * transitions at 150-250ms and a theme switch should be instant.
 *
 * `httpOnly: true` because only the server ever READS this cookie. The control
 * receives the current value as a prop, so the client never needs to parse it,
 * and keeping it off `document.cookie` removes it as a script-reachable surface.
 */
export async function setTheme(value: string): Promise<{ error: string } | null> {
  // parseTheme degrades anything unrecognised to "system", so a value that does
  // not survive the round trip was not one we offer. Comparing against the
  // parser rather than re-listing the options keeps one source of truth: the
  // cookie's value is stamped directly into a DOM attribute by layout.tsx, so
  // this is the gate that matters.
  const theme = parseTheme(value);
  if (theme !== value) {
    return { error: "That is not a theme this app offers." };
  }

  (await cookies()).set({
    name: THEME_COOKIE,
    value: theme,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/theme-actions.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(app)/settings/theme-actions.ts" apps/web/test/theme-actions.test.ts
git commit -m "feat(web): add the setTheme server action, rejecting values it does not offer"
```

---

### Task 5: The theme control

**Files:**
- Create: `apps/web/app/(app)/settings/theme-control.tsx`
- Test: `apps/web/test/theme-control.test.tsx`

**Interfaces:**
- Consumes: `THEMES`, `type Theme` from `@/lib/theme` (Task 2); `setTheme` from `./theme-actions` (Task 4).
- Produces: `<ThemeControl current={theme} />` — a client component. Task 6's page renders it.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/theme-control.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeControl } from "@/app/(app)/settings/theme-control";

const { setTheme } = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock("@/app/(app)/settings/theme-actions", () => ({ setTheme }));

beforeEach(() => {
  vi.clearAllMocks();
  setTheme.mockResolvedValue(null);
  delete document.documentElement.dataset.theme;
});

describe("ThemeControl", () => {
  it("marks the current choice from its server-supplied prop", () => {
    render(<ThemeControl current="dark" />);
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
  });

  it("offers a text label per option, never colour alone (§12)", () => {
    render(<ThemeControl current="system" />);
    for (const name of ["Light", "Dark", "Follow system"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
  });

  it("stamps the attribute IMMEDIATELY on choose, before the action resolves", () => {
    // A theme switch that waits for a round trip reads as broken. The action is
    // left unresolved here on purpose: the DOM must already be right.
    setTheme.mockReturnValue(new Promise(() => {}));
    render(<ThemeControl current="system" />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("REMOVES the attribute for system rather than setting it to a string", () => {
    render(<ThemeControl current="dark" />);
    document.documentElement.dataset.theme = "dark";
    fireEvent.click(screen.getByRole("radio", { name: "Follow system" }));
    // data-theme="system" would in fact still work — the media query's
    // :not([data-theme="light"]) matches it. But absence is the contract the
    // server side uses (layout.tsx omits the attribute for system), and having
    // the client agree means one shape to reason about rather than two that
    // happen to behave alike.
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("persists the choice through the action", async () => {
    render(<ThemeControl current="system" />);
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith("light");
    });
  });

  it("surfaces a rejection instead of silently keeping the new look", async () => {
    setTheme.mockResolvedValue({ error: "That is not a theme this app offers." });
    render(<ThemeControl current="system" />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/not a theme/i);
    });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/theme-control.test.tsx`
Expected: FAIL — cannot resolve `@/app/(app)/settings/theme-control`.

- [ ] **Step 3: Write the control**

Create `apps/web/app/(app)/settings/theme-control.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { THEMES, type Theme } from "@/lib/theme";
import { setTheme } from "./theme-actions";

/**
 * ASSUMPTION: O-14 — the theme switch maps to no FR and closes ADR-0002.
 *
 * A radio group, not a select: three mutually exclusive options that all fit on
 * screen, so every choice is visible without opening anything, and the platform
 * supplies arrow-key navigation and the focus ring §12 requires. §9 bans
 * reinvented form controls.
 *
 * The attribute is written to the live document BEFORE the action is awaited.
 * That is deliberate: the cookie is for the next request, and waiting for a
 * server round trip to repaint would make the switch feel broken. The server
 * and the DOM converge because both derive from the same three values.
 */
const LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "Follow system",
};

const HINT: Record<Theme, string> = {
  light: "Always light, whatever this device is set to.",
  dark: "Always dark, whatever this device is set to.",
  system: "Match whatever this device is set to. The default.",
};

export function ThemeControl({ current }: { current: Theme }) {
  const [selected, setSelected] = useState<Theme>(current);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function choose(next: Theme): void {
    setSelected(next);
    setError(null);

    // "system" REMOVES the attribute rather than setting it: an absent
    // data-theme is what lets globals.css's prefers-color-scheme query apply.
    // Setting data-theme="system" would match no rule and pin the light base.
    if (next === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = next;
    }

    startTransition(async () => {
      const result = await setTheme(next);
      if (result !== null) {
        // The look already changed; say so rather than reverting under the
        // reader's cursor. The cookie simply did not persist, and the next
        // full load will show that.
        setError(`${result.error} This device will go back to ${LABEL[current]} on reload.`);
      }
    });
  }

  return (
    <fieldset className="flex flex-col gap-3 border-0 p-0">
      <legend className="sr-only">Theme</legend>
      {THEMES.map((theme) => (
        <label key={theme} className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="theme"
            value={theme}
            checked={selected === theme}
            onChange={() => { choose(theme); }}
            className="mt-1"
          />
          <span>
            <span className="block text-sm" style={{ color: "var(--ink)" }}>
              {LABEL[theme]}
            </span>
            <span className="block text-xs" style={{ color: "var(--ink-muted)" }}>
              {HINT[theme]}
            </span>
          </span>
        </label>
      ))}
      {error !== null && (
        <p role="alert" className="text-sm" style={{ color: "var(--st-missed)" }}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
```

The panel heading comes from `Panel`'s own `title` prop in Task 6, so this component renders no label of its own.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/theme-control.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(app)/settings/theme-control.tsx" apps/web/test/theme-control.test.tsx
git commit -m "feat(web): add the theme radio group, stamping the DOM before it persists"
```

---

### Task 6: The Settings page and the bottom-pinned sidebar entry

The page and the sidebar link land in **one task**: `typedRoutes` validates every `<Link href>` against routes that exist, so `href: "/settings"` does not compile until `settings/page.tsx` does.

**Files:**
- Create: `apps/web/app/(app)/settings/page.tsx`
- Modify: `apps/web/components/app-frame/sidebar.tsx`
- Modify: `docs/design-system.md` §6
- Test: `apps/web/test/settings-page.test.tsx`
- Test: `apps/web/test/sidebar.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `ThemeControl` (Task 5), `parseTheme`/`THEME_COOKIE` (Task 2), `getCurrentUserOrRedirect`/`apiClient` from `@/lib/api-client`, `listBatches` from `@irp/client`, and `RegisterForm`/`CreateBatchForm` from `@/app/(app)/students/forms`.
- Produces: the `/settings` route. Task 7 removes the two panels from Students, relying on them rendering here.

- [ ] **Step 1: Write the failing test for the page**

Create `apps/web/test/settings-page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SettingsPage from "@/app/(app)/settings/page";

const { getCurrentUserOrRedirect, apiClient } = vi.hoisted(() => ({
  getCurrentUserOrRedirect: vi.fn(),
  apiClient: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ getCurrentUserOrRedirect, apiClient }));

// The page reads listBatches for RegisterForm's batch select; the forms' own
// actions call createUser/createBatch. All four are mocked so the whole tree
// runs with no client and no network — the students-page.test.tsx pattern.
const { listBatches, createUser, createBatch } = vi.hoisted(() => ({
  listBatches: vi.fn(),
  createUser: vi.fn(),
  createBatch: vi.fn(),
}));
vi.mock("@irp/client", () => ({ listBatches, createUser, createBatch }));

const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ADMIN_USER = { id: "1", email: "m@x.test", displayName: "Dev Mentor", role: "Admin" as const };
const STUDENT_USER = { id: "2", email: "s@x.test", displayName: "Dev Student", role: "Student" as const };
const BATCH = { id: "b1", name: "Batch 1", startDate: "2026-05-10", endDate: "2026-11-09" };

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.mockResolvedValue({});
  listBatches.mockResolvedValue({ data: [BATCH], error: undefined });
  cookies.mockResolvedValue({ get: () => ({ name: "irp-theme", value: "dark" }) });
});

describe("SettingsPage", () => {
  it("shows Appearance to a mentor", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    render(await SettingsPage());
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("shows Appearance to a student — it must NOT redirect them away", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT_USER);
    render(await SettingsPage());
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("shows Register and Create batch to a mentor", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    render(await SettingsPage());
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
    expect(screen.getByLabelText("Batch name")).toBeInTheDocument();
  });

  it("omits Register and Create batch from a student's markup entirely", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT_USER);
    render(await SettingsPage());
    // Absent, not hidden: the assertion is that the admin controls were never
    // serialised into a student's page, which CSS hiding would not give.
    expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Batch name")).not.toBeInTheDocument();
  });

  it("does not even fetch batches for a student", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT_USER);
    render(await SettingsPage());
    // A student is not authorised to list batches. Gating only the RENDER would
    // still issue the request and could surface a 403 on their settings page.
    expect(listBatches).not.toHaveBeenCalled();
  });

  it("falls back to system when no theme cookie is set", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT_USER);
    cookies.mockResolvedValue({ get: () => undefined });
    render(await SettingsPage());
    expect(screen.getByRole("radio", { name: "Follow system" })).toBeChecked();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/settings-page.test.tsx`
Expected: FAIL — cannot resolve `@/app/(app)/settings/page`.

- [ ] **Step 3: Write the page**

Create `apps/web/app/(app)/settings/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { listBatches } from "@irp/client";
import { getCurrentUserOrRedirect, apiClient } from "@/lib/api-client";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { RegisterForm, CreateBatchForm } from "../students/forms";
import { ThemeControl } from "./theme-control";

/**
 * Settings — appearance for everyone, registration for mentors (FR-3).
 * ADR-0021 (theme by cookie), ADR-0022 (registration lives here).
 *
 * THE GATING PATTERN HERE IS NEW AND DELIBERATE. Every other mentor page
 * bounces the whole route:
 *
 *   if (user.role !== "Admin") redirect("/");
 *
 * This page must NOT — a Student needs it for the theme. So it gates by
 * SECTION, and it gates the READ as well as the render: a Student is not
 * authorised to list batches, so calling listBatches for them would surface a
 * 403 on their own settings page. The early return below is what keeps that
 * request from being issued at all.
 */
export default async function SettingsPage() {
  const user = await getCurrentUserOrRedirect();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  const appearance = (
    <Panel title="Appearance">
      <ThemeControl current={theme} />
    </Panel>
  );

  if (user.role !== "Admin") {
    return (
      <div>
        <PageTitle>Settings</PageTitle>
        <div className="max-w-[640px]">{appearance}</div>
      </div>
    );
  }

  const client = await apiClient();
  const { data: batches, error } = await listBatches({ client });
  const batchOptions = (batches ?? []).map((b) => ({ id: b.id, name: b.name }));

  return (
    <div>
      <PageTitle>Settings</PageTitle>

      {error !== undefined && (
        <div className="mb-6">
          <Panel>
            <p role="alert" style={{ color: "var(--st-missed)" }}>
              {error.detail ?? error.title ?? "Something went wrong."}
            </p>
          </Panel>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {appearance}

        <Panel title="Register">
          <RegisterForm batches={batchOptions} />
        </Panel>

        <Panel title="Create batch">
          <CreateBatchForm />
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/settings-page.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing sidebar test**

Create `apps/web/test/sidebar.test.tsx` (if a sidebar test already exists, add these cases to it instead):

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/app-frame/sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("Sidebar Settings entry", () => {
  it("offers Settings to a mentor", () => {
    render(<Sidebar role="Admin" />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("offers Settings to a student too — the theme is theirs as much as a mentor's", () => {
    render(<Sidebar role="Student" />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("renders Settings LAST, after every primary destination", () => {
    render(<Sidebar role="Admin" />);
    const labels = screen.getAllByRole("link").map((a) => a.textContent?.trim());
    expect(labels.at(-1)).toBe("Settings");
  });

  it("does not add Settings to the primary role lists", () => {
    // Students see two primary destinations (Today, My month) plus Settings.
    render(<Sidebar role="Student" />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
```

- [ ] **Step 6: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/sidebar.test.tsx`
Expected: FAIL — no link named "Settings".

- [ ] **Step 7: Add the sidebar entry**

Modify `apps/web/components/app-frame/sidebar.tsx`. After the `STUDENT_DESTINATIONS` declaration add:

```tsx
/**
 * Settings is NOT appended to either role list. Those render in document order
 * inside a `flex flex-col`, so an appended entry would sit directly under the
 * last primary destination rather than at the bottom of the column.
 *
 * It is also on BOTH roles' frames: the theme is a personal preference, and the
 * page gates its mentor-only sections itself (settings/page.tsx). A Student
 * following this link gets a page with one section, not a redirect.
 */
const SETTINGS_DESTINATION: LinkedDestination = { label: "Settings", href: "/settings" };
```

Then, immediately before the closing `</nav>`, add:

```tsx
      {/* mt-auto is what pins this to the bottom — a margin guess would drift
          as the primary list grows. The divider separates "where you work"
          from "how it looks". */}
      <div
        className="mt-auto border-t pt-1"
        style={{ borderColor: "var(--line)" }}
      >
        <Link
          href={SETTINGS_DESTINATION.href}
          aria-current={isActive(pathname, SETTINGS_DESTINATION.href) ? "page" : undefined}
          className="nav-item"
          data-active={isActive(pathname, SETTINGS_DESTINATION.href) || undefined}
        >
          {SETTINGS_DESTINATION.label}
        </Link>
      </div>
```

- [ ] **Step 8: Run the sidebar test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/sidebar.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 9: Build, because typecheck alone cannot judge a new route**

```bash
pnpm typecheck
```

If this reports `TS2322: Type '"/settings"' is not assignable to type 'Route'`, **do not cast it.** `.next/types/routes.d.ts` is written by `next build`, not `next dev`, and predates the new route. Run:

```bash
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build
pnpm typecheck
```

Expected: the build lists `ƒ /settings` among its routes, and typecheck is then clean with no source change.

- [ ] **Step 10: Look at it**

```bash
cd apps/web; pnpm dev
```

Sign in as **Mentor (Admin)** at `http://localhost:3000`. Confirm: Settings sits at the bottom of the sidebar under a divider; the page shows Appearance, Register and Create batch; switching the theme repaints immediately; a reload keeps the new theme. Sign out, sign in as **Student**, confirm Settings shows Appearance only.

- [ ] **Step 11: Update design-system §6**

Modify `docs/design-system.md` §6's frame mock to show Settings pinned at the bottom of the 216px column, separated by a rule, and note that it appears for both roles while gating its own sections (ADR-0022).

- [ ] **Step 12: Commit**

```bash
git add "apps/web/app/(app)/settings/page.tsx" apps/web/components/app-frame/sidebar.tsx apps/web/test/settings-page.test.tsx apps/web/test/sidebar.test.tsx docs/design-system.md
git commit -m "feat(web): add the Settings page with a bottom-pinned sidebar entry (FR-3, ADR-0021, ADR-0022)"
```

---

### Task 7: Move Register and Create batch off Students

**Files:**
- Modify: `apps/web/app/(app)/students/page.tsx`
- Test: `apps/web/test/students-page.test.tsx`

**Interfaces:**
- Consumes: the Settings page from Task 6, which now renders both forms.
- Produces: nothing new. `students/forms.tsx` is **not** modified — `RegisterForm` and `CreateBatchForm` stay exported from there and are imported by Settings.

- [ ] **Step 1: Update the Students test to expect the panels gone**

Modify `apps/web/test/students-page.test.tsx`:

- Change any assertion that Register or Create batch renders into its negation. Add:

```tsx
  it("no longer carries Register or Create batch — they live in Settings now (ADR-0022)", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH], error: undefined });
    listUsers.mockResolvedValue({ data: [STUDENT_DETAIL, MENTOR_DETAIL], error: undefined });

    render(await StudentsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Batch name")).not.toBeInTheDocument();
  });

  it("keeps Transfer and People, which are the management half", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH], error: undefined });
    listUsers.mockResolvedValue({ data: [STUDENT_DETAIL, MENTOR_DETAIL], error: undefined });

    render(await StudentsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Transfer")).toBeInTheDocument();
    expect(screen.getByText("People")).toBeInTheDocument();
    expect(screen.getByText("Amaya Perera")).toBeInTheDocument();
  });

  it("sends a reader to Settings when nobody is registered yet", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH], error: undefined });
    listUsers.mockResolvedValue({ data: [], error: undefined });

    render(await StudentsPage({ searchParams: Promise.resolve({}) }));

    // The old hint pointed at a Register panel on this page. That panel is gone.
    expect(screen.getByText(/Settings/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm --filter @irp/web exec vitest run test/students-page.test.tsx`
Expected: FAIL — `queryByLabelText("Role")` still finds the select, and the empty-state hint does not mention Settings.

- [ ] **Step 3: Remove the two panels**

Modify `apps/web/app/(app)/students/page.tsx`:

1. Change the import to drop the two moved forms:

```tsx
import { TransferForm, ArchiveButton, RestoreButton } from "./forms";
```

2. Delete the `Register` and `Create batch` `<Panel>` blocks (currently `page.tsx:125-137`).

3. **Keep `listBatches` and `batchOptions`** — `TransferForm` still needs them. Only `RegisterForm`'s use of `batchOptions` goes away.

4. Update the panel-count comment above the two reads:

```tsx
  // The default view's two panels (Transfer, People) both draw from the same
  // two reads -- every active (non-archived, the default) user and every batch
  // -- rather than each panel issuing its own request. Register and Create
  // batch moved to Settings (ADR-0022); `batches` is still read because
  // Transfer needs its options.
```

5. Reword the empty state at `page.tsx:159`:

```tsx
              <EmptyState
                title="No one registered yet."
                hint="Register the first mentor or student from Settings."
              />
```

6. Update the file's top doc comment: it currently says "the four working panels". Change to two, and name ADR-0022.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @irp/web exec vitest run test/students-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Check the grid still reads correctly**

`grid-cols-2` with two panels now gives one row. Look at it:

```bash
cd apps/web; pnpm dev   # then visit /students as a mentor
```

Confirm Transfer and People sit side by side and neither looks stranded. If People's list is long, it will be the taller cell — that is fine and matches the Cycles/Roster treatment.

- [ ] **Step 6: Full verification and commit**

```bash
pnpm --filter @irp/web test
pnpm typecheck
pnpm lint
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build
git add "apps/web/app/(app)/students/page.tsx" apps/web/test/students-page.test.tsx
git commit -m "refactor(web): move Register and Create batch to Settings (FR-3, ADR-0022)"
```

---

### Task 8: The e2e guard — a scoped dark project and a persistence spec

**Files:**
- Create: `apps/web/e2e/dark-theme.spec.ts`
- Create: `apps/web/e2e/settings.spec.ts`
- Modify: `apps/web/playwright.config.ts`

**Interfaces:**
- Consumes: `/settings` (Task 6), the theme cookie contract (Tasks 2-4), and `signInAsMentor` / `signInAsStudent` from `apps/web/e2e/helpers`.
- Produces: a `chromium-dark` project scoped by `testMatch` to `dark-theme.spec.ts` only.

> **Read this before touching `playwright.config.ts`.** The spec's first draft said the dark project runs *the existing specs*. **It must not.** `mentor-flows` and `student-flows` mutate shared state — they submit an entry for today, walk a report irreversibly to Evaluated, and call `reseed()` mid-run. Running them a second time in one serial run means the second pass meets state the first consumed. That is exactly the defect that produced 24/24, 23/24, then 19/24 before `workers: 1` was pinned. Scope the dark project to one read-only spec.

- [ ] **Step 1: Write the read-only dark spec**

Create `apps/web/e2e/dark-theme.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { signInAsMentor } from "./helpers";

/**
 * The dark guard. Runs ONLY under the `chromium-dark` project
 * (playwright.config.ts scopes it by testMatch), where colorScheme: "dark"
 * makes prefers-color-scheme report dark.
 *
 * Read-only ON PURPOSE. The mutating suites (mentor-flows, student-flows)
 * submit entries, walk reports irreversibly to Evaluated, and reseed mid-run;
 * running them twice in one serial pass is the state-dependence that made this
 * suite flaky before `workers: 1` was pinned. This spec navigates and asserts
 * rendering, nothing else.
 *
 * What it can and cannot catch: it proves every view renders and its landmark
 * content is present with the OS in dark. It does NOT judge whether dark LOOKS
 * right — that is the human pass in Task 9. A test cannot tell you a border
 * vanished into a canvas.
 */
test.describe("dark theme renders every view", () => {
  test("mentor views render with the OS in dark", async ({ page }) => {
    await signInAsMentor(page);

    for (const [path, heading] of [
      ["/", "Today"],
      ["/roster", "Roster"],
      ["/review", "Review"],
      ["/cycles", "Cycles"],
      ["/students", "Students"],
      ["/settings", "Settings"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
  });

  test("the ribbon's marks are still drawn when the canvas is dark", async ({ page }) => {
    // The `future` mark is a transparent bar with a --line border: the
    // lowest-contrast element in the system and the likeliest to disappear
    // against a dark canvas. Its presence is assertable; its visibility is not.
    await signInAsMentor(page);
    await page.goto("/");
    await expect(page.getByTestId("ribbon-bar").first()).toBeVisible();
  });

  test("the theme key and its swatches survive dark", async ({ page }) => {
    await signInAsMentor(page);
    await page.goto("/");
    const key = page.getByTestId("ribbon-key");
    await expect(key).toBeVisible();
    await key.getByText("How to read this").click();
    await expect(key.getByText("On time")).toBeVisible();
  });
});
```

- [ ] **Step 2: Write the theme-persistence spec (light project)**

Create `apps/web/e2e/settings.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { signInAsMentor } from "./helpers";

/**
 * The switch itself, in the default (light) project. This is the one test that
 * proves the cookie round trip: the attribute must survive a full reload,
 * which only happens if the SERVER read the cookie and stamped it.
 */
test.describe("Settings — theme switch", () => {
  test("choosing dark stamps the attribute and survives a reload", async ({ page }) => {
    await signInAsMentor(page);
    await page.goto("/settings");

    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");

    await page.getByRole("radio", { name: "Dark" }).check();
    // Immediate, before any navigation — the control writes the DOM itself.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    // Survives only if the cookie was written AND the server stamped from it.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Put it back, so this spec leaves no state for another test to inherit.
    await page.getByRole("radio", { name: "Follow system" }).check();
    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
  });

  test("a student reaches Settings and gets Appearance without the mentor sections", async ({ page }) => {
    const { signInAsStudent } = await import("./helpers");
    await signInAsStudent(page);
    await page.goto("/settings");

    await expect(page.getByRole("radio", { name: "Follow system" })).toBeVisible();
    await expect(page.getByLabel("Role")).toHaveCount(0);
    await expect(page.getByLabel("Batch name")).toHaveCount(0);
  });
});
```

> Check `apps/web/e2e/helpers.ts` for the exact exported names before running. If the student helper is named differently, use the real name and import it at the top with `signInAsMentor` rather than dynamically.

- [ ] **Step 3: Run both to make sure they fail for the right reason**

```bash
cd apps/web
pnpm exec playwright test e2e/settings.spec.ts --reporter=line
```

Expected: the theme test FAILS (no `chromium-dark` project yet is fine — this one runs in `chromium`), or PASSES if Tasks 2-6 are complete. `dark-theme.spec.ts` will run under `chromium` too at this point, which is wrong and is what Step 4 fixes.

- [ ] **Step 4: Add the scoped dark project**

Modify `apps/web/playwright.config.ts`. Replace the `projects` array:

```ts
  projects: [
    {
      name: "chromium",
      // The dark spec belongs to chromium-dark alone. Without this ignore it
      // would also run here, in light, where its whole premise is false.
      testIgnore: /dark-theme\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // The dark guard (ADR-0021). Scoped by testMatch to ONE read-only spec —
      // NOT the whole suite. mentor-flows and student-flows mutate shared state
      // (an entry for today, a report walked irreversibly to Evaluated, a
      // reseed mid-run), so a second pass over them in the same serial run
      // meets state the first pass consumed. That is precisely the
      // state-dependence that made this suite score 24/24, 23/24 and 19/24
      // before `workers: 1` was pinned. Cost here is one extra sign-in chain,
      // not a doubled suite.
      name: "chromium-dark",
      testMatch: /dark-theme\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], colorScheme: "dark" },
    },
  ],
```

- [ ] **Step 5: Run the whole suite and confirm the split**

```bash
cd apps/web
pnpm exec playwright test --reporter=line
```

Expected: `Running N tests using 1 worker`, where N is the previous 24 plus the new specs. Every test passes. Confirm from the output that `dark-theme.spec.ts` runs **only** under `[chromium-dark]` and that no `mentor-flows` or `student-flows` test appears twice.

- [ ] **Step 6: Prove the dark project really is dark**

Temporarily add to `dark-theme.spec.ts`'s first test:

```ts
    expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true);
```

Run the suite. Expected: PASS under `chromium-dark`. **Keep this assertion** — it is one line and it is the only thing proving `colorScheme` is actually applied rather than silently ignored.

- [ ] **Step 7: Run the suite twice in a row, to confirm no new state dependence**

```bash
cd apps/web
pnpm exec playwright test --reporter=line
pnpm exec playwright test --reporter=line
```

Expected: both runs fully green. If the second differs, the new specs left state behind — the theme spec's reset step in Step 2 is what prevents that; check it ran.

- [ ] **Step 8: Commit**

```bash
git add apps/web/e2e/dark-theme.spec.ts apps/web/e2e/settings.spec.ts apps/web/playwright.config.ts
git commit -m "test(e2e): guard dark with a scoped project, and prove the theme cookie round trip"
```

---

### Task 9: The dark visual pass, remaining docs, and full verification

This is the task the spec's D5 bought. **A test cannot do it** — `dark-theme.spec.ts` proves every view renders; only a person can see that a border vanished into a canvas.

**Files:**
- Modify: whatever the pass reveals (expect `apps/web/components/**`, possibly `app/globals.css`)
- Modify: `ONBOARDING.md`, `docs/walkthrough.md`, `handoff.md`

**Interfaces:**
- Consumes: everything from Tasks 2-8.
- Produces: the merge-ready branch.

- [ ] **Step 1: Get the app running with fresh data**

```bash
$env:IRP_DB_PORT = "5433"
docker compose -f apps/api/docker-compose.yml up -d
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm --filter @irp/api run db:seed
# two terminals
cd apps/api; pnpm dev
cd apps/web; pnpm dev
```

- [ ] **Step 2: Switch to dark and walk all eleven views**

Sign in as Mentor, go to `/settings`, choose **Dark**. Then look at — actually look, do not just load:

1. `/` — mentor Today: both ribbons, the counts row, the ribbon key **expanded**
2. `/roster` — the table, a `+ Extra` pill, an `Absent` pill, the date input
3. `/review` — the empty "pick a student" state
4. `/review/<id>` — a student's days, the forward-only control, a locked day
5. `/cycles` — the table, the coloured outcome text, the cycle chips
6. `/students` — Transfer and People, the archive button
7. `/settings` — all three panels, the radio group, focus rings
8. `/signin` — **signed out**; bare frame, no app chrome
9. `/not-registered` — sign in as the unregistered dev identity
10. `/` as a Student — student home, composer, absence toggle
11. `/my-month` — the pills and the ribbon

- [ ] **Step 3: Check these specific things, which are the likely failures**

- **The ribbon's `future` mark** — a transparent bar with a `var(--line)` border. On `#121212` a `#313339` border is the lowest-contrast element in the system. Can you see which days are unreached?
- **Focus rings** — tab through the theme radios and the Register form. §12 requires a visible 2px `--primary` ring; `#8a9ff0` on `#1c1e23` should be obvious.
- **Any non-token colour.** Search for hardcoded values that will not have flipped:

```bash
grep -rn "#[0-9a-fA-F]\{6\}\|#[0-9a-fA-F]\{3\}\b" apps/web/components apps/web/app --include=*.tsx | grep -v node_modules
```

Expected: **no matches.** Every colour must come from a `var(--token)`. Any hit is a defect this pass exists to find.

- **`status-pill.tsx`** — the one component whose source mentions theme. Check every status renders legibly.
- **The `RibbonKey` swatches** — their whole job is being distinguishable. Zoom in; confirm `Partly in` still reads as a part-height bar and `Today` still shows its ring.
- **Selected/active nav** — `--primary-weak` is `#262c45` in dark. Is the current page still obviously current?

- [ ] **Step 4: Fix what you found**

Fix each defect with a **token**, never a hardcoded colour, and never by special-casing dark. If a token itself is wrong for dark, that is a design-system §3.3 change and needs the contrast re-verified — do not adjust a hex by eye.

If a defect needs a design decision rather than a fix, **log it and keep the switch**: dark is no worse than it is today, and a half-made design call in a hurry is worse than a recorded gap. Add it to `handoff.md` with what you saw.

- [ ] **Step 5: Re-run the parity test if you touched globals.css**

```bash
pnpm --filter @irp/web exec vitest run test/theme-tokens.test.ts
```

Expected: PASS. If you edited one dark block you must edit both — this is the test that catches it.

- [ ] **Step 6: Update the remaining docs**

- **`ONBOARDING.md` §8** — add the theme switch to the demo flow; note registration is now in Settings, not Students. Update the §8 troubleshooting table if the dark pass found anything a newcomer would hit.
- **`docs/walkthrough.md`** — the Students section loses two panels; add a Settings section, and say the theme switch is worth demoing because dark was unreachable before.
- **`handoff.md` §1** — a dated entry: what this slice shipped, that O-14 is outstanding, what the dark pass found, and the `chromium-dark` scoping decision with **why the dark project must never be widened to the mutating specs**.

- [ ] **Step 7: Full verification**

```bash
pnpm typecheck                                                  # 6 projects
pnpm --filter @irp/core test                                    # 113
pnpm --filter @irp/api test                                     # 269
pnpm --filter @irp/api run db:seed                              # the api suite TRUNCATEs
pnpm --filter @irp/web test                                     # 203 + this plan's new tests
pnpm lint                                                       # exit 0
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build    # note /_not-found is now ƒ
cd apps/web; pnpm exec playwright test --reporter=line          # all green, 1 worker
```

- [ ] **Step 8: Commit and open the PR**

```bash
git add -A
git commit -m "fix(web): make dark legible across every view, and document the slice"
git push -u origin feat/plan-7a-settings-page
gh pr create --base main --head feat/plan-7a-settings-page --title "feat(web): Settings page — theme switch, registration moves in, dark verified (FR-3)" --body-file <path>
```

The PR body must name **FR-3**, state that the theme maps to no FR and is logged as **O-14**, list ADR-0021 and ADR-0022, name the `/_not-found` build-output change as intended, and say what the dark pass found.

- [ ] **Step 9: Watch CI, then merge**

```bash
gh pr checks <n>
```

All six checks must pass: `images`, `infra`, and `verify` across UTC / America/New_York / Pacific/Kiritimati. `real-token` skips by design. **`Deploy` on `main` will fail at "Log in to Azure with OIDC"** — pre-existing, unrelated, waiting on the Azure/Entra provisioning in `handoff.md` §3.

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| D1 purpose / §3 route + per-section gating | 6 |
| D2 what moves | 6 (arrives), 7 (departs) |
| D3 three choices, System default | 2 (values), 5 (labels) |
| D4 cookie persistence | 2, 3, 4 |
| D5 dark verified + guard | 8, 9 |
| §2 O-14 / no FR | 1 |
| §4 sidebar bottom placement | 6 |
| §5.1 CSS three rules + order | 2 |
| §5.2 duplication + parity test | 2 |
| §5.3 read + dynamic-rendering cost | 3 |
| §5.4 write, instant DOM, validation | 4, 5 |
| §6 Students loose end (empty-state hint) | 7 |
| §7 dark pass, nine views + two bare pages | 9 |
| §8 all ten test rows | 2, 3, 4, 5, 6, 7, 8 |
| §9 two ADRs | 1 |
| §10 documentation | 1 (PRD, §14), 2 (§3.3), 6 (§6), 9 (rest) |
| §11 risks | 8 (state dependence), 9 (defects, build output) |

No gaps.

**Type consistency:** `Theme`, `THEMES`, `THEME_COOKIE`, `parseTheme` are defined once in Task 2 and used with those exact names in Tasks 3, 4, 5, 6. `setTheme(value: string): Promise<{ error: string } | null>` is defined in Task 4 and consumed with that signature in Task 5. `ThemeControl({ current }: { current: Theme })` is defined in Task 5 and used as `<ThemeControl current={theme} />` in Task 6. `LinkedDestination` in Task 6 is the interface that already exists in `sidebar.tsx:41`.

**Placeholder scan:** no `TBD`, no "add error handling", no "similar to Task N", no "write tests for the above". Every code step carries the actual code. Two deliberate flaws in an earlier draft of the pasted code — a stray indent in `theme-actions.ts` and an unused import in `theme-control.tsx` — were **removed rather than annotated**: a plan that ships code it tells you to fix is a plan that gets copied verbatim.

**One thing this plan cannot promise.** Task 9 is a human visual pass, so its outcome is unknown by construction: it may find nothing, or it may find a token that is wrong for dark. The plan handles both — fix with a token, and if a defect needs a design decision, log it and keep the switch, because dark is no worse than it is today. Do not let Task 9 silently expand into a design-system revision.
