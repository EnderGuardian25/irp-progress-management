# Plan 3 — Auth and Web Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the whole chain end to end — a browser signs in, a real JWT is minted, `apps/api` validates it with its real `jose` code path, a real `User` row is found, and that user's name renders on a real page.

**Architecture:** `apps/web` (Next.js 16, App Router) runs Auth.js v5 with two providers — Microsoft Entra for production and a dev-only provider for now. Both mint a real JWT; `apps/api` validates either against a JWKS with **no code branch**, because the only thing that differs is which JWKS `JWKS_URI` points at. The dev provider serves its own JWKS endpoint, so dev exercises `createRemoteJWKSet` — the production mechanism — every day rather than only in a dormant CI job.

**Tech Stack:** Next.js 16.2.12 · React 19.2.8 · next-auth 5.0.0-beta.32 · Tailwind CSS 4.3.3 · Playwright 1.62.0 · Vitest 4.1.10 · TypeScript 6.0.3 · jose 6.2.4

**Spec:** `docs/superpowers/specs/2026-07-29-plan-3-auth-and-web-shell-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Spec-first.** `spec/openapi.yaml` changes before any handler. This plan adds **no** endpoints, so the spec is untouched. If you think you need a new endpoint, stop and escalate.
- **Never hand-edit** `packages/types/src/`, `packages/client/src/`, or `apps/api/src/generated/`. All three are git-ignored generated output. `packages/client/package.json` **is** hand-written and tracked — editing it is allowed.
- **No hand-written `fetch` to our own API.** `apps/web` imports only from `@irp/client`.
- **Zero lint warnings.** `pnpm lint` must exit 0 with no output. `res.json()` returns `unknown` — use `res.json<T>()` with a local interface, or `@typescript-eslint/no-unsafe-member-access` fires.
- **TypeScript strict everywhere.** Relax strictness only in a generated package's own tsconfig, never in `tsconfig.base.json`.
- **Time:** store UTC, evaluate in **Asia/Colombo (UTC+05:30)**. Never read server local time.
- **Weekdays are required; weekends are optional Extra.** A weekend is never missed, never late, and never in a compliance denominator.
- **Desktop only, min 1280px** (NFR-13). No mobile layout.
- **Design tokens are verified** — use the exact hex values in Task 2. Do not invent colours. Avoid hue 20–70° (`missed`/`late`) and 140–170° (`ok`).
- **Conventional commits.** No direct commits to `main`. Branch is `feat/plan-3-auth-and-web-shell`.
- **Prove a gate fails before trusting it.** Tasks 5, 10 and 11 each require demonstrating a test red before making it green. This is not a formality — two of this repo's original four gates looked correct and did nothing.
- **Local database commands run through PowerShell, not Bash.** The Bash tool is network-sandboxed and cannot open a TCP connection to a localhost port; Prisma fails `P1001` from Bash against a healthy container. Local DB: `postgresql://irp:irp@127.0.0.1:5433/irp?schema=public`, container started with `IRP_DB_PORT=5433`.
- **`DATABASE_URL` must be in the shell env** for any `prisma` CLI command. Prisma 7 dropped implicit `.env` loading.
- **Do not add `DOM` to `tsconfig.base.json`.** It would leak browser globals into the Fastify package. `apps/web` sets its own `lib`.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `apps/web/package.json` | Package manifest, scripts, deps |
| `apps/web/tsconfig.json` | Strict + `DOM` lib + Next plugin |
| `apps/web/next.config.ts` | `transpilePackages: ['@irp/client']` |
| `apps/web/postcss.config.mjs` | Tailwind v4 plugin |
| `apps/web/vitest.config.ts` | jsdom environment, React plugin |
| `apps/web/app/globals.css` | Verified design tokens, light + dark |
| `apps/web/app/layout.tsx` | Root: `html`/`body`, fonts, tokens |
| `apps/web/app/(auth)/signin/page.tsx` | Split sign-in — ribbon left, action right |
| `apps/web/app/(auth)/not-registered/page.tsx` | Terminal 403 state |
| `apps/web/app/(app)/layout.tsx` | Topbar + sidebar frame |
| `apps/web/app/(app)/page.tsx` | Renders the authenticated user |
| `apps/web/app/api/auth/[...nextauth]/route.ts` | Auth.js route handlers |
| `apps/web/app/api/dev-jwks/route.ts` | Dev JWKS — dev mode only |
| `apps/web/components/cycle-ribbon/cycle-ribbon.tsx` | Real `CycleRibbon` (Plan 7 extends) |
| `apps/web/components/app-frame/topbar.tsx` | 56px topbar |
| `apps/web/components/app-frame/sidebar.tsx` | 216px sidebar |
| `apps/web/lib/api-client.ts` | `server-only`; cookie → token → per-request client |
| `apps/web/lib/dev-identity.ts` | Dev identities + local keypair. Excluded from prod bundle |
| `apps/web/auth.config.ts` | Edge-safe provider list + guard |
| `apps/web/auth.ts` | Full config, callbacks, prod guard |
| `apps/web/middleware.ts` | Redirect guard — UX only |
| `apps/web/e2e/signin.spec.ts` | Playwright smoke test |
| `apps/web/playwright.config.ts` | Playwright config |
| `apps/api/src/plugins/require-auth.ts` | Global fail-closed `onRequest` hook |
| `docs/adr/0010-authjs-v5-over-msal.md` | ADR |
| `docs/adr/0011-bicep-graph-extension-over-bootstrap-script.md` | ADR |
| `docs/adr/0012-dev-auth-bypass-by-issuer-swap.md` | ADR |

**Modified**

| Path | Change |
|---|---|
| `packages/client/package.json` | Add `"./client"` subpath export; `types`/`default` conditions; `build` script |
| `packages/client/tsconfig.build.json` | **Created in Task 1.** Declaration-only emit, so consumers get `.d.ts` |
| `pnpm-workspace.yaml` | `allowBuilds: sharp` — Next's optional native image dep |
| `apps/api/src/plugins/auth.ts` | Distinguish key-retrieval failure from token invalidity |
| `apps/api/src/server.ts` | Register the fail-closed hook |
| `eslint.config.mjs` | `apps/web/.next/**` ignore; JSX settings |
| `.github/workflows/ci.yml` | Web steps, Playwright job, dormant real-token job |
| `CLAUDE.md` | Pin the new versions |
| `docs/manual-setup-steps.md` | Dev-identity `INSERT`s, Entra cutover |
| `handoff.md` | Status |

---

## Task 1: Web scaffold and the `@irp/client` subpath export

**Files:**
- Modify: `packages/client/package.json`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/vitest.config.ts`, `apps/web/test/client-export.test.ts`
- Modify: `eslint.config.mjs:19-27`

**Interfaces:**
- Consumes: nothing.
- Produces: `@irp/client/client` exporting `createClient`, `createConfig`, and types `Client`, `Config`. `apps/web` package name `@irp/web`.

**Why the subpath export:** `createClient`/`createConfig` live in `packages/client/src/client/index.ts`, but `packages/client/package.json` exports only `"."`. Task 7 needs them. `packages/client/.gitignore` ignores `src/` only, so `package.json` is hand-written and tracked — this is allowed.

> **AMENDED 2026-07-29, after Task 1 ran.** Two things the original steps did not anticipate, both found by the implementer and verified fixed:
>
> 1. **`pnpm install` fails on `sharp`'s build script** — Next.js's optional native image dependency. Add `sharp: true` to `pnpm-workspace.yaml`'s `allowBuilds`, matching the existing `esbuild`/`prisma` entries.
>
> 2. **`apps/web`'s `tsc` re-typechecks `packages/client/src`.** Within one tsc Program a single set of `compilerOptions` applies to every file, including transitively-imported `.ts`. So importing the raw-TS client pulls ~15 `TS2379`/`TS2375` errors from the generated fetch runtime into `apps/web`'s own typecheck, and `skipLibCheck` cannot help — it exempts `.d.ts` only.
>
>    **Do NOT fix this by relaxing `exactOptionalPropertyTypes` in `apps/web/tsconfig.json`.** That was the first attempt and it weakens the setting for all hand-written web code, which is the strictness leak CLAUDE.md's rule exists to prevent. Instead, `packages/client` emits declarations and consumers resolve types from them:
>
>    - Create `packages/client/tsconfig.build.json` extending `./tsconfig.json` with `noEmit: false`, `emitDeclarationOnly: true`, `declaration: true`, `outDir: "./dist"`.
>    - Add `"build": "tsc -p tsconfig.build.json"` to its scripts.
>    - Change its `exports` to condition maps — `types` → `./dist/…d.ts`, `default` → `./src/…ts` — matching the pattern `packages/core/package.json` already uses. The runtime stays raw TS for the bundler; only type resolution moves.
>    - Add a **`Build @irp/client declarations`** step to `.github/workflows/ci.yml` immediately after `Build @irp/core` and **before** `Typecheck`.
>
>    Verified: `apps/web` then typechecks clean at full strictness, `dist/` is already covered by `.gitignore:2`, and the relaxation stays inside `packages/client` where the generated code lives.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/client-export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createClient, createConfig } from "@irp/client/client";
import { getCurrentUser } from "@irp/client";

describe("@irp/client subpath export", () => {
  it("exposes createClient and createConfig from the ./client subpath", () => {
    expect(typeof createClient).toBe("function");
    expect(typeof createConfig).toBe("function");
  });

  it("builds an isolated client that does not share the module singleton", () => {
    const a = createClient(createConfig({ baseUrl: "http://a.test" }));
    const b = createClient(createConfig({ baseUrl: "http://b.test" }));
    expect(a).not.toBe(b);
    expect(a.getConfig().baseUrl).toBe("http://a.test");
    expect(b.getConfig().baseUrl).toBe("http://b.test");
  });

  it("still exposes the generated SDK operations from the root export", () => {
    expect(typeof getCurrentUser).toBe("function");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```powershell
pnpm --filter @irp/web test
```

Expected: FAIL — the `@irp/web` package does not exist yet, so pnpm reports no matching project.

- [ ] **Step 3: Add the subpath export**

Replace the `exports` block in `packages/client/package.json`:

```json
{
  "name": "@irp/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^6.0.3"
  }
}
```

- [ ] **Step 4: Create `apps/web/package.json`**

```json
{
  "name": "@irp/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "typecheck": "tsc --noEmit",
    "lint": "next lint",
    "test": "vitest run",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@irp/client": "workspace:*",
    "next": "16.2.12",
    "next-auth": "5.0.0-beta.32",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "server-only": "0.0.1"
  },
  "devDependencies": {
    "@irp/types": "workspace:*",
    "@playwright/test": "1.62.0",
    "@tailwindcss/postcss": "4.3.3",
    "@testing-library/jest-dom": "7.0.0",
    "@testing-library/react": "16.3.2",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.4",
    "jose": "6.2.4",
    "jsdom": "30.0.1",
    "tailwindcss": "4.3.3",
    "typescript": "^6.0.3",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 5: Create `apps/web/tsconfig.json`**

`DOM` is added here and **only** here — `tsconfig.base.json` must stay DOM-free so browser globals never leak into the Fastify package. `lib` **replaces** the inherited value, so `ES2023` must be restated.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "noEmit": true,
    "declaration": false,
    "allowJs": true,
    "incremental": true,
    "resolveJsonModule": true,
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "e2e"]
}
```

- [ ] **Step 6: Create `apps/web/next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @irp/client is bundler-only: it ships runtime code as raw TypeScript with
  // noEmit, so Next must compile it. apps/api cannot load it at all.
  transpilePackages: ["@irp/client"],
  typedRoutes: true,
};

export default nextConfig;
```

- [ ] **Step 7: Create `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
  },
});
```

- [ ] **Step 8: Create `apps/web/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 9: Add the Next build output to the ESLint ignores**

In `eslint.config.mjs`, the `ignores` array already contains `"**/.next/**"`, which covers `apps/web/.next/`. Confirm it is present and add nothing. Then append a JSX-aware block as the **last** argument to `tseslint.config(...)`:

```js
  {
    // apps/web is React + JSX. The type-aware config above already applies;
    // this only relaxes the rules that misfire on JSX and Server Components.
    files: ["apps/web/**/*.tsx"],
    rules: {
      // Server Components are async functions returning JSX. The rule assumes
      // a Promise-returning function is awaited by its caller; React awaits it.
      "@typescript-eslint/require-await": "off",
    },
  },
```

- [ ] **Step 10: Install**

```powershell
pnpm install
```

Expected: `+ 12 packages` or similar for `apps/web`, exit 0.

- [ ] **Step 11: Run the test to verify it passes**

```powershell
pnpm --filter @irp/web test
```

Expected: PASS, 3 tests.

- [ ] **Step 12: Verify the whole workspace still typechecks and lints**

```powershell
pnpm typecheck
pnpm lint
```

Expected: both exit 0, `lint` with no output. `typecheck` now reports 5 projects.

- [ ] **Step 13: Commit**

```bash
git add packages/client/package.json apps/web eslint.config.mjs pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(web): scaffold apps/web and export the @irp/client subpath

Adds the ./client subpath export so a per-request client can be built
instead of mutating the generated module singleton, which would leak
tokens across concurrent requests. packages/client/.gitignore covers
src/ only, so package.json is hand-written and editing it does not
touch the never-hand-edit rule."
```

---

## Task 2: Design tokens, root layout, and fonts

**Files:**
- Create: `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/postcss.config.mjs`, `apps/web/test/layout.test.tsx`

**Interfaces:**
- Consumes: Task 1's scaffold.
- Produces: CSS custom properties `--bg`, `--surface`, `--surface-sunk`, `--line`, `--line-strong`, `--ink`, `--ink-muted`, `--primary`, `--primary-weak`, `--st-ok`, `--st-late`, `--st-absent`, `--st-missed`. Fonts exposed as `--font-sans` and `--font-mono`.

**Every hex below is verified** — 35 pairs pass WCAG AA and every token is in sRGB gamut (`docs/design-system.md` §3). Do not substitute values.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/layout.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageShell } from "@/app/layout";

describe("PageShell", () => {
  it("renders its children", () => {
    render(<PageShell><p>hello</p></PageShell>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("applies the font custom properties to the shell", () => {
    const { container } = render(<PageShell><span /></PageShell>);
    const shell = container.firstElementChild;
    expect(shell?.className).toContain("min-h-dvh");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```powershell
pnpm --filter @irp/web test
```

Expected: FAIL — `Failed to resolve import "@/app/layout"`.

- [ ] **Step 3: Create `apps/web/postcss.config.mjs`**

```js
export default {
  plugins: { "@tailwindcss/postcss": {} },
};
```

- [ ] **Step 4: Create `apps/web/app/globals.css`**

```css
@import "tailwindcss";

/* Verified light theme. docs/design-system.md §3.1 — 35 pairs pass WCAG AA,
   every token in sRGB gamut. Do not substitute values.
   --primary is the Bistec slot: a placeholder indigo until the brand hex
   arrives. Any replacement must avoid hue 20-70 (missed/late) and 140-170 (ok). */
:root {
  --bg: #ffffff;
  --surface: #f6f7fb;
  --surface-sunk: #fafbfe;
  --line: #dfe2e9;
  --line-strong: #898c96;
  --ink: #1b1f2a;
  --ink-muted: #5f636e;
  --primary: #3c4ba2;
  --primary-weak: #e9eefe;

  --st-ok: #267b4c;
  --st-late: #9f5c0c;
  --st-absent: #6d717e;
  --st-missed: #be2132;

  --radius-panel: 12px;
  --radius-control: 8px;
}

/* docs/design-system.md §3.3. Light is the default (ADR-0002); dark is
   supported, never the default. §3.3's canvas is deliberately chroma-0
   near-black (#121212 is R=G=B=18) — surfaces lift toward indigo, the
   canvas does not. */
/* NOTE: the dark neutrals below were wrong in the original version of this
   plan (invented, not verified). They are corrected here to match
   docs/design-system.md §3.3. */
@media (prefers-color-scheme: dark) {
  :root {
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
  }
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-sunk: var(--surface-sunk);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-primary: var(--primary);
  --color-primary-weak: var(--primary-weak);
  --color-st-ok: var(--st-ok);
  --color-st-late: var(--st-late);
  --color-st-absent: var(--st-absent);
  --color-st-missed: var(--st-missed);
  --font-sans: var(--font-jakarta);
  --font-mono: var(--font-plex-mono);
}

body {
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans), system-ui, sans-serif;
  /* Fixed scale, not fluid. Base UI 14px. docs/design-system.md §4 */
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

/* Every figure is tabular, mono or not. docs/design-system.md §4 */
.tabular, code, kbd, samp {
  font-variant-numeric: tabular-nums;
}

/* Display letter-spacing floor -0.03em. Never tighter. */
h1, h2, h3 {
  letter-spacing: -0.03em;
  text-wrap: balance;
}

:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
```

- [ ] **Step 5: Create `apps/web/app/layout.tsx`**

`PageShell` is exported separately so it is testable without Next's `html`/`body` wrapper, which React Testing Library cannot render.

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// next/font/google downloads at build time and self-hosts, so there is no
// runtime dependency on Google's CDN.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hearts Academy · IRP",
  description: "Industry Readiness Programme progress management",
};

export function PageShell({ children }: { children: ReactNode }) {
  // Desktop only, min 1280px (NFR-13). No mobile layout is provided or tested.
  return <div className="min-h-dvh min-w-[1280px]">{children}</div>;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${plexMono.variable}`}>
      <body>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

```powershell
pnpm --filter @irp/web test
```

Expected: PASS, 5 tests total.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): design tokens, root layout, and fonts

Tokens are the verified values from docs/design-system.md §3 — 35 WCAG AA
pairs, all in sRGB gamut. Light is the default per ADR-0002. PageShell is
exported separately from RootLayout so it is testable without the html/body
wrapper RTL cannot render."
```

---

## Task 3: The `CycleRibbon` component

**Files:**
- Create: `apps/web/components/cycle-ribbon/cycle-ribbon.tsx`, `apps/web/test/cycle-ribbon.test.tsx`

**Interfaces:**
- Consumes: Task 2's tokens.
- Produces:
  ```ts
  export type DayMark = "ok" | "partial" | "late" | "absent" | "missed" | "future" | "today";
  export interface RibbonDay { date: string; mark: DayMark; fill?: number; }
  export interface RibbonProps { days: RibbonDay[]; extraAfter?: string[]; label?: string; caption?: string; }
  export function CycleRibbon(props: RibbonProps): JSX.Element;
  ```

**This is the real component Plan 7 extends, not a placeholder.** Scope here is **day-mark rendering only** — no data fetching, no cycle arithmetic (that is `@irp/core`'s, already built), no interaction.

**The weekend rule is real logic, not decoration:** `days` contains **required days only** (weekdays). `extraAfter` lists dates after which a weekend `+` slot is rendered, per FR-33. An empty weekend renders nothing at all.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/cycle-ribbon.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CycleRibbon, type RibbonDay } from "@/components/cycle-ribbon/cycle-ribbon";

const days: RibbonDay[] = [
  { date: "2026-07-10", mark: "ok" },
  { date: "2026-07-13", mark: "late" },
  { date: "2026-07-14", mark: "absent" },
  { date: "2026-07-15", mark: "missed" },
  { date: "2026-07-16", mark: "partial", fill: 0.6 },
  { date: "2026-07-17", mark: "today" },
  { date: "2026-07-20", mark: "future" },
];

describe("CycleRibbon", () => {
  it("renders one slot per required day", () => {
    render(<CycleRibbon days={days} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });

  it("labels every day with its mark for assistive tech", () => {
    render(<CycleRibbon days={days} />);
    for (const d of days) {
      expect(screen.getByLabelText(`${d.date}: ${d.mark}`)).toBeInTheDocument();
    }
  });

  it("renders no weekend slot when nobody worked the weekend", () => {
    render(<CycleRibbon days={days} />);
    expect(screen.queryByLabelText(/extra/i)).not.toBeInTheDocument();
  });

  it("renders a half-width extra slot only where a weekend was worked", () => {
    render(<CycleRibbon days={days} extraAfter={["2026-07-10"]} />);
    const extras = screen.getAllByLabelText(/extra work/i);
    expect(extras).toHaveLength(1);
    // FR-33: the slot sits between the Friday and the Monday it falls between,
    // so immediately after the day it follows.
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAccessibleName(/extra work/i);
  });

  it("does not count an extra slot as a required day", () => {
    render(<CycleRibbon days={days} extraAfter={["2026-07-10"]} />);
    // 7 required + 1 extra = 8 slots, but only 7 are required days.
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByTestId("required-day-count")).toHaveTextContent("7");
  });

  it("renders the label and caption when supplied", () => {
    render(<CycleRibbon days={days} label="Cycle 2 · 10 Jul – 9 Aug" caption="8 of 10 submitted today" />);
    expect(screen.getByText("Cycle 2 · 10 Jul – 9 Aug")).toBeInTheDocument();
    expect(screen.getByText("8 of 10 submitted today")).toBeInTheDocument();
  });

  it("applies a proportional fill for a partial day", () => {
    render(<CycleRibbon days={[{ date: "2026-07-16", mark: "partial", fill: 0.6 }]} />);
    const bar = screen.getByLabelText("2026-07-16: partial").firstElementChild;
    expect(bar).toHaveStyle({ height: "60%" });
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```powershell
pnpm --filter @irp/web test cycle-ribbon
```

Expected: FAIL — `Failed to resolve import "@/components/cycle-ribbon/cycle-ribbon"`.

- [ ] **Step 3: Implement the component**

Create `apps/web/components/cycle-ribbon/cycle-ribbon.tsx`:

```tsx
export type DayMark = "ok" | "partial" | "late" | "absent" | "missed" | "future" | "today";

export interface RibbonDay {
  /** ISO date, YYYY-MM-DD. A required day (weekday) only. */
  date: string;
  mark: DayMark;
  /** 0..1, used only when mark === "partial". */
  fill?: number;
}

export interface RibbonProps {
  /** Required days only. Weekends never appear here — see extraAfter. */
  days: RibbonDay[];
  /** Dates after which a weekend Extra slot is rendered (FR-33). */
  extraAfter?: string[];
  label?: string;
  caption?: string;
}

const MARK_COLOR: Record<Exclude<DayMark, "future">, string> = {
  ok: "var(--st-ok)",
  partial: "var(--st-ok)",
  late: "var(--st-late)",
  absent: "var(--st-absent)",
  missed: "var(--st-missed)",
  today: "var(--st-ok)",
};

function DaySlot({ day }: { day: RibbonDay }) {
  const isFuture = day.mark === "future";
  const heightPct = day.mark === "partial" ? Math.round((day.fill ?? 0) * 100) : 100;

  return (
    <li
      aria-label={`${day.date}: ${day.mark}`}
      className="relative flex h-11 w-2 items-end"
      style={
        day.mark === "today"
          ? { outline: "1.5px solid var(--primary)", outlineOffset: "1px", borderRadius: "2px" }
          : undefined
      }
    >
      <span
        className="block w-full rounded-[2px]"
        style={{
          height: `${String(heightPct)}%`,
          background: isFuture ? "transparent" : MARK_COLOR[day.mark],
          border: isFuture ? "1px solid var(--line)" : undefined,
        }}
      />
    </li>
  );
}

function ExtraSlot({ after }: { after: string }) {
  // Half-width, and distinguished by FORM not colour. A sixth status colour was
  // tried and rejected: a teal at hue 200 lands within 1.01:1 luminance of the
  // ok green, indistinguishable in a dense ribbon for a colour-vision-deficient
  // user. docs/design-system.md §3.2.
  return (
    <li
      aria-label={`Extra work after ${after}`}
      className="flex h-11 w-1 items-end"
    >
      <span
        className="block w-full rounded-[2px]"
        style={{ height: "60%", borderLeft: "1px dotted var(--line-strong)" }}
      />
    </li>
  );
}

/**
 * The signature element (docs/design-system.md §7, FR-28). One bar per REQUIRED
 * day; an Extra slot appears only where a weekend was actually worked (FR-33).
 *
 * Plan 3 builds day-mark rendering only. Plan 7 extends this with real data and
 * interaction — it does not replace it. There is only ever one ribbon.
 */
export function CycleRibbon({ days, extraAfter = [], label, caption }: RibbonProps) {
  const extras = new Set(extraAfter);

  return (
    <figure
      className="rounded-[var(--radius-panel)] border p-6"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      {label !== undefined && (
        <figcaption
          className="tabular mb-3 text-xs uppercase tracking-[0.08em]"
          style={{ color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}
        >
          {label}
        </figcaption>
      )}

      <ol className="flex items-end gap-[3px]">
        {days.flatMap((day) => {
          const slots = [<DaySlot key={day.date} day={day} />];
          if (extras.has(day.date)) {
            slots.push(<ExtraSlot key={`${day.date}-extra`} after={day.date} />);
          }
          return slots;
        })}
      </ol>

      {/* Extra days never enter a compliance denominator (FR-12). */}
      <span data-testid="required-day-count" className="sr-only">
        {days.length}
      </span>

      {caption !== undefined && (
        <p className="tabular mt-3 text-xs" style={{ color: "var(--ink-muted)" }}>
          {caption}
        </p>
      )}
    </figure>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```powershell
pnpm --filter @irp/web test cycle-ribbon
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/cycle-ribbon apps/web/test/cycle-ribbon.test.tsx
git commit -m "feat(web): CycleRibbon day-mark rendering (FR-28, FR-33)

The real component Plan 7 extends, not a placeholder — two things that
resemble each other drift, and a fake ribbon whose day-mark vocabulary
later contradicts the real one is worse than no ribbon.

days[] carries required weekdays only; extraAfter renders a half-width
weekend slot only where someone worked, and an empty weekend renders
nothing. Extra is distinguished by form, never a sixth colour."
```

---

## Task 4: App frame and route groups

**Files:**
- Create: `apps/web/components/app-frame/topbar.tsx`, `apps/web/components/app-frame/sidebar.tsx`, `apps/web/app/(app)/layout.tsx`, `apps/web/test/app-frame.test.tsx`

**Interfaces:**
- Consumes: Task 2's tokens.
- Produces:
  ```ts
  export function Topbar(props: { userName: string; batchName?: string }): JSX.Element;
  export function Sidebar(props: { reviewCount?: number }): JSX.Element;
  ```

Dimensions are fixed by `docs/design-system.md` §6: topbar **56px**, sidebar **216px**, both `--surface`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/app-frame.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Topbar } from "@/components/app-frame/topbar";
import { Sidebar } from "@/components/app-frame/sidebar";

describe("Topbar", () => {
  it("shows the signed-in user's name", () => {
    render(<Topbar userName="Damian De Cruz" />);
    expect(screen.getByText("Damian De Cruz")).toBeInTheDocument();
  });

  it("shows the batch when supplied and omits it otherwise", () => {
    const { rerender } = render(<Topbar userName="A" batchName="Batch 12" />);
    expect(screen.getByText("Batch 12")).toBeInTheDocument();
    rerender(<Topbar userName="A" />);
    expect(screen.queryByText("Batch 12")).not.toBeInTheDocument();
  });

  it("is a banner landmark 56px tall", () => {
    render(<Topbar userName="A" />);
    expect(screen.getByRole("banner")).toHaveStyle({ height: "56px" });
  });
});

describe("Sidebar", () => {
  it("is a navigation landmark 216px wide", () => {
    render(<Sidebar />);
    expect(screen.getByRole("navigation")).toHaveStyle({ width: "216px" });
  });

  it("renders the primary destinations", () => {
    render(<Sidebar />);
    for (const item of ["Today", "Roster", "Review", "Cycles", "Students"]) {
      expect(screen.getByRole("link", { name: new RegExp(item) })).toBeInTheDocument();
    }
  });

  it("shows a review count badge only when there is something to review", () => {
    const { rerender } = render(<Sidebar reviewCount={3} />);
    expect(screen.getByRole("link", { name: /Review 3/ })).toBeInTheDocument();
    rerender(<Sidebar reviewCount={0} />);
    expect(screen.getByRole("link", { name: /^Review$/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```powershell
pnpm --filter @irp/web test app-frame
```

Expected: FAIL — cannot resolve `@/components/app-frame/topbar`.

- [ ] **Step 3: Create `apps/web/components/app-frame/topbar.tsx`**

```tsx
export function Topbar({ userName, batchName }: { userName: string; batchName?: string }) {
  return (
    <header
      role="banner"
      className="flex items-center justify-between border-b px-6"
      style={{ height: "56px", background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" style={{ color: "var(--primary)" }}>&#9670;</span>
        <span className="font-semibold" style={{ color: "var(--ink)" }}>
          Hearts Academy &middot; IRP
        </span>
      </div>

      <div className="flex items-center gap-6">
        {batchName !== undefined && (
          <span className="tabular" style={{ color: "var(--ink-muted)" }}>{batchName}</span>
        )}
        <span style={{ color: "var(--ink)" }}>{userName}</span>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create `apps/web/components/app-frame/sidebar.tsx`**

```tsx
import Link from "next/link";

const DESTINATIONS = [
  { href: "/", label: "Today" },
  { href: "/roster", label: "Roster" },
  { href: "/review", label: "Review" },
  { href: "/cycles", label: "Cycles" },
  { href: "/students", label: "Students" },
] as const;

export function Sidebar({ reviewCount = 0 }: { reviewCount?: number }) {
  return (
    <nav
      aria-label="Primary"
      className="flex flex-col gap-1 border-r p-4"
      style={{ width: "216px", background: "var(--surface)", borderColor: "var(--line)" }}
    >
      {DESTINATIONS.map((d) => {
        const showCount = d.label === "Review" && reviewCount > 0;
        return (
          <Link
            key={d.href}
            href={d.href}
            className="rounded-[var(--radius-control)] px-3 py-2"
            style={{ color: "var(--ink)" }}
          >
            {d.label}
            {showCount && (
              <span className="tabular ml-2" style={{ color: "var(--ink-muted)" }}>
                {reviewCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 5: Create `apps/web/app/(app)/layout.tsx`**

The frame lives here, so filing a page under `(app)` makes it framed and filing it under `(auth)` makes it bare. Route groups do not affect URLs.

**This layout does not guard.** Next.js layouts are cached across navigations and its docs warn against relying on them for authorization — see Task 9's `middleware.ts` and, authoritatively, `apps/api`.

```tsx
import type { ReactNode } from "react";
import { Topbar } from "@/components/app-frame/topbar";
import { Sidebar } from "@/components/app-frame/sidebar";
import { getCurrentUserOrRedirect } from "@/lib/api-client";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserOrRedirect();

  return (
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>
      <Topbar userName={user.displayName} />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-8" style={{ background: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
```

> **Note for the implementer:** `getCurrentUserOrRedirect` lands in Task 7. This layout will not typecheck until then. That is expected — do **not** stub it. Run only the component tests in this task; the full typecheck gate is Task 7's Step 8.

- [ ] **Step 6: Run the component tests to verify they pass**

```powershell
pnpm --filter @irp/web test app-frame
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/app-frame "apps/web/app/(app)" apps/web/test/app-frame.test.tsx
git commit -m "feat(web): app frame and route groups

56px topbar and 216px sidebar per docs/design-system.md §6. The (app)
route group carries the frame and (auth) does not, so the framed/unframed
distinction is a directory boundary rather than runtime logic.

The layout deliberately does not guard: Next.js layouts are cached across
navigations and its docs warn against relying on them for authorization."
```

---

## Task 5: Auth.js config and the two production guards

**Files:**
- Create: `apps/web/auth.config.ts`, `apps/web/auth.ts`, `apps/web/app/api/auth/[...nextauth]/route.ts`, `apps/web/test/prod-guard.test.ts`
- Create: `apps/web/.env.example`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  // auth.config.ts
  export const authConfig: NextAuthConfig;
  export function assertBypassNotInProduction(env: NodeJS.ProcessEnv): void;
  // auth.ts
  export const { handlers, auth, signIn, signOut }: NextAuthResult;
  ```

**This task carries the most dangerous thing in the plan.** A bypass reaching production is unauthenticated access to student personal data, not a recoverable bug. Both guards go in here, and **the runtime throw must be demonstrated red before it is made green.**

**`next-auth@5.0.0-beta.32` is a beta release.** That is deliberate — v4 is the `latest` tag but has no real App Router support. ADR-0010 (Task 14) records the acceptance.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/prod-guard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertBypassNotInProduction } from "@/auth.config";

describe("assertBypassNotInProduction", () => {
  it("throws when the bypass is enabled in a production build", () => {
    expect(() =>
      assertBypassNotInProduction({ NODE_ENV: "production", AUTH_DEV_BYPASS: "true" }),
    ).toThrow(/AUTH_DEV_BYPASS/);
  });

  it("names the variable and refuses to start, so the failure is unmistakable", () => {
    expect(() =>
      assertBypassNotInProduction({ NODE_ENV: "production", AUTH_DEV_BYPASS: "true" }),
    ).toThrow(/Refusing to start/);
  });

  it("permits the bypass outside production", () => {
    for (const NODE_ENV of ["development", "test"]) {
      expect(() =>
        assertBypassNotInProduction({ NODE_ENV, AUTH_DEV_BYPASS: "true" }),
      ).not.toThrow();
    }
  });

  it("permits production when the bypass is unset or not exactly 'true'", () => {
    for (const AUTH_DEV_BYPASS of [undefined, "", "false", "1", "TRUE", "yes"]) {
      expect(() =>
        assertBypassNotInProduction({ NODE_ENV: "production", AUTH_DEV_BYPASS }),
      ).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run it and CONFIRM IT FAILS — this is the gate proof**

```powershell
pnpm --filter @irp/web test prod-guard
```

Expected: FAIL — cannot resolve `@/auth.config`.

**Do not proceed until you have seen this fail.** Then, after Step 3, you will comment out the `throw` and re-run to confirm the test goes red for the *right* reason — a guard that cannot fail is worse than no guard, and in Plan 2B a gate-*proof* turned out to be the thing that could not fail.

- [ ] **Step 3: Create `apps/web/auth.config.ts`**

Edge-safe: no Node-only imports, so `middleware.ts` can use it.

```ts
import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";

/**
 * Guard one of two. A bypass reaching production is unauthenticated access to
 * student personal data, so this refuses to boot rather than degrading.
 *
 * Guard two is structural: lib/dev-identity.ts is excluded from the production
 * bundle (see auth.ts), so even a leaked env var has nothing to enable.
 *
 * Exact string comparison is deliberate — "1", "TRUE" and "yes" must NOT enable
 * a bypass, so they must not trip the guard either.
 */
export function assertBypassNotInProduction(env: NodeJS.ProcessEnv): void {
  if (env.AUTH_DEV_BYPASS === "true" && env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_DEV_BYPASS is set in a production build. Refusing to start. " +
        "This flag mints tokens with a local key and must never run in production.",
    );
  }
}

/**
 * Goes into the ENCRYPTED, HTTP-ONLY cookie. Server-only.
 *
 * Exported separately so it is directly testable — see Task 7's token-leak
 * test. Keeping it inline in a config literal would leave the invariant
 * assertable only end-to-end.
 */
export const jwtCallback: NonNullable<NextAuthConfig["callbacks"]>["jwt"] = ({
  token,
  account,
  user,
}) => {
  if (account?.access_token !== undefined) {
    token.accessToken = account.access_token;
  }
  // The dev provider returns its minted token on the user object, because a
  // Credentials sign-in produces no account.access_token.
  const devToken = (user as { devAccessToken?: string } | undefined)?.devAccessToken;
  if (devToken !== undefined) {
    token.accessToken = devToken;
  }
  return token;
};

/**
 * This return value is what auth() gives a Server Component AND what the
 * browser's GET /api/auth/session returns.
 *
 * The access token is deliberately ABSENT — exposing it here would hand the
 * browser a bearer credential and destroy the whole design (spec §4.1).
 *
 * `role` is absent too, on purpose: it would be a second source of truth
 * competing with the User row. The authoritative role comes from
 * GET /api/v1/me (spec §4.1a).
 *
 * It takes `token` and deliberately copies NOTHING off it. That is the
 * invariant Task 7 tests: given a token carrying accessToken and role, the
 * session must carry neither.
 */
export const sessionCallback: NonNullable<NextAuthConfig["callbacks"]>["session"] = ({
  session,
}) => session;

export const authConfig: NextAuthConfig = {
  providers: [
    MicrosoftEntraId({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "",
      authorization: {
        params: { scope: `openid profile email ${process.env.API_SCOPE ?? ""}`.trim() },
      },
    }),
  ],
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    // UX redirect only. NOT the security boundary — that is apps/api.
    authorized({ auth: session }) {
      return session?.user != null;
    },
    jwt: jwtCallback,
    session: sessionCallback,
  },
};
```

- [ ] **Step 4: Create `apps/web/auth.ts`**

```ts
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import { assertBypassNotInProduction, authConfig } from "./auth.config";

assertBypassNotInProduction(process.env);

const bypassEnabled = process.env.AUTH_DEV_BYPASS === "true";

// Guard two, structural: the dev module is imported only under the flag, so a
// production bundle does not contain it and a leaked env var has nothing to
// enable. Keep this as a dynamic import — a static one would bundle it always.
const devProviders: Provider[] = bypassEnabled
  ? [(await import("./lib/dev-identity")).devIdentityProvider()]
  : [];

// The callbacks live in auth.config.ts and are shared by both configs, so the
// invariant Task 7 tests is the same one production uses. Do not re-declare
// them here — a second copy is a second thing to keep in step.
const config: NextAuthConfig = {
  ...authConfig,
  providers: [...authConfig.providers, ...devProviders],
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
```

- [ ] **Step 5: Create `apps/web/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 6: Create `apps/web/.env.example`**

```bash
# apps/web configuration. Copy to .env.local for local dev (git-ignored).

# Auth.js cookie encryption. Generate with: openssl rand -base64 32
AUTH_SECRET=replace-me-with-32-random-bytes
AUTH_URL=http://localhost:3000

# Where apps/api lives. apps/web calls it server-side only.
API_BASE_URL=http://localhost:3001

# ── Dev bypass ────────────────────────────────────────────────────────────
# Mints tokens with a LOCAL key and serves its own JWKS at /api/dev-jwks.
# apps/api validates them with its real jose code path — this swaps the token
# ISSUER, it does not skip authentication.
#
# Setting this with NODE_ENV=production makes the app REFUSE TO BOOT, and the
# dev module is excluded from a production bundle regardless.
AUTH_DEV_BYPASS=true

# ── Microsoft Entra (unused while the bypass is on) ───────────────────────
AUTH_MICROSOFT_ENTRA_ID_ID=
AUTH_MICROSOFT_ENTRA_ID_SECRET=
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
API_SCOPE=api://irp-progress-management/access_as_user
```

- [ ] **Step 7: Run the test to verify it passes**

```powershell
pnpm --filter @irp/web test prod-guard
```

Expected: PASS, 4 tests.

- [ ] **Step 8: PROVE THE GATE FAILS — mandatory**

Comment out the `throw new Error(...)` block in `auth.config.ts`, leaving the `if` body empty. Re-run:

```powershell
pnpm --filter @irp/web test prod-guard
```

Expected: **FAIL**, 2 of 4 tests — "throws when the bypass is enabled in a production build" and "names the variable and refuses to start".

If it passes with the throw removed, the test asserts nothing and must be rewritten. **Restore the throw** and confirm green again before committing. Record in your task report that you performed this step and what you observed.

- [ ] **Step 9: Commit**

```bash
git add apps/web/auth.config.ts apps/web/auth.ts "apps/web/app/api/auth" apps/web/test/prod-guard.test.ts apps/web/.env.example
git commit -m "feat(web): Auth.js v5 config with two production bypass guards

Guard one: a startup throw when AUTH_DEV_BYPASS=true meets
NODE_ENV=production. Guard two: the dev module is dynamically imported
under the flag, so a production bundle does not contain it.

Demonstrated red by removing the throw — 2 of 4 tests fail — then
restored. Exact string comparison is deliberate: '1', 'TRUE' and 'yes'
do not enable a bypass, so they must not trip the guard either.

The session callback exposes neither the access token nor the role. Its
return value is what the browser's /api/auth/session returns, so a token
there would defeat the whole design; role would be a second source of
truth competing with the User row.

next-auth is pinned to 5.0.0-beta.32. v4 is the 'latest' tag but has no
real App Router support. ADR-0010 records the acceptance."
```

---

## Task 6: The dev identity provider and its JWKS endpoint

**Files:**
- Create: `apps/web/lib/dev-identity.ts`, `apps/web/app/api/dev-jwks/route.ts`, `apps/web/test/dev-identity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface DevIdentity { id: string; label: string; oid: string; email: string; name: string; }
  export const DEV_IDENTITIES: readonly DevIdentity[];
  export const DEV_ISSUER = "http://localhost:3000/api/dev-jwks";
  export function devIdentityProvider(): Provider;
  export async function mintDevToken(identity: DevIdentity, audience: string): Promise<string>;
  export async function devJwks(): Promise<{ keys: JWK[] }>;
  ```

**The design in one line:** this mints a **real** RS256 JWT with a local key and serves the matching public key as a JWKS, so `apps/api` validates it through `createRemoteJWKSet` — the exact production mechanism. Dev therefore exercises the remote-JWKS path every day, not only in the dormant CI job.

**Key lifetime:** generated once per process, held in module scope. Restarting `apps/web` invalidates outstanding sessions, which correctly presents as a 401 and a sign-out. Acceptable in dev; noted so it is not mistaken for a bug.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/dev-identity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createLocalJWKSet, jwtVerify } from "jose";
import {
  DEV_IDENTITIES,
  DEV_ISSUER,
  devJwks,
  mintDevToken,
} from "@/lib/dev-identity";

const AUD = "api://irp-progress-management";

describe("DEV_IDENTITIES", () => {
  it("offers a mentor, a student, and an unregistered identity", () => {
    expect(DEV_IDENTITIES).toHaveLength(3);
    expect(DEV_IDENTITIES.map((i) => i.oid)).toEqual([
      "dev-admin-1",
      "dev-student-1",
      "dev-unknown-1",
    ]);
  });

  it("carries no role — the User row is the only source of truth", () => {
    for (const identity of DEV_IDENTITIES) {
      expect(identity).not.toHaveProperty("role");
    }
  });
});

describe("mintDevToken", () => {
  it("mints a token the published JWKS verifies", async () => {
    const identity = DEV_IDENTITIES[0]!;
    const token = await mintDevToken(identity, AUD);
    const keySet = createLocalJWKSet(await devJwks());

    const { payload } = await jwtVerify(token, keySet, {
      issuer: DEV_ISSUER,
      audience: AUD,
      algorithms: ["RS256"],
    });

    expect(payload.oid).toBe("dev-admin-1");
  });

  it("sets the oid claim apps/api matches against User.externalId", async () => {
    for (const identity of DEV_IDENTITIES) {
      const token = await mintDevToken(identity, AUD);
      const keySet = createLocalJWKSet(await devJwks());
      const { payload } = await jwtVerify(token, keySet, {
        issuer: DEV_ISSUER,
        audience: AUD,
      });
      expect(payload.oid).toBe(identity.oid);
    }
  });

  it("is rejected when the audience does not match", async () => {
    const token = await mintDevToken(DEV_IDENTITIES[0]!, AUD);
    const keySet = createLocalJWKSet(await devJwks());
    await expect(
      jwtVerify(token, keySet, { issuer: DEV_ISSUER, audience: "api://wrong" }),
    ).rejects.toThrow();
  });
});

describe("devJwks", () => {
  it("publishes exactly one public RS256 signing key and no private material", async () => {
    const jwks = await devJwks();
    expect(jwks.keys).toHaveLength(1);
    const key = jwks.keys[0]!;
    expect(key.alg).toBe("RS256");
    expect(key.use).toBe("sig");
    expect(key.kid).toBeTypeOf("string");
    // A private RSA key would carry these. Publishing one would let anyone
    // mint tokens our own API trusts.
    for (const priv of ["d", "p", "q", "dp", "dq", "qi"]) {
      expect(key).not.toHaveProperty(priv);
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```powershell
pnpm --filter @irp/web test dev-identity
```

Expected: FAIL — cannot resolve `@/lib/dev-identity`.

- [ ] **Step 3: Create `apps/web/lib/dev-identity.ts`**

```ts
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";

/**
 * The dev bypass. It swaps the token ISSUER; it does NOT skip authentication.
 *
 * A real RS256 JWT is minted with a local key, and the matching public key is
 * published at /api/dev-jwks. apps/api validates it through createRemoteJWKSet
 * with its real jose code path — the exact production mechanism — so dev
 * exercises remote JWKS retrieval every day rather than only in CI.
 *
 * This module is imported ONLY when AUTH_DEV_BYPASS=true (see auth.ts), so it
 * is absent from a production bundle. auth.config.ts additionally refuses to
 * boot if the flag is set with NODE_ENV=production.
 */

export interface DevIdentity {
  id: string;
  label: string;
  /** Becomes the token's `oid`. apps/api matches it to User.externalId. */
  oid: string;
  email: string;
  name: string;
}

/**
 * No `role` field, deliberately. Role lives in the User row and reaches the web
 * app only via GET /api/v1/me — see spec §4.1a. Switching identity switches the
 * oid; the role follows from the database.
 *
 * dev-unknown-1 has NO User row on purpose. It must produce a 403 and land on
 * /not-registered, turning the spec's most load-bearing authorization rule into
 * something clickable rather than something only a test knows about.
 */
export const DEV_IDENTITIES: readonly DevIdentity[] = [
  { id: "mentor", label: "Mentor (Admin)", oid: "dev-admin-1", email: "mentor@dev.local", name: "Dev Mentor" },
  { id: "student", label: "Student", oid: "dev-student-1", email: "student@dev.local", name: "Dev Student" },
  { id: "unknown", label: "Unregistered user (expect 403)", oid: "dev-unknown-1", email: "nobody@dev.local", name: "Unregistered" },
];

export const DEV_ISSUER = "http://localhost:3000/api/dev-jwks";

const KID = "dev-key-1";

// Generated once per process and held here. Restarting apps/web invalidates
// outstanding sessions, which presents correctly as a 401 and a sign-out.
const keyPair = await generateKeyPair("RS256", { extractable: true });

export async function devJwks(): Promise<{ keys: JWK[] }> {
  const jwk = await exportJWK(keyPair.publicKey);
  return { keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] };
}

export async function mintDevToken(identity: DevIdentity, audience: string): Promise<string> {
  return new SignJWT({ oid: identity.oid, email: identity.email, name: identity.name })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuedAt()
    .setIssuer(DEV_ISSUER)
    .setAudience(audience)
    .setExpirationTime("8h")
    .sign(keyPair.privateKey);
}

export function devIdentityProvider(): Provider {
  return Credentials({
    id: "dev-identity",
    name: "Development identity",
    credentials: { identityId: { label: "Identity", type: "text" } },
    authorize: async (credentials) => {
      const identityId = credentials.identityId;
      if (typeof identityId !== "string") return null;

      const identity = DEV_IDENTITIES.find((i) => i.id === identityId);
      if (identity === undefined) return null;

      const audience = process.env.API_SCOPE_AUDIENCE ?? "api://irp-progress-management";

      // Handed to the jwt callback as `user.devAccessToken`, because a
      // Credentials sign-in produces no account.access_token.
      return {
        id: identity.oid,
        email: identity.email,
        name: identity.name,
        devAccessToken: await mintDevToken(identity, audience),
      };
    },
  });
}
```

- [ ] **Step 4: Create `apps/web/app/api/dev-jwks/route.ts`**

```ts
import { NextResponse } from "next/server";

/**
 * Publishes the dev public key so apps/api can validate dev-minted tokens
 * through createRemoteJWKSet — the same code path production uses.
 *
 * Returns 404 when the bypass is off, so this endpoint does not exist in a
 * normal build.
 */
export async function GET() {
  if (process.env.AUTH_DEV_BYPASS !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  const { devJwks } = await import("@/lib/dev-identity");
  return NextResponse.json(await devJwks(), {
    headers: { "cache-control": "no-store" },
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```powershell
pnpm --filter @irp/web test dev-identity
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/dev-identity.ts "apps/web/app/api/dev-jwks" apps/web/test/dev-identity.test.ts
git commit -m "feat(web): dev identity provider minting real RS256 tokens

Swaps the token issuer rather than skipping authentication. A real JWT is
signed with a local key and the public key is published at /api/dev-jwks,
so apps/api validates it through createRemoteJWKSet — the exact production
mechanism. Dev therefore exercises remote JWKS retrieval every day, not
only in the dormant CI job.

Three identities. dev-unknown-1 has no User row on purpose, so the 403
rule becomes clickable rather than test-only. None carries a role: role
lives in the User row and arrives via GET /api/v1/me.

A test asserts the JWKS publishes no private RSA material — publishing d,
p or q would let anyone mint tokens our own API trusts."
```

---

## Task 7: The server-only API client factory and the token-leak test

**Files:**
- Create: `apps/web/lib/api-client.ts`, `apps/web/test/api-client.test.ts`, `apps/web/test/token-leak.test.ts`

**Interfaces:**
- Consumes: `@irp/client/client` (Task 1), `auth.ts` (Task 5).
- Produces:
  ```ts
  export const SESSION_COOKIE_NAME: string;
  export async function readAccessToken(cookieValue: string | undefined): Promise<string>;
  export async function apiClient(): Promise<Client>;
  export async function getCurrentUserOrRedirect(): Promise<{ id: string; email: string; displayName: string; role: "Admin" | "Student" }>;
  ```

**Two things this file exists to make structural.**

First, **the token is read from the encrypted cookie, never from the session.** In Auth.js v5 the `session` callback's return value is what the browser's `GET /api/auth/session` returns, so `session.accessToken` would hand the browser a bearer token. We decrypt the JWE directly with `decode` from `next-auth/jwt`.

> **Why `decode` and not `getToken`:** `getToken` needs a request-like object whose shape is coupled to Auth.js internals and has churned across betas. `decode` takes `{ token, secret, salt }` — three values we control. The cookie name **is** the salt in Auth.js v5.

Second, **a fresh client per request.** `packages/client/src/client.gen.ts` creates a module-level singleton at import time; attaching a per-user token to it would leak tokens across concurrent requests in a Next.js server process.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/api-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { encode } from "next-auth/jwt";
import { SESSION_COOKIE_NAME, readAccessToken } from "@/lib/api-client";

const SECRET = "test-secret-at-least-32-bytes-long-xx";

async function makeCookie(payload: Record<string, unknown>): Promise<string> {
  return encode({ token: payload, secret: SECRET, salt: SESSION_COOKIE_NAME });
}

describe("readAccessToken", () => {
  it("recovers the access token from an encrypted session cookie", async () => {
    process.env.AUTH_SECRET = SECRET;
    const cookie = await makeCookie({ accessToken: "the-bearer-token", sub: "u1" });
    await expect(readAccessToken(cookie)).resolves.toBe("the-bearer-token");
  });

  it("throws when there is no cookie at all", async () => {
    process.env.AUTH_SECRET = SECRET;
    await expect(readAccessToken(undefined)).rejects.toThrow(/no session/i);
  });

  it("throws when the cookie decrypts but carries no access token", async () => {
    process.env.AUTH_SECRET = SECRET;
    const cookie = await makeCookie({ sub: "u1" });
    await expect(readAccessToken(cookie)).rejects.toThrow(/no access token/i);
  });

  it("throws rather than proceeding unauthenticated when the cookie is corrupt", async () => {
    process.env.AUTH_SECRET = SECRET;
    await expect(readAccessToken("not-a-jwe")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Write the token-leak invariant test**

Create `apps/web/test/token-leak.test.ts`. This is what turns "the token never reaches the browser" from an intention into an assertion.

```ts
import { describe, expect, it } from "vitest";
import { authConfig, jwtCallback, sessionCallback } from "@/auth.config";

// A token that carries BOTH secrets the session must never surface. If the
// session callback ever copies from the token, these tests go red.
const LOADED_TOKEN = {
  sub: "dev-admin-1",
  name: "Dev Mentor",
  email: "mentor@dev.local",
  accessToken: "eyJhbGciOiJSUzI1NiJ9.super-secret-bearer-token.sig",
  role: "ADMIN",
};

const BARE_SESSION = {
  user: { name: "Dev Mentor", email: "mentor@dev.local" },
  expires: "2026-08-01T00:00:00.000Z",
};

function invokeSession(token: Record<string, unknown>): unknown {
  // The callback's real signature carries more fields than we supply; the cast
  // narrows to what this invariant depends on.
  return (sessionCallback as (args: unknown) => unknown)({
    session: structuredClone(BARE_SESSION),
    token,
    user: undefined,
    newSession: undefined,
    trigger: "update",
  });
}

describe("the browser-visible session", () => {
  it("does not surface the access token even when the token carries one", () => {
    const serialised = JSON.stringify(invokeSession(LOADED_TOKEN));
    expect(serialised).not.toMatch(/accessToken/i);
    expect(serialised).not.toMatch(/\beyJ[A-Za-z0-9_-]{8,}/); // a JWT
    expect(serialised).not.toContain("super-secret-bearer-token");
  });

  it("does not surface a role — the User row is the only source of truth", () => {
    const serialised = JSON.stringify(invokeSession(LOADED_TOKEN));
    expect(serialised).not.toMatch(/role/i);
    expect(serialised).not.toContain("ADMIN");
  });

  it("still returns the user identity the app needs to render", () => {
    const result = invokeSession(LOADED_TOKEN) as typeof BARE_SESSION;
    expect(result.user.name).toBe("Dev Mentor");
    expect(result.user.email).toBe("mentor@dev.local");
  });
});

describe("the jwt callback", () => {
  it("stores a provider access token on the encrypted token", () => {
    const result = (jwtCallback as (args: unknown) => Record<string, unknown>)({
      token: { sub: "u1" },
      account: { access_token: "from-entra" },
      user: undefined,
    });
    expect(result.accessToken).toBe("from-entra");
  });

  it("stores the dev provider's minted token, which arrives on user not account", () => {
    const result = (jwtCallback as (args: unknown) => Record<string, unknown>)({
      token: { sub: "u1" },
      account: null,
      user: { devAccessToken: "from-dev-provider" },
    });
    expect(result.accessToken).toBe("from-dev-provider");
  });
});

describe("authConfig", () => {
  it("keeps the sign-in page pointed at our own route, not a provider URL", () => {
    expect(authConfig.pages?.signIn).toBe("/signin");
  });
});
```

> **Why this shape:** an earlier draft of this plan asserted against a
> hand-written literal — `JSON.stringify({user:{...}})` checked for a key the
> literal never had — which could not fail regardless of what the callback did.
> These tests invoke the **real** callback with a token that carries both
> secrets, so copying token→session turns them red. Caught in the pre-flight
> plan review, 2026-07-29.

- [ ] **Step 3: Run both to make sure they fail**

```powershell
pnpm --filter @irp/web test api-client token-leak
```

Expected: `api-client` FAILS (cannot resolve `@/lib/api-client`). `token-leak` may pass already — that is fine and expected; it is a regression net against a future edit to the `session` callback, not a red-then-green test.

- [ ] **Step 4: Create `apps/web/lib/api-client.ts`**

```ts
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decode } from "next-auth/jwt";
import { createClient, createConfig, type Client } from "@irp/client/client";
import { getCurrentUser } from "@irp/client";

/**
 * In Auth.js v5 the session cookie's name IS the encryption salt.
 * The __Secure- prefix applies when cookies are marked secure, i.e. production.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

/**
 * Reads the access token out of the ENCRYPTED, HTTP-ONLY session cookie.
 *
 * Deliberately NOT from the Auth.js session object: that object is what the
 * browser's GET /api/auth/session returns, so putting a bearer token in it
 * would defeat the whole design. See spec §4.1.
 *
 * Throws rather than returning undefined. A caller that silently proceeded
 * without a token would call the API unauthenticated and get a confusing 401.
 */
export async function readAccessToken(cookieValue: string | undefined): Promise<string> {
  if (cookieValue === undefined || cookieValue === "") {
    throw new Error("No session cookie — the caller is not signed in.");
  }

  const secret = process.env.AUTH_SECRET;
  if (secret === undefined || secret === "") {
    throw new Error("AUTH_SECRET is not set — the session cookie cannot be decrypted.");
  }

  const payload = await decode({
    token: cookieValue,
    secret,
    salt: SESSION_COOKIE_NAME,
  });

  const accessToken = payload?.accessToken;
  if (typeof accessToken !== "string" || accessToken === "") {
    throw new Error("The session carries no access token.");
  }
  return accessToken;
}

/**
 * A FRESH client per request. The generated @irp/client exports a module-level
 * singleton; attaching a per-user token to it would leak tokens across
 * concurrent requests in a Next.js server process. Building a new one makes
 * that impossible by construction rather than by care.
 */
export async function apiClient(): Promise<Client> {
  const jar = await cookies();
  const token = await readAccessToken(jar.get(SESSION_COOKIE_NAME)?.value);

  const baseUrl = process.env.API_BASE_URL;
  if (baseUrl === undefined || baseUrl === "") {
    throw new Error("API_BASE_URL is not set.");
  }

  return createClient(
    createConfig({ baseUrl, headers: { Authorization: `Bearer ${token}` } }),
  );
}

export interface WebUser {
  id: string;
  email: string;
  displayName: string;
  role: "Admin" | "Student";
}

/**
 * Four distinct states, not two. Routing a 403 to /signin loops forever: the
 * session is valid, so middleware sends the user straight back. See spec §8.
 */
export async function getCurrentUserOrRedirect(): Promise<WebUser> {
  const client = await apiClient();
  const { data, error, response } = await getCurrentUser({ client });

  if (data !== undefined) return data;

  if (response.status === 403) redirect("/not-registered");
  if (response.status === 401) redirect("/signin?reason=expired");

  throw new Error(
    `GET /api/v1/me failed with ${String(response.status)}: ${JSON.stringify(error)}`,
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```powershell
pnpm --filter @irp/web test api-client token-leak
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Verify the whole workspace typechecks**

Task 4's `(app)/layout.tsx` imports `getCurrentUserOrRedirect`, which now exists.

```powershell
pnpm typecheck
pnpm lint
```

Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/api-client.ts apps/web/test/api-client.test.ts apps/web/test/token-leak.test.ts
git commit -m "feat(web): server-only API client factory, token read from the JWE

Reads the access token by decrypting the HTTP-only session cookie, never
from the Auth.js session object — that object is what the browser's
/api/auth/session returns, so a token there would hand the browser a
bearer credential.

Uses decode({token,secret,salt}) rather than getToken, whose request-like
argument is coupled to Auth.js internals and has churned across betas.
The cookie name is the salt in v5.

Builds a FRESH client per request. The generated @irp/client is a
module-level singleton, so a per-user token on it would leak across
concurrent requests.

403 redirects to /not-registered, never /signin — the session is valid, so
/signin would bounce straight back and loop forever."
```

---

## Task 8: The sign-in page and the not-registered page

**Files:**
- Create: `apps/web/app/(auth)/signin/page.tsx`, `apps/web/app/(auth)/signin/dev-identity-picker.tsx`, `apps/web/app/(auth)/not-registered/page.tsx`, `apps/web/test/signin.test.tsx`

**Interfaces:**
- Consumes: `CycleRibbon` (Task 3), `DEV_IDENTITIES` (Task 6), `signIn` (Task 5).
- Produces: routes `/signin` and `/not-registered`.

The split treatment: ribbon left on `--surface`, sign-in action right. Chosen from three mockups.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/signin.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DevIdentityPicker } from "@/app/(auth)/signin/dev-identity-picker";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

describe("DevIdentityPicker", () => {
  it("offers every dev identity as its own button", () => {
    render(<DevIdentityPicker />);
    expect(screen.getByRole("button", { name: /Mentor \(Admin\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Student$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unregistered user/ })).toBeInTheDocument();
  });

  it("says plainly that the unregistered identity is expected to 403", () => {
    render(<DevIdentityPicker />);
    expect(screen.getByRole("button", { name: /expect 403/ })).toBeInTheDocument();
  });

  it("warns that this is a development bypass", () => {
    render(<DevIdentityPicker />);
    expect(screen.getByText(/development/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```powershell
pnpm --filter @irp/web test signin
```

Expected: FAIL — cannot resolve the picker module.

- [ ] **Step 3: Create the picker (a Client Component)**

Create `apps/web/app/(auth)/signin/dev-identity-picker.tsx`:

```tsx
"use client";

import { signIn } from "next-auth/react";
import { DEV_IDENTITIES } from "@/lib/dev-identity";

export function DevIdentityPicker() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs" style={{ color: "var(--st-late)" }}>
        Development sign-in. Tokens are minted with a local key; Microsoft Entra is not contacted.
      </p>

      {DEV_IDENTITIES.map((identity) => (
        <button
          key={identity.id}
          type="button"
          onClick={() => void signIn("dev-identity", { identityId: identity.id, redirectTo: "/" })}
          className="rounded-[var(--radius-control)] border px-4 py-2 text-left"
          style={{ borderColor: "var(--line-strong)", color: "var(--ink)" }}
        >
          {identity.label}
        </button>
      ))}
    </div>
  );
}
```

> **Note:** importing `DEV_IDENTITIES` into a Client Component ships the identity *list* to the browser — labels and oids, which are not secrets. The **private key never leaves the server**, because `keyPair` and `mintDevToken` are only ever called from `authorize()` on the server. Confirm this holds after Task 12's build: `grep -r "privateKey" apps/web/.next/static` must return nothing.

- [ ] **Step 4: Create the sign-in page**

Create `apps/web/app/(auth)/signin/page.tsx`:

```tsx
import { signIn } from "@/auth";
import { CycleRibbon, type RibbonDay } from "@/components/cycle-ribbon/cycle-ribbon";
import { DevIdentityPicker } from "./dev-identity-picker";

// Illustrative only. The ribbon is the real component (Plan 7 extends it with
// real data); these marks exist so the register idea lands before sign-in.
const ILLUSTRATION: RibbonDay[] = [
  { date: "2026-07-10", mark: "ok" },
  { date: "2026-07-13", mark: "ok" },
  { date: "2026-07-14", mark: "late" },
  { date: "2026-07-15", mark: "ok" },
  { date: "2026-07-16", mark: "absent" },
  { date: "2026-07-17", mark: "ok" },
  { date: "2026-07-20", mark: "partial", fill: 0.55 },
  { date: "2026-07-21", mark: "missed" },
  { date: "2026-07-22", mark: "ok" },
  { date: "2026-07-23", mark: "today" },
  { date: "2026-07-24", mark: "future" },
];

const bypassEnabled = process.env.AUTH_DEV_BYPASS === "true";

export default function SignInPage() {
  return (
    <div className="flex" style={{ minHeight: "100dvh" }}>
      <section
        className="flex flex-1 flex-col justify-center border-r px-16"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <CycleRibbon
          days={ILLUSTRATION}
          extraAfter={["2026-07-10"]}
          label="Cycle 2 · 10 Jul – 9 Aug"
        />
        <p className="mt-8 max-w-[42ch] text-base" style={{ color: "var(--ink-muted)" }}>
          A mark per working day. A page per month.
        </p>
      </section>

      <section className="flex flex-1 flex-col justify-center px-16">
        <span aria-hidden="true" className="mb-6 text-xl" style={{ color: "var(--primary)" }}>
          &#9670;
        </span>
        <h1 className="mb-2 text-2xl font-bold" style={{ color: "var(--ink)" }}>
          Hearts Academy
        </h1>
        <p className="mb-8 text-sm" style={{ color: "var(--ink-muted)" }}>
          Industry Readiness Programme
        </p>

        {bypassEnabled ? (
          <DevIdentityPicker />
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("microsoft-entra-id", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-[var(--radius-control)] px-4 py-2 font-semibold"
              style={{ background: "var(--primary)", color: "#ffffff" }}
            >
              Sign in with Microsoft
            </button>
          </form>
        )}

        <p className="tabular mt-8 text-xs" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
          Asia/Colombo &middot; UTC+05:30
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Create the not-registered page**

Create `apps/web/app/(auth)/not-registered/page.tsx`. **Terminal state — it must never link to `/signin`,** or a valid session bounces straight back and loops.

```tsx
import { signOut } from "@/auth";

export default function NotRegisteredPage() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: "100dvh" }}>
      <div className="max-w-[52ch] px-8">
        <h1 className="mb-3 text-2xl font-bold" style={{ color: "var(--ink)" }}>
          Your account is not registered
        </h1>
        <p className="mb-6 text-base" style={{ color: "var(--ink-muted)" }}>
          You signed in successfully, but no one has registered you on the programme yet.
          There is no self-registration — ask a mentor to add you, then sign in again.
        </p>

        {/* Deliberately sign-out, NOT a link to /signin. The session is valid,
            so /signin would redirect back here and loop forever. */}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button
            type="submit"
            className="rounded-[var(--radius-control)] border px-4 py-2"
            style={{ borderColor: "var(--line-strong)", color: "var(--ink)" }}
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```powershell
pnpm --filter @irp/web test signin
```

Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(auth)" apps/web/test/signin.test.tsx
git commit -m "feat(web): split sign-in page and the terminal not-registered state

Ribbon left on --surface, sign-in action right. Uses the real CycleRibbon
with illustrative marks.

/not-registered offers sign-out, never a link to /signin: the session is
valid there, so /signin would bounce straight back and loop forever. That
is the 403 trap the spec designs around rather than discovers."
```

---

## Task 9: The middleware guard and the authenticated page

**Files:**
- Create: `apps/web/middleware.ts`, `apps/web/app/(app)/page.tsx`, `apps/web/test/middleware.test.ts`

**Interfaces:**
- Consumes: `authConfig` (Task 5), `getCurrentUserOrRedirect` (Task 7).
- Produces: route `/`, and a matcher excluding `api/auth`, `signin`, `not-registered`, `_next`, static files.

**`not-registered` MUST be in the exclusion list.** If middleware guards it, a 403 user is redirected there, middleware sees a valid session, allows it — fine. But if it were *not* excluded and the session later expired, the user would bounce to `/signin` from a page meant to be terminal. Excluding it keeps the state genuinely terminal.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/middleware.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { config } from "@/middleware";

function matches(pathname: string): boolean {
  return config.matcher.some((pattern) => new RegExp(pattern).test(pathname));
}

describe("middleware matcher", () => {
  it("guards application routes", () => {
    for (const path of ["/", "/roster", "/review", "/cycles/2"]) {
      expect(matches(path)).toBe(true);
    }
  });

  it("does not guard the Auth.js routes, or sign-in would be unreachable", () => {
    expect(matches("/api/auth/signin")).toBe(false);
    expect(matches("/api/auth/callback/dev-identity")).toBe(false);
  });

  it("does not guard /signin", () => {
    expect(matches("/signin")).toBe(false);
  });

  it("does not guard /not-registered, which must stay terminal", () => {
    // Guarding it means an expired session bounces the user to /signin from a
    // page whose whole purpose is to be an endpoint, not a waypoint.
    expect(matches("/not-registered")).toBe(false);
  });

  it("does not guard Next internals or static assets", () => {
    for (const path of ["/_next/static/chunk.js", "/favicon.ico"]) {
      expect(matches(path)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

```powershell
pnpm --filter @irp/web test middleware
```

Expected: FAIL — cannot resolve `@/middleware`.

- [ ] **Step 3: Create `apps/web/middleware.ts`**

```ts
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * A UX redirect, NOT the security boundary.
 *
 * Next.js middleware has had bypass CVEs, and layouts are cached across
 * navigations, so neither is a control. The boundary is apps/api: a global
 * fail-closed onRequest hook, jose validation against the JWKS, and 403 for a
 * valid token with no User row.
 *
 * Uses authConfig (edge-safe) rather than auth.ts, which pulls in Node-only
 * modules the Edge runtime cannot load.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/((?!api/auth|signin|not-registered|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Create `apps/web/app/(app)/page.tsx`**

This is the payoff — the real user, from the real API, through the generated client.

```tsx
import { getCurrentUserOrRedirect } from "@/lib/api-client";

export default async function TodayPage() {
  const user = await getCurrentUserOrRedirect();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: "var(--ink)" }}>
        Today
      </h1>

      <dl
        className="max-w-[48ch] rounded-[var(--radius-panel)] border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <dt className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
          Signed in as
        </dt>
        <dd className="mb-4 text-base" style={{ color: "var(--ink)" }} data-testid="user-name">
          {user.displayName}
        </dd>

        <dt className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
          Email
        </dt>
        <dd className="mb-4 text-base" style={{ color: "var(--ink)" }}>{user.email}</dd>

        <dt className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
          Role
        </dt>
        {/* From GET /api/v1/me — the User row, the only source of truth. Never
            from the session cookie. */}
        <dd className="text-base" style={{ color: "var(--ink)" }} data-testid="user-role">
          {user.role}
        </dd>
      </dl>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```powershell
pnpm --filter @irp/web test middleware
pnpm typecheck
pnpm lint
```

Expected: 5 middleware tests PASS; typecheck and lint exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/middleware.ts "apps/web/app/(app)/page.tsx" apps/web/test/middleware.test.ts
git commit -m "feat(web): middleware redirect guard and the authenticated page

The matcher excludes /not-registered, which must stay terminal — guarding
it would bounce an expired session to /signin from a page whose purpose is
to be an endpoint, not a waypoint.

The guard is UX only. Comments say so, because middleware has had bypass
CVEs and the boundary is apps/api.

Role is rendered from GET /api/v1/me, never the session cookie."
```

---

## Task 10: The global fail-closed hook in `apps/api`

**Files:**
- Create: `apps/api/src/plugins/require-auth.ts`, `apps/api/test/fail-closed.test.ts`
- Modify: `apps/api/src/server.ts:35-45`

**Interfaces:**
- Consumes: `authPlugin`'s `app.authenticate` decorator.
- Produces: `requireAuthPlugin`, a `fastify-plugin` with `dependencies: ["auth"]`.

**Why:** the spec's document-level `security` default is fail-closed, but the implementation is opt-in per route. Plan 2B closed the gap with a route-discovery *test*; this closes it *structurally*. `/health` stays public — it is a container liveness probe and takes no credentials.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/fail-closed.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestServer } from "./helpers/build-test-server.js";
import { dbUrl } from "./helpers/require-db.js";

describe("the global fail-closed hook", () => {
  let app: FastifyInstance;
  let prisma: Awaited<ReturnType<typeof buildTestServer>>["prisma"];

  beforeAll(async () => {
    ({ app, prisma } = await buildTestServer(dbUrl!));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("rejects an unauthenticated request to a registered /api/ route", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects an unauthenticated request to an UNREGISTERED /api/ path", async () => {
    // The point of a global hook: a route nobody remembered to protect, and a
    // path that does not exist at all, must both fail closed rather than 404
    // with information about what is there.
    const res = await app.inject({ method: "GET", url: "/api/v1/anything-at-all" });
    expect(res.statusCode).toBe(401);
  });

  it("leaves /health public — it is a liveness probe taking no credentials", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("returns RFC 7807 Problem Details carrying a traceId", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/me" });
    const body = res.json<{ type: string; title: string; traceId?: string }>();
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(body.type).toContain("unauthorized");
    expect(body.traceId).toBeTypeOf("string");
  });

  it("authenticates ONCE per request, not once per layer", async () => {
    // /api/v1/me sits behind BOTH the global hook and its own preHandler. Both
    // call app.authenticate. Without idempotency that is two JWT verifications
    // and two findByExternalId round-trips per request — a measurable cost
    // against NFR-1 (p95 < 250 ms at 50 RPS) and NFR-2's burst target.
    const spy = vi.spyOn(prisma.user, "findFirst");
    spy.mockClear();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${await signToken({ oid: "dev-admin-1" })}` },
    });

    expect(res.statusCode).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
```

Add to the imports at the top of this test file:

```ts
import { vi } from "vitest";
import { signToken } from "./helpers/keys.js";
```

> **Note on `findFirst`:** `createUserRepo`'s `findByExternalId` uses a soft-delete
> filter, so confirm which Prisma method it actually calls by reading
> `apps/api/src/db/user-repo.ts`, and spy on that one. If it is `findUnique`,
> spy on `prisma.user.findUnique` instead. The assertion is "exactly one
> database round-trip", not the method name.

- [ ] **Step 2: Run it and CONFIRM IT FAILS**

```powershell
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm --filter @irp/api test fail-closed
```

Expected: FAIL on "rejects an unauthenticated request to an UNREGISTERED /api/ path" — currently a 404, because protection is per-route.

**Record the observed status code in your task report.** This is the gate proof.

- [ ] **Step 3: Create `apps/api/src/plugins/require-auth.ts`**

```ts
import fp from "fastify-plugin";

/**
 * Fail-closed by default for everything under /api/.
 *
 * The OpenAPI document declares a document-level `security` requirement, which
 * is fail-closed. The implementation was opt-in per route, so a handler added
 * without `preHandler: [app.authenticate]` would be public — and would lint and
 * test clean. Plan 2B caught that with a route-discovery test; this closes it
 * structurally.
 *
 * onRequest, not preHandler, so it runs before routing and therefore also
 * covers /api/ paths with no registered route. Those return 401 rather than
 * 404, which is the correct posture: an unauthenticated caller learns nothing
 * about what exists.
 *
 * /health is deliberately outside /api/ — a container liveness probe that takes
 * no credentials.
 */
export const requireAuthPlugin = fp(
  (app) => {
    app.addHook("onRequest", async (req, reply) => {
      if (!req.url.startsWith("/api/")) return;
      await app.authenticate(req, reply);
    });
  },
  { name: "require-auth", dependencies: ["auth"] },
);
```

- [ ] **Step 4: Register it in `apps/api/src/server.ts`**

Add the import beside the other plugin imports:

```ts
import { requireAuthPlugin } from "./plugins/require-auth.js";
```

Then register it **after** `authPlugin` and **before** the routes:

```ts
  await app.register(authPlugin, {
    getKey: deps.getKey,
    issuer: deps.config.jwtIssuer,
    audience: deps.config.jwtAudience,
    userRepo: deps.userRepo,
  });
  // Fail-closed for /api/* before routing. Order is enforced by fastify-plugin's
  // dependency graph, not by convention — a wrong order throws at boot.
  await app.register(requireAuthPlugin);
  await app.register(healthRoutes);
  await app.register(meRoutes);
```

- [ ] **Step 4a: Make `authenticate` idempotent per request**

`/api/v1/me` sits behind both the global hook and its own `preHandler`, and both call `app.authenticate`. Without this, every protected request pays two JWT verifications and two database round-trips.

Keeping both layers is deliberate: the global hook is the structural guarantee, and Plan 2B's route-discovery test asserts the `preHandler` is present. Idempotency is how we keep both without paying twice.

In `apps/api/src/plugins/auth.ts`, add this as the **first** statement inside the `app.decorate("authenticate", ...)` callback, before the `authorization` header is read:

```ts
      // Both the global fail-closed hook (plugins/require-auth.ts) and a
      // route's own preHandler call this. Verifying twice would mean two JWT
      // verifications and two findByExternalId round-trips per request, which
      // bears directly on NFR-1 (p95 < 250 ms at 50 RPS) and NFR-2's burst
      // target. req.user is per-request state, so an already-populated value
      // means this request has already authenticated successfully.
      //
      // A FAILED authentication throws, so it never reaches this line — there
      // is no path where a rejected request is later treated as authenticated.
      if (req.user !== null) return;
```

- [ ] **Step 5: Run the tests to verify they pass**

```powershell
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm --filter @irp/api test
```

Expected: PASS. 5 new tests; the existing 48 still green, 53 total in `apps/api`.

If "authenticates ONCE per request" still fails, check that `app.decorateRequest("user", null)` gives each request its own `null` rather than a shared reference, and that the early return is before the header read.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/plugins/require-auth.ts apps/api/src/server.ts apps/api/test/fail-closed.test.ts
git commit -m "feat(api): global fail-closed onRequest hook for /api/*

The OpenAPI document's security requirement is fail-closed; the
implementation was opt-in per route, so a handler added without a
preHandler would be public and would still lint and test clean.

Uses onRequest rather than preHandler so it runs before routing and also
covers /api/ paths with no registered route — 401 rather than 404, so an
unauthenticated caller learns nothing about what exists.

Demonstrated red: GET /api/v1/anything-at-all returned 404 before this."
```

---

## Task 11: Distinguish JWKS retrieval failure from token invalidity

**Files:**
- Modify: `apps/api/src/plugins/auth.ts:34-53`
- Create: `apps/api/test/auth-jwks-failure.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `apps/api/src/errors.ts` gains `ServiceUnavailableError`.

**Why:** `catch` around `jwtVerify` is unconditional and swallows errors thrown by the **key-getter** too. Inert with a local key set. Once Task 6's dev JWKS or a real Entra endpoint is in play, a JWKS outage tells every user *"your token is invalid"* (401) while the true fault is ours (5xx) — actively misleading during an incident. Plan 2B logged this as a Plan 3 obligation precisely because this is the plan that makes it real.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/auth-jwks-failure.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { createPrismaClient } from "../src/db/client.js";
import { createUserRepo } from "../src/db/user-repo.js";
import { createTracerProvider } from "../src/telemetry.js";
import { buildServer } from "../src/server.js";
import { signToken, testIssuer, testAudience } from "./helpers/keys.js";
import { dbUrl } from "./helpers/require-db.js";

describe("when the JWKS endpoint is unreachable", () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof createPrismaClient>;

  beforeAll(async () => {
    prisma = createPrismaClient(dbUrl!);
    app = await buildServer({
      config: {
        port: 3001, databaseUrl: dbUrl!, jwksUri: "unused",
        jwtIssuer: testIssuer, jwtAudience: testAudience,
        version: "0.0.0", nodeEnv: "test",
      },
      userRepo: createUserRepo(prisma),
      // Stands in for createRemoteJWKSet against a dead endpoint.
      getKey: () => {
        throw new Error("ECONNREFUSED: the JWKS endpoint is unreachable");
      },
      tracerProvider: createTracerProvider(new InMemorySpanExporter()),
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("returns 503, not 401 — the token is fine, our key source is down", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    expect(res.statusCode).toBe(503);
  });

  it("does not tell the user their token is invalid", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${await signToken()}` },
    });
    const body = res.json<{ title: string; detail: string }>();
    expect(body.detail).not.toMatch(/invalid|expired/i);
    expect(body.title).toMatch(/unavailable/i);
  });

  it("still returns 401 for a genuinely malformed token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { authorization: "Bearer not-a-jwt" },
    });
    // Malformed input fails before the key-getter is ever consulted.
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and CONFIRM IT FAILS**

```powershell
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm --filter @irp/api test auth-jwks-failure
```

Expected: FAIL — 401 received where 503 expected, on the first two tests. **Record the observed behaviour.**

- [ ] **Step 3: Add `ServiceUnavailableError` to `apps/api/src/errors.ts`**

Append:

```ts
export class ServiceUnavailableError extends HttpError {
  constructor(detail = "A dependency required to serve this request is unavailable.") {
    super(
      503,
      `${PROBLEM_BASE}/service-unavailable`,
      "Service temporarily unavailable",
      detail,
    );
  }
}
```

- [ ] **Step 4: Rewrite the `catch` in `apps/api/src/plugins/auth.ts`**

Replace the `let oid: unknown;` block through the end of its `catch` with:

```ts
      let oid: unknown;
      // The key-getter is a separate failure domain from the token. A JWKS
      // endpoint outage is OUR fault (5xx); an unverifiable token is the
      // caller's (401). One catch around both reports an outage as "your token
      // is invalid", which is actively misleading during an incident.
      let keyRetrievalFailed = false;
      const trackingGetKey: JWTVerifyGetKey = async (header, input) => {
        try {
          return await opts.getKey(header, input);
        } catch (cause) {
          keyRetrievalFailed = true;
          throw cause;
        }
      };

      try {
        const { payload } = await jwtVerify(token, trackingGetKey, {
          issuer: opts.issuer,
          audience: opts.audience,
          // Entra signs with RS256. Stating it means the accepted set is a
          // decision in the code rather than whatever jose defaults to.
          algorithms: ["RS256"],
          // Zero tolerance is the default, so ordinary skew between Entra's
          // clock and the container's produces spurious 401s on freshly
          // issued tokens.
          clockTolerance: "60s",
        });
        oid = payload.oid;
      } catch (cause) {
        if (keyRetrievalFailed) {
          req.log.error({ err: cause }, "JWKS key retrieval failed");
          throw new ServiceUnavailableError(
            "Could not retrieve the signing keys needed to verify your session. Please retry.",
          );
        }
        // Malformed, bad signature, wrong issuer/audience, or expired.
        throw new UnauthorizedError("The bearer token is invalid or has expired.");
      }
```

Update the imports at the top of the file:

```ts
import { UnauthorizedError, ForbiddenError, ServiceUnavailableError } from "../errors.js";
```

The `authenticate` decorator's signature must now accept the request for logging — it already receives `req`.

- [ ] **Step 5: Run the tests to verify they pass**

```powershell
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm --filter @irp/api test
```

Expected: PASS. 3 new tests; 55 total in `apps/api`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/plugins/auth.ts apps/api/src/errors.ts apps/api/test/auth-jwks-failure.test.ts
git commit -m "fix(api): distinguish JWKS retrieval failure from token invalidity

The catch around jwtVerify was unconditional and swallowed key-getter
errors too. Inert with a local key set — but this is the plan that makes
createRemoteJWKSet real, and a JWKS outage would have told every user
'your token is invalid' (401) while the true fault was ours (5xx).

A wrapper around the key-getter records whether retrieval itself failed,
so the catch can tell the two domains apart: 503 for our outage, 401 for
an unverifiable token. A malformed token still 401s, because it fails
before the key-getter is consulted.

Demonstrated red: 401 was returned where 503 was expected.
Closes a Plan 2B carried-forward item."
```

---

## Task 12: The Playwright end-to-end smoke test

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/signin.spec.ts`, `apps/web/e2e/README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: everything above.
- Produces: `pnpm --filter @irp/web e2e`.

**This is the only test that proves the slice's thesis.** Everything else asserts a part.

**Prerequisite — the dev `User` rows must exist.** The `INSERT`s are in Step 3 and go into the runbook in Task 14.

- [ ] **Step 1: Add Playwright artefacts to `.gitignore`**

Append:

```gitignore
# Playwright
test-results/
playwright-report/
.playwright/
```

- [ ] **Step 2: Create `apps/web/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // No retries. A flaky end-to-end test that passes on retry teaches nothing,
  // and this repo has been bitten twice by gates that looked green.
  retries: 0,
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    // Desktop only, min 1280px (NFR-13).
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @irp/api dev",
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @irp/web dev",
      url: "http://localhost:3000/signin",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
```

- [ ] **Step 3: Create `apps/web/e2e/README.md`**

```markdown
# End-to-end smoke test

Proves the chain this slice exists to prove: browser → Auth.js → encrypted
cookie → decrypt → `@irp/client` → `apps/api` → Postgres → rendered user.

## Prerequisites

1. Postgres running and migrated:

   ```powershell
   $env:IRP_DB_PORT = "5433"
   docker compose -f apps/api/docker-compose.yml up -d
   $env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
   pnpm --filter @irp/api exec prisma migrate deploy
   ```

2. The two registered dev users. `dev-unknown-1` is deliberately absent —
   the test asserts it produces a 403.

   ```sql
   INSERT INTO "User" ("id", "externalId", "email", "displayName", "role", "createdAt", "updatedAt")
   VALUES
     (gen_random_uuid(), 'dev-admin-1',   'mentor@dev.local',  'Dev Mentor',  'ADMIN',   now(), now()),
     (gen_random_uuid(), 'dev-student-1', 'student@dev.local', 'Dev Student', 'STUDENT', now(), now())
   ON CONFLICT ("externalId") DO NOTHING;
   ```

3. `apps/api/.env` and `apps/web/.env.local` from their `.env.example` files,
   with `AUTH_DEV_BYPASS=true` and the API pointed at the dev JWKS:

   ```bash
   # apps/api/.env
   JWKS_URI=http://localhost:3000/api/dev-jwks
   JWT_ISSUER=http://localhost:3000/api/dev-jwks
   JWT_AUDIENCE=api://irp-progress-management
   ```

## Run

```powershell
pnpm --filter @irp/web exec playwright install chromium
pnpm --filter @irp/web e2e
```
```

- [ ] **Step 4: Write the failing test**

Create `apps/web/e2e/signin.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test.describe("the sign-in chain", () => {
  test("a registered mentor signs in and sees their own name from the API", async ({ page }) => {
    await page.goto("/signin");

    // The split treatment: the ribbon is present before sign-in.
    await expect(page.getByText("A mark per working day.")).toBeVisible();

    await page.getByRole("button", { name: /Mentor \(Admin\)/ }).click();

    // Every layer ran: cookie minted, decrypted server-side, bearer token
    // attached by @irp/client, JWT verified against the dev JWKS, User row
    // found in Postgres, name rendered.
    await expect(page.getByTestId("user-name")).toHaveText("Dev Mentor");
    await expect(page.getByTestId("user-role")).toHaveText("Admin");
  });

  test("a registered student sees the Student role from the User row", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: /^Student$/ }).click();
    await expect(page.getByTestId("user-name")).toHaveText("Dev Student");
    await expect(page.getByTestId("user-role")).toHaveText("Student");
  });

  test("an unregistered user reaches the terminal 403 page, not a redirect loop", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: /Unregistered user/ }).click();

    await expect(page).toHaveURL(/\/not-registered$/);
    await expect(page.getByRole("heading", { name: /not registered/i })).toBeVisible();

    // The trap: this page must offer sign-out, never a link back to /signin,
    // or a valid session bounces straight back and loops forever.
    await expect(page.getByRole("button", { name: /Sign out/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  });

  test("an unauthenticated visitor is redirected to sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signin/);
  });

  test("the browser is never given a bearer token", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: /Mentor \(Admin\)/ }).click();
    await expect(page.getByTestId("user-name")).toBeVisible();

    // The decisive assertion for spec §4.1. If this body carried the token,
    // any script on the page could call the API directly.
    const body = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      return res.text();
    });

    expect(body).not.toMatch(/accessToken/i);
    expect(body).not.toMatch(/\beyJ[A-Za-z0-9_-]{8,}/);
  });
});
```

- [ ] **Step 5: Install the browser and run**

```powershell
pnpm --filter @irp/web exec playwright install chromium
$env:IRP_DB_PORT = "5433"
docker compose -f apps/api/docker-compose.yml up -d
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm --filter @irp/api exec prisma migrate deploy
```

Insert the dev users with the SQL from Step 3 via `docker compose exec`:

```powershell
docker compose -f apps/api/docker-compose.yml exec -T db psql -U irp -d irp -c "INSERT INTO \"User\" (\"id\", \"externalId\", \"email\", \"displayName\", \"role\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'dev-admin-1', 'mentor@dev.local', 'Dev Mentor', 'ADMIN', now(), now()), (gen_random_uuid(), 'dev-student-1', 'student@dev.local', 'Dev Student', 'STUDENT', now(), now()) ON CONFLICT (\"externalId\") DO NOTHING;"
```

Then:

```powershell
pnpm --filter @irp/web e2e
```

Expected: 5 tests PASS.

> **If the JWKS fetch fails,** `apps/api` will now correctly return **503** rather than 401 — Task 11's behaviour. Check `JWKS_URI` in `apps/api/.env` points at `http://localhost:3000/api/dev-jwks` and that `apps/web` is up. The clear error is the fix working.

- [ ] **Step 6: Verify the private key never reached the browser**

```powershell
pnpm --filter @irp/web build
Select-String -Path "apps/web/.next/static/**/*.js" -Pattern "privateKey|BEGIN RSA|\"d\":" -List
```

Expected: **no matches.** If anything matches, the keypair leaked into a client bundle — stop and fix before committing.

- [ ] **Step 7: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e .gitignore
git commit -m "test(web): Playwright smoke test for the whole sign-in chain

The only test that proves what this slice exists to prove: browser →
Auth.js → encrypted cookie → server-side decrypt → @irp/client →
apps/api → Postgres → rendered user.

Asserts all three dev identities, the redirect for anonymous visitors,
that /not-registered offers sign-out and no link back to /signin, and —
decisively for spec §4.1 — that GET /api/auth/session hands the browser
nothing token-shaped.

retries: 0. A flaky e2e test that passes on retry teaches nothing."
```

---

## Task 13: CI wiring

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: everything above.
- Produces: a `real-token` job gated on `vars.ENTRA_REAL_TOKEN_TESTS`.

The `verify` job's timezone matrix and Postgres service stay exactly as they are.

- [ ] **Step 1: Add web env and Playwright to the `verify` job**

In `.github/workflows/ci.yml`, extend the `verify` job's `env:` block:

```yaml
      # apps/web. AUTH_DEV_BYPASS is deliberately absent — the unit suite must
      # not depend on it, and Task 5's guard test sets NODE_ENV itself.
      AUTH_SECRET: ci-only-secret-at-least-32-bytes-xx
      AUTH_URL: http://localhost:3000
      API_BASE_URL: http://localhost:3001
```

- [ ] **Step 2: Add a Playwright step after the existing `Test` step**

```yaml
      - name: Install the Playwright browser
        run: pnpm --filter @irp/web exec playwright install --with-deps chromium

      - name: Seed the dev users the e2e test expects
        run: |
          psql "$DATABASE_URL" -c "INSERT INTO \"User\" (\"id\", \"externalId\", \"email\", \"displayName\", \"role\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'dev-admin-1', 'mentor@dev.local', 'Dev Mentor', 'ADMIN', now(), now()), (gen_random_uuid(), 'dev-student-1', 'student@dev.local', 'Dev Student', 'STUDENT', now(), now()) ON CONFLICT (\"externalId\") DO NOTHING;"

      - name: End-to-end smoke test
        env:
          AUTH_DEV_BYPASS: "true"
          JWKS_URI: http://localhost:3000/api/dev-jwks
          JWT_ISSUER: http://localhost:3000/api/dev-jwks
          JWT_AUDIENCE: api://irp-progress-management
        run: pnpm --filter @irp/web e2e

      - name: Upload the Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ matrix.timezone }}
          path: apps/web/playwright-report/
          retention-days: 7
```

> These env values **override** the job-level `JWKS_URI: https://jwks.invalid/keys` for this step only. The job-level value stays deliberately unresolvable so the unit suite cannot depend on reaching the network.

- [ ] **Step 3: Add the dormant real-token job**

Append as a sibling of `verify`:

```yaml
  # The Entra path, proven against a real token. Dormant until the tenant
  # exists: set the repository VARIABLE ENTRA_REAL_TOKEN_TESTS to 'true'.
  #
  # Gated on a VARIABLE, not on secret presence, because variables are readable
  # when secrets are not. That is what lets this job tell "expected but absent"
  # (hard fail) from "not configured yet" (do not run) — the same reasoning as
  # apps/api/test/helpers/require-db.ts, with the flag explicit instead of
  # inferred. A conditionally-skipped job is the false-green shape this repo has
  # been bitten by twice.
  real-token:
    if: vars.ENTRA_REAL_TOKEN_TESTS == 'true'
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: irp
          POSTGRES_PASSWORD: irp
          POSTGRES_DB: irp
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U irp -d irp"
          --health-interval 2s --health-timeout 5s --health-retries 15
    env:
      DATABASE_URL: postgresql://irp:irp@localhost:5432/irp?schema=public
    steps:
      - uses: actions/checkout@v4

      - name: Hard-fail if the secrets are expected but absent
        env:
          ENTRA_TENANT_ID: ${{ secrets.ENTRA_TENANT_ID }}
          ENTRA_K6_CLIENT_ID: ${{ secrets.ENTRA_K6_CLIENT_ID }}
          ENTRA_K6_CLIENT_SECRET: ${{ secrets.ENTRA_K6_CLIENT_SECRET }}
          ENTRA_API_AUDIENCE: ${{ secrets.ENTRA_API_AUDIENCE }}
        run: |
          missing=0
          for name in ENTRA_TENANT_ID ENTRA_K6_CLIENT_ID ENTRA_K6_CLIENT_SECRET ENTRA_API_AUDIENCE; do
            if [ -z "${!name}" ]; then
              echo "::error::$name is missing, but ENTRA_REAL_TOKEN_TESTS=true says these tests are expected."
              missing=1
            fi
          done
          [ "$missing" -eq 0 ]

      - uses: pnpm/action-setup@v4
        with:
          version: 11.17.0

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Generate
        run: |
          pnpm generate
          pnpm --filter @irp/api exec prisma generate
          pnpm --filter @irp/core build

      - name: Apply database migrations
        run: pnpm --filter @irp/api exec prisma migrate deploy

      - name: Acquire a real Entra token via the k6 service principal
        id: token
        env:
          TENANT: ${{ secrets.ENTRA_TENANT_ID }}
          CLIENT_ID: ${{ secrets.ENTRA_K6_CLIENT_ID }}
          CLIENT_SECRET: ${{ secrets.ENTRA_K6_CLIENT_SECRET }}
          AUDIENCE: ${{ secrets.ENTRA_API_AUDIENCE }}
        run: |
          # Client credentials, so no browser is involved. This service
          # principal is required by Deliverable 4 anyway (NFR-3), so this is
          # D4's prerequisite built early rather than extra scaffolding.
          resp=$(curl -sS -X POST \
            "https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token" \
            -d "client_id=${CLIENT_ID}" \
            -d "client_secret=${CLIENT_SECRET}" \
            -d "scope=${AUDIENCE}/.default" \
            -d "grant_type=client_credentials")
          token=$(echo "$resp" | jq -r '.access_token // empty')
          if [ -z "$token" ]; then
            echo "::error::Token acquisition failed: $(echo "$resp" | jq -c '.error_description // .')"
            exit 1
          fi
          echo "::add-mask::$token"
          echo "token=$token" >> "$GITHUB_OUTPUT"

      - name: Register the service principal as a User, then call /api/v1/me
        env:
          ACCESS_TOKEN: ${{ steps.token.outputs.token }}
          TENANT: ${{ secrets.ENTRA_TENANT_ID }}
          AUDIENCE: ${{ secrets.ENTRA_API_AUDIENCE }}
          JWKS_URI: https://login.microsoftonline.com/${{ secrets.ENTRA_TENANT_ID }}/discovery/v2.0/keys
          JWT_ISSUER: https://login.microsoftonline.com/${{ secrets.ENTRA_TENANT_ID }}/v2.0
          JWT_AUDIENCE: ${{ secrets.ENTRA_API_AUDIENCE }}
        run: |
          # The oid of a client-credentials token is the service principal's
          # object id. A User row must exist for it, or the API correctly 403s.
          oid=$(echo "$ACCESS_TOKEN" | cut -d. -f2 \
            | tr '_-' '/+' | base64 -d 2>/dev/null | jq -r '.oid')
          psql "$DATABASE_URL" -c "INSERT INTO \"User\" (\"id\", \"externalId\", \"email\", \"displayName\", \"role\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '${oid}', 'k6@ci.local', 'k6 Load Principal', 'ADMIN', now(), now()) ON CONFLICT (\"externalId\") DO NOTHING;"

          pnpm --filter @irp/api dev &
          for _ in $(seq 1 30); do
            curl -fsS http://localhost:3001/health >/dev/null 2>&1 && break
            sleep 1
          done

          status=$(curl -sS -o /tmp/me.json -w '%{http_code}' \
            -H "Authorization: Bearer ${ACCESS_TOKEN}" \
            http://localhost:3001/api/v1/me)

          echo "GET /api/v1/me → $status"
          cat /tmp/me.json
          if [ "$status" != "200" ]; then
            echo "::error::A real Entra token did not authenticate against the API."
            exit 1
          fi
```

- [ ] **Step 4: Validate the workflow parses**

```powershell
pnpm dlx yaml-lint .github/workflows/ci.yml
```

Expected: no errors. If `yaml-lint` is unavailable, push the branch and confirm GitHub does not report a workflow syntax error.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: web unit tests, Playwright e2e, and a dormant real-token job

The real-token job is gated on the repository VARIABLE
ENTRA_REAL_TOKEN_TESTS rather than on secret presence. Variables are
readable when secrets are not, which is what lets the job distinguish
'expected but absent' (hard fail) from 'not configured yet' (do not run).
A conditionally-skipped job is the false-green shape this repo has been
bitten by twice.

The practical effect: Plan 3 merges with the job written and the variable
unset, so the Entra blocker gates only the final wiring, never the plan.

The e2e step overrides JWKS_URI for itself only. The job-level value stays
deliberately unresolvable so the unit suite cannot depend on the network."
```

---

## Task 14: ADRs, version pins, and documentation reconciliation

**Files:**
- Create: `docs/adr/0010-authjs-v5-over-msal.md`, `docs/adr/0011-bicep-graph-extension-over-bootstrap-script.md`, `docs/adr/0012-dev-auth-bypass-by-issuer-swap.md`
- Modify: `CLAUDE.md`, `docs/manual-setup-steps.md`, `handoff.md`, `docs/superpowers/specs/2026-07-28-slice-1-integration-skeleton-design.md`

- [ ] **Step 1: Write ADR-0010 — Auth.js v5 over MSAL**

Create `docs/adr/0010-authjs-v5-over-msal.md`. Follow the house format exactly (see `docs/adr/0008`): Status, Date, Deciders, Requirements, Relates to, then Context / Decision / Consequences (Positive, Negative) / Alternatives considered / Revisit when.

Content it must carry:

- **Context:** `apps/web` is Next.js 16 App Router. FR-1 requires Azure AD SSO with no local passwords (NFR-14). Slice-1 spec §6 named Auth.js v5 as expected and reserved the final call to the Impl Lead.
- **Decision:** `next-auth@5.0.0-beta.32` with the Microsoft Entra provider.
- **Record explicitly that this is a beta.** `next-auth@latest` is `4.24.15`. `CLAUDE.md`'s rule is "newest version the surrounding ecosystem actually supports" — for App Router, that is v5, because v4 predates it and has no Server Component or middleware integration. Shipping a `beta` is a deliberate exception to the pin discipline and this is where it is recorded. Mitigation: the version is pinned exactly, not carets, so a beta bump is a reviewed change.
- **Rejected — MSAL Node:** no Next.js integration. Session storage, callback routes, cookie encryption and middleware would all be hand-built, in a plan whose first decision was to be thin. Every one of those is a place to get auth subtly wrong.
- **Rejected — a hand-rolled OIDC client:** `jose` is already a dependency and the flow is well documented, so it is *possible*. Rejected because PKCE, state and nonce handling, token refresh, and cookie encryption are exactly the code where a subtle error is both easy to make and hard to detect, and none of it is differentiating work.
- **Revisit when:** Auth.js v5 reaches a stable release (bump the pin); or Bistec training-tenant access is granted (FR-1 becomes fully satisfied by an issuer swap).

- [ ] **Step 2: Write ADR-0011 — Bicep Graph extension over a bootstrap script**

Create `docs/adr/0011-bicep-graph-extension-over-bootstrap-script.md`.

Content it must carry:

- **Context:** Entra app registrations are **Microsoft Graph objects, not ARM resources**. `CLAUDE.md` bans hand-run `az` for anything that should be Bicep, and bans checked-in deploy scripts.
- **Decision:** the Microsoft Graph Bicep extension, `Microsoft.Graph/applications@v1.0`. Verified sufficient: it supports `api.oauth2PermissionScopes`, `appRoles` with `allowedMemberTypes`, `web`/`spa.redirectUris`, `identifierUris`, `requiredResourceAccess`, and `requestedAccessTokenVersion`. `uniqueName` is required and is the idempotency key.
- **State that this supersedes slice-1 spec §7**, which chose a committed `az ad app` bootstrap script. Note that the file now lands in **Plan 4**, not Plan 3 — the timing changed because the dev bypass (ADR-0012) removed Plan 3's dependency on the registrations, and Bicep written against a tenant that cannot be deployed or tested is unverifiable.
- **Two limits that are Microsoft safeguards, not gaps in our automation** — both belong in the runbook: Bicep **cannot emit a client secret** (`passwordCredentials.secretText` is read-only), so it is minted once with `az ad app credential reset`; and **admin consent requires a portal click**.
- **Also record:** Graph replication lag can fail a first deploy, because service-principal IDs may not have propagated when dependent resources deploy. And assigning an app role needs elevated consent with no narrower permission available.
- **Rejected — a committed idempotent `az ad app` script:** re-runnable and reviewable, and it was slice-1's choice. Rejected because `CLAUDE.md`'s no-checked-in-scripts rule needs no exception once the Bicep extension is GA and sufficient, and two mechanisms for creating infrastructure is one more than needed.
- **Rejected — portal clicks:** banned outright, produces no reviewable artefact, and Deliverable 3 is graded on infrastructure as code with no portal drift.
- **Revisit when:** the Graph extension proves insufficient for a registration property we need.

- [ ] **Step 3: Write ADR-0012 — dev auth bypass by issuer swap**

Create `docs/adr/0012-dev-auth-bypass-by-issuer-swap.md`. **This is the important one.**

Content it must carry:

- **Context:** Damian's work account has no Entra admin access, so the dedicated directory may not be creatable. 50 of 75 remaining graded points sit behind having something deployed, and slice 1 must be deployed and traced before slice 2 begins.
- **Decision:** a dev-only Auth.js provider that mints a **real** RS256 JWT with a local key and publishes the matching public key at `/api/dev-jwks`. `apps/api` validates it through `createRemoteJWKSet` with its real `jose` code path. **The bypass swaps the token issuer; it does not skip authentication.**
- **Two guards:** a startup throw when `AUTH_DEV_BYPASS=true` meets `NODE_ENV=production`, and exclusion of the dev module from the production bundle via dynamic import. The throw is demonstrated red.
- **Positive consequences:** the API has no mode branch, so the 403 rule, role handling and token validation are exercised identically in both modes; dev exercises `createRemoteJWKSet` — the production mechanism — every day rather than only in the dormant CI job; and the cutover is four config steps with no code change, which makes slice-1 §6's "issuer swap, not a rewrite" claim demonstrated rather than asserted.
- **Negative consequences, stated plainly:** an auth bypass exists in the codebase, and that is a permanent liability requiring both guards to hold; a dev-signed token is not an Entra token, so app-role claim shapes remain unproven until the real-token job wakes; and restarting `apps/web` rotates the key and invalidates sessions.
- **Rejected — a trusted header (`x-dev-user`) that skips JWT validation:** simplest possible bypass. Rejected because it would make the 403 rule, the role claims and token validation *production-only* code paths — the most security-critical logic in the system would become the least exercised, which is exactly backwards.
- **Rejected — a containerised mock OIDC server** (Dex, `mock-oauth2-server`): more faithful to the real authorization-code flow. Rejected because it adds a container, a compose service and a startup dependency to every dev run and every CI job, in order to test a flow Auth.js itself owns, and it would not remove the need for a local key anyway.
- **Revisit when:** the Entra directory exists — then perform the §7 cutover, wake the CI job, and **delete this bypass rather than leaving it dormant.** Record that deletion as the intended end state.

- [ ] **Step 4: Pin the new versions in `CLAUDE.md`**

Add these rows to the pinned-versions table, matching the existing format:

| Tool | Pinned | Newest | Why not newest |
|---|---|---|---|
| `next-auth` | **5.0.0-beta.32** | 4.24.15 (`latest`) | v5 is the only version with App Router support — Server Components, `middleware`, and the `handlers` export. v4 predates all of it. `latest` being an *older* major is why this row looks inverted. Shipping a beta is a deliberate exception to the pin rule; ADR-0010 |
| React | 19.2.8 | — | Required by Next.js 16 |
| Tailwind CSS | 4.3.3 | — | v4's CSS-first `@theme` config takes the OKLCH tokens directly; ADR-0001 |
| `@playwright/test` | 1.62.0 | — | Dev-only. The end-to-end smoke test is the only thing proving the whole sign-in chain |
| `server-only` | 0.0.1 | — | Makes "the token never reaches the browser" a build-time error rather than a convention |

Also add a house-rules paragraph:

```markdown
**The dev auth bypass is temporary and must be deleted, not left dormant.**
`AUTH_DEV_BYPASS=true` makes `apps/web` mint tokens with a local key. It swaps
the token *issuer* — `apps/api` still validates every token with its real `jose`
path — so it is not an auth skip. Two guards keep it out of production: a
startup throw when the flag meets `NODE_ENV=production`, and exclusion of
`apps/web/lib/dev-identity.ts` from the production bundle. **Never weaken
either.** Once the Entra directory exists, perform the cutover in the Plan 3
spec §7 and remove the bypass. ADR-0012.
```

- [ ] **Step 5: Update `docs/manual-setup-steps.md`**

Add a new §1.0 **before** §1.1, since the bypass changes what is urgent:

```markdown
## 1.0 Read this first — nothing here blocks Plan 3 any more

Plan 3 ships a **dev auth bypass** (ADR-0012), so the whole application runs,
tests and demos with no Entra directory at all. Everything in §1 is still
needed to *deploy on Azure with real Microsoft sign-in*, but none of it blocks
building or merging.

**What the bypass does not excuse:** it must be deleted, not left dormant. The
cutover is four config steps — see the Plan 3 spec §7.
```

Then append to §1.3 the dev-identity `INSERT`s and the cutover:

```markdown
### 1.3a Register the dev users (local development)

`dev-unknown-1` is deliberately absent — it must produce a 403 and land on
`/not-registered`.

```powershell
$env:IRP_DB_PORT = "5433"
docker compose -f apps/api/docker-compose.yml up -d
docker compose -f apps/api/docker-compose.yml exec -T db psql -U irp -d irp -c "INSERT INTO \"User\" (\"id\", \"externalId\", \"email\", \"displayName\", \"role\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'dev-admin-1', 'mentor@dev.local', 'Dev Mentor', 'ADMIN', now(), now()), (gen_random_uuid(), 'dev-student-1', 'student@dev.local', 'Dev Student', 'STUDENT', now(), now()) ON CONFLICT (\"externalId\") DO NOTHING;"
```

### 1.3b The Entra cutover, when the directory exists

1. `UPDATE "User" SET "externalId" = '<entra-oid>'` for each real person.
2. Unset `AUTH_DEV_BYPASS` in `apps/web/.env.local` and the deployed config.
3. Point `JWKS_URI` and `JWT_ISSUER` at the tenant.
4. Set the repository **variable** `ENTRA_REAL_TOKEN_TESTS=true` to wake the CI job.
5. Delete `apps/web/lib/dev-identity.ts`, its route, and its tests.

No application code changes in steps 1–4. That is the design working.
```

- [ ] **Step 6: Record the supersession in the slice-1 spec**

In `docs/superpowers/specs/2026-07-28-slice-1-integration-skeleton-design.md`, insert immediately under the `### The Bicep exception, stated honestly` heading:

```markdown
> **SUPERSEDED, 2026-07-29.** The decision below — a committed, documented,
> idempotent `az ad app` bootstrap script — was replaced by the **Microsoft
> Graph Bicep extension** (`Microsoft.Graph/applications@v1.0`), which is GA and
> sufficient. See **ADR-0011**. The file lands in **Plan 4**, not Plan 3,
> because the dev bypass (ADR-0012) removed Plan 3's dependency on the
> registrations. The paragraph is kept for the reasoning it records.
```

- [ ] **Step 7: Update `handoff.md`**

Replace the "Carried forward — open items created by Plan 2B" bullet about the auth `catch` with:

```markdown
- ~~**The auth plugin's `catch` around `jwtVerify` is unconditional**~~ — **fixed in Plan 3.**
  A wrapper around the key-getter records whether retrieval itself failed, so a JWKS outage now
  returns **503** while an unverifiable token still returns 401.
```

Leave the `SIGTERM` and `$disconnect` items — both are still Plan 4's.

- [ ] **Step 8: Verify everything still passes**

```powershell
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm typecheck
pnpm lint
pnpm spec:lint
pnpm test
```

Expected: all four exit 0. `pnpm test` reports **112 core + 55 api + web unit tests**, zero skipped.

- [ ] **Step 9: Commit**

```bash
git add docs/adr CLAUDE.md docs/manual-setup-steps.md handoff.md docs/superpowers/specs
git commit -m "docs: ADRs 0010-0012, version pins, and doc reconciliation

ADR-0010 Auth.js v5 over MSAL — records that next-auth 5.0.0-beta.32 is a
beta and why that is a deliberate exception to the pin rule: 'latest' is
an older major with no App Router support.

ADR-0011 Bicep Graph extension over a bootstrap script. Supersedes
slice-1 spec §7, annotated in place.

ADR-0012 the dev auth bypass. Records that it swaps the issuer rather
than skipping auth, both guards, and that the intended end state is
DELETION, not dormancy.

CLAUDE.md gains the new pins and a house rule forbidding either guard
from being weakened."
```

---

## Self-Review

**1. Spec coverage** — every section mapped to a task:

| Spec § | Task |
|---|---|
| §2.1 bypass in scope | 5, 6 |
| §2.2 `entra.bicep` → Plan 4 | 14 (ADR-0011 records it) |
| §2.3 split sign-in | 8 |
| §4 two token sources | 5, 6, 7 |
| §4.1 `getToken` not session | 7 |
| §4.1a one source of truth for role | 5 (session callback), 9 (renders from API) |
| §4.2 per-request client + subpath export | 1, 7 |
| §5 layout, §5.1 route groups | 1, 4 |
| §5.2 guard authority | 9, 10 |
| §5.3 `CycleRibbon` | 3 |
| §5.4 typography | 2 |
| §6 the bypass, guards, identities | 5, 6 |
| §7 user assignment + cutover | 12 (README), 14 (runbook) |
| §8 four error states | 7, 8, 9 |
| §9 three API changes | 10, 11 |
| §10 testing | every task; 12 for e2e |
| §11 CI | 13 |
| §12 ADRs | 14 |
| §13 definition of done | all |

**2. Placeholder scan** — no `TBD`, no "add error handling", no "similar to Task N". Every code step carries complete code. Task 14's ADR steps specify required *content* rather than full prose, which is the intended granularity for a document whose value is the argument, not the boilerplate — the house format is pinned by reference to `docs/adr/0008`.

**3. Type consistency** — verified across tasks: `RibbonDay`/`DayMark`/`RibbonProps` (Task 3) match their use in Task 8. `DevIdentity`/`DEV_IDENTITIES`/`mintDevToken`/`devJwks`/`DEV_ISSUER` (Task 6) match Tasks 5, 8 and their tests. `SESSION_COOKIE_NAME`/`readAccessToken`/`apiClient`/`getCurrentUserOrRedirect`/`WebUser` (Task 7) match Tasks 4 and 9. `assertBypassNotInProduction`/`authConfig` (Task 5) match Tasks 7 and 9. `requireAuthPlugin` (Task 10) matches the `server.ts` edit. `ServiceUnavailableError` (Task 11) is defined before use.

**Two known integration risks**, flagged rather than hidden:

1. **`decode` from `next-auth/jwt` and the cookie-name-as-salt convention** (Task 7) are v5-beta internals. If `readAccessToken`'s tests fail at Step 5 in a way that suggests the salt or cookie name is wrong, log the actual cookie name from `document.cookie` after a dev sign-in and adjust `SESSION_COOKIE_NAME`. The tests pin the behaviour either way.
2. **`generateKeyPair` at module scope** (Task 6) uses top-level `await`, matching the existing `apps/api/test/helpers/keys.ts` pattern. If Next's bundler objects, move it behind a memoised `getKeyPair()` and adjust the three call sites.

**Scope note:** 14 tasks. The spec's §15 anticipated this and named the split: **Tasks 10 and 11 are `apps/api`-only and independent of all web work.** If execution runs long, they lift cleanly into their own plan without reordering anything else.
