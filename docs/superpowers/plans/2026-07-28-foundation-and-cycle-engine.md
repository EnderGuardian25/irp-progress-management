# Foundation and Cycle Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the pnpm workspace with TypeScript strict and a green PR pipeline, and build a fully tested cycle/date engine in `packages/core`.

**Architecture:** All calendar arithmetic runs on **civil dates** — branded `YYYY-MM-DD` strings — never on `Date` objects. Only two functions in the whole engine are timezone-aware: converting a UTC instant to a Colombo calendar date, and converting a Colombo calendar date to its end-of-day UTC instant. Everything else is pure string/integer arithmetic with zero timezone surface. This is what makes the engine deterministic under any server timezone.

**Tech Stack:** TypeScript 6.0.3 (strict), pnpm 11.17.0 workspaces, Vitest 4.1.10, ESLint 10.8.0 with typescript-eslint 8.65.0, Node 24. No date library — `Intl.DateTimeFormat` with full ICU covers the two timezone-aware functions, and adding `date-fns` would introduce API surface without removing any of the logic below.

## Global Constraints

- **Package manager:** pnpm workspaces. Not npm, not yarn.
- **TypeScript:** `strict: true` everywhere. No `any`. No `@ts-ignore`.
- **Timezone:** all timestamps stored UTC; all boundaries evaluated in `Asia/Colombo`. Never read the server's local timezone. Never hardcode `+05:30`.
- **Required vs optional days:** weekdays are **required**; weekends are **optional** and may hold entries counted as **Extra** (FR-12, FR-33). A weekend is never missed, never late, and never enters a compliance denominator.
- **Cycles:** the 10th of one month to the 9th of the next (FR-9).
- **One comparison idiom:** order two `CivilDate`s with `compareDates`, never with raw `<` / `>`. Both work — ISO dates sort lexicographically — but `compareDates` is the exported, documented API, and mixing the two inside one file is how a reader stops trusting either. The only place raw `<` / `>` on a CivilDate is allowed is inside `compareDates` itself.
- **One parse idiom:** split a `CivilDate` with `dateParts`, never with `split("-").map(Number)` plus a tuple cast.
- **Commits:** conventional commits. No direct commits to `main` — this plan runs on a branch.
- **Lint before every commit:** from Task 3 onward, run `pnpm lint` and confirm exit 0 before each commit step. Type-aware rules only see code once it exists, so a clean Task 1 config does not guarantee later tasks stay clean.
- **Assumptions:** anything resolved by assumption is marked `// ASSUMPTION: O-n` in code.
- **Node version:** 24.x (`node --version` confirms v24.15.0 on this machine).
- **Exact version pins** — verified against the registry on 2026-07-28. Use these values verbatim; do not "upgrade" them:

  | Package | Pin |
  |---|---|
  | `typescript` | `^6.0.3` |
  | `vitest` | `^4.1.10` |
  | `eslint` | `^10.8.0` |
  | `typescript-eslint` | `^8.65.0` |
  | `@eslint/js` | `^10.0.1` |
  | `@types/node` | `^26.1.2` |
  | `cross-env` | `^10.1.0` |
  | pnpm | `11.17.0` |

  **TypeScript stays on 6.x deliberately.** 7.0.2 is published, but typescript-eslint caps at
  `typescript <6.1.0`, and typescript-eslint *is* ESLint's TypeScript parser — on TS 7 there is
  no linting at all. See [ADR-0005](../../adr/0005-typescript-6-for-eslint-compatibility.md).
  If any install step reports a peer-dependency conflict on these versions, stop and report
  it rather than resolving it by bumping.

## Prerequisite

`pnpm` is already installed at **11.17.0** — verify before starting:

```bash
pnpm --version    # expect 11.17.0
```

---

### Task 1: Initialize the pnpm workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `.gitignore`
- Create: `.npmrc`

**Interfaces:**
- Consumes: nothing
- Produces: a workspace root that `pnpm install` succeeds in, `tsconfig.base.json` which every package extends, and a root `eslint.config.mjs` covering every package's `src/`. Linting is configured **once at the root**, not per package — there is a single `pnpm lint` script and no package defines its own.

- [ ] **Step 1: Create the workspace root `package.json`**

```json
{
  "name": "irp-progress-management",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@11.17.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "lint": "eslint ."
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^26.1.2",
    "eslint": "^10.8.0",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.65.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 3b: Create `eslint.config.mjs` at the workspace root**

`.mjs` rather than `.js` so the root `package.json` does not need `"type": "module"`.

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Config files are not in any tsconfig project, so type-aware rules
    // cannot run on them. Lint them with syntactic rules only rather than
    // ignoring them — an ignore here would make this file itself invisible,
    // and with no .ts files yet that leaves ESLint zero candidates and a
    // non-zero exit.
    //
    // "**/*.config.ts" matters as much as the .mjs entries: each package's
    // tsconfig includes only src/**/*, so vitest.config.ts and its kin are
    // real TypeScript sitting outside every project. Without this they fail
    // projectService resolution and break `pnpm lint` for the whole
    // workspace.
    files: ["**/*.mjs", "**/*.js", "**/*.config.ts"],
    // Never let this reach real source. "**/*.config.ts" is repo-wide, so a
    // future domain file such as `packages/core/src/rubric.config.ts` would
    // silently lose every type-aware rule — no error, just weaker linting
    // nobody notices. Config files live beside a package root, never in src/.
    ignores: ["**/src/**"],
    ...tseslint.configs.disableTypeChecked,
  },
);
```

The `ignores: ["**/src/**"]` is load-bearing. Without it, dropping a file named
`*.config.ts` anywhere under a `src/` directory disables type-aware linting for it
silently. Verified by probe: with the ignore, `@typescript-eslint/no-unnecessary-type-assertion`
(type-aware) fires on `packages/core/src/probe.config.ts`; without it, only the syntactic
`no-inferrable-types` fires.

**Do not add `"**/*.config.mjs"` to the global `ignores`.** A bare `{ ignores: [...] }`
object is a *global* ignore, and `**/` matches zero path segments — so that pattern silently
swallows this very file. The `disableTypeChecked` block above is the correct way to keep
type-aware rules off non-TypeScript files.

`recommendedTypeChecked` plus `stylisticTypeChecked` rather than `strictTypeChecked`:
type-aware rules are the point, but `strict` is opinionated enough to fight the plan's code
without improving it. `projectService: true` lets typescript-eslint discover each package's
`tsconfig.json` without a hand-maintained project list.

- [ ] **Step 4: Create `.npmrc`**

```
strict-peer-dependencies=false
auto-install-peers=true
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.next/
coverage/
*.tsbuildinfo
.env
.env.local
.DS_Store
```

- [ ] **Step 6: Verify install succeeds**

Run: `pnpm install`
Expected: completes without error; creates `pnpm-lock.yaml` and `node_modules/`.

If pnpm reports a peer-dependency conflict involving `typescript`, **stop and report it** —
do not resolve it by changing a version. The pins are deliberate (see Global Constraints).

- [ ] **Step 7: Verify ESLint runs**

Run: `pnpm lint`
Expected: exit 0.

Then confirm it is not passing vacuously:

Run: `npx eslint . --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log('files linted:',JSON.parse(s).length))"`
Expected: `files linted: 1` or more — `eslint.config.mjs` itself. A count of `0` with exit 0
means the config matches nothing and every later lint run is meaningless.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs .npmrc .gitignore pnpm-lock.yaml
git commit -m "chore: initialize pnpm workspace with strict TypeScript and type-aware ESLint"
```

---

### Task 2: Scaffold `packages/core` with Vitest

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/smoke.test.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` from Task 1
- Produces: package name `@irp/core`, a working `pnpm --filter @irp/core test` command, and `src/index.ts` as the public barrel.

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@irp/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^6.0.3",
    "vitest": "^4.1.10"
  }
}
```

No `lint` script here — ESLint is configured once at the workspace root (Task 1) and the
root `pnpm lint` covers every package.

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create the barrel `packages/core/src/index.ts`**

```ts
export {};
```

- [ ] **Step 5: Write a smoke test at `packages/core/src/smoke.test.ts`**

```ts
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Install and run**

Run: `pnpm install && pnpm --filter @irp/core test`
Expected: PASS, 1 test passed.

- [ ] **Step 7: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "chore: scaffold @irp/core package with vitest"
```

---

### Task 3: Civil date primitives

**Files:**
- Create: `packages/core/src/civil-date.ts`
- Test: `packages/core/src/civil-date.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type CivilDate = string & { readonly __brand: "CivilDate" }`
  - `civilDate(value: string): CivilDate` — throws `RangeError` on malformed or impossible dates
  - `dateParts(date: CivilDate): { year: number; month: number; day: number }`
  - `addDays(date: CivilDate, days: number): CivilDate`
  - `dayOfWeek(date: CivilDate): number` — 0 Sunday … 6 Saturday
  - `compareDates(a: CivilDate, b: CivilDate): number` — -1 / 0 / 1

`dateParts` is the single shared way to split a `CivilDate`. Everywhere else in the engine
that needs year/month/day calls it, rather than `split("-").map(Number)` with a
`as [number, number, number]` cast — that cast suppresses a genuine `| undefined` under
`noUncheckedIndexedAccess` and is exactly the idiom that gets copy-pasted somewhere it is
not safe.

**`Date.UTC` is banned in this file.** It remaps years 0-99 to 1900-1999. `civilDate()`
validates via `setUTCFullYear` specifically so that `"0099-01-01"` is accepted, so the
arithmetic must be built the same way — otherwise validated input yields silently wrong
output (`addDays("0099-01-01", 1)` returning `"1999-01-02"`).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/civil-date.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDays, civilDate, compareDates, dayOfWeek } from "./civil-date.js";

describe("civilDate", () => {
  it("accepts a valid ISO calendar date", () => {
    expect(civilDate("2026-07-28")).toBe("2026-07-28");
  });

  it("rejects a malformed string", () => {
    expect(() => civilDate("28-07-2026")).toThrow(RangeError);
  });

  it("rejects an impossible date", () => {
    expect(() => civilDate("2026-02-30")).toThrow(RangeError);
  });

  it("accepts a real leap day", () => {
    expect(civilDate("2028-02-29")).toBe("2028-02-29");
  });

  it("rejects a leap day in a non-leap year", () => {
    expect(() => civilDate("2026-02-29")).toThrow(RangeError);
  });

  // Guards the Date.UTC year-remapping trap: years 0-99 become 1900-1999,
  // which would make the validation round-trip reject a valid date.
  it("accepts a valid date in the first century", () => {
    expect(civilDate("0099-01-01")).toBe("0099-01-01");
  });

  it("still rejects an impossible date in the first century", () => {
    expect(() => civilDate("0099-02-30")).toThrow(RangeError);
  });
});

describe("addDays", () => {
  it("adds within a month", () => {
    expect(addDays(civilDate("2026-07-01"), 5)).toBe("2026-07-06");
  });

  it("rolls over a month boundary", () => {
    expect(addDays(civilDate("2026-07-31"), 1)).toBe("2026-08-01");
  });

  it("rolls over a year boundary", () => {
    expect(addDays(civilDate("2026-12-31"), 1)).toBe("2027-01-01");
  });

  it("subtracts across a month boundary", () => {
    expect(addDays(civilDate("2026-03-01"), -1)).toBe("2026-02-28");
  });

  it("handles a leap year February", () => {
    expect(addDays(civilDate("2028-03-01"), -1)).toBe("2028-02-29");
  });

  // civilDate() validates years 0-99 via setUTCFullYear, so the arithmetic
  // must be built the same way. Date.UTC would remap 0099 to 1999 and return
  // "1999-01-02" here — validated input, silently wrong output.
  it("stays in the first century instead of remapping to 1900-1999", () => {
    expect(addDays(civilDate("0099-01-01"), 1)).toBe("0099-01-02");
  });
});

describe("dayOfWeek", () => {
  it("returns 2 for a known Tuesday", () => {
    expect(dayOfWeek(civilDate("2026-07-28"))).toBe(2);
  });

  it("returns 6 for a known Saturday", () => {
    expect(dayOfWeek(civilDate("2026-08-01"))).toBe(6);
  });

  it("returns 0 for a known Sunday", () => {
    expect(dayOfWeek(civilDate("2026-08-02"))).toBe(0);
  });

  // Proleptic Gregorian: 0099-01-01 is a Thursday (4). 1999-01-01 was a
  // Friday (5), so a Date.UTC-based implementation returns 5 here.
  it("returns the first-century weekday, not the 1900s remap", () => {
    expect(dayOfWeek(civilDate("0099-01-01"))).toBe(4);
  });
});

describe("compareDates", () => {
  it("orders earlier before later", () => {
    expect(compareDates(civilDate("2026-07-01"), civilDate("2026-07-02"))).toBe(-1);
  });

  it("returns 0 for equal dates", () => {
    expect(compareDates(civilDate("2026-07-01"), civilDate("2026-07-01"))).toBe(0);
  });

  it("orders later after earlier", () => {
    expect(compareDates(civilDate("2026-08-01"), civilDate("2026-07-31"))).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @irp/core test`
Expected: FAIL — `Failed to resolve import "./civil-date.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/civil-date.ts`:

```ts
/**
 * A calendar date with no time and no timezone, as `YYYY-MM-DD`.
 *
 * Every piece of calendar arithmetic in this engine runs on CivilDate rather
 * than Date. A Date is an instant, and doing "add one day" to an instant is
 * how timezone bugs get in. ISO date strings also compare lexicographically,
 * so ordering is free.
 */
export type CivilDate = string & { readonly __brand: "CivilDate" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse and validate an ISO calendar date. Throws RangeError if not real. */
export function civilDate(value: string): CivilDate {
  const match = ISO_DATE.exec(value);
  if (match === null) {
    throw new RangeError(`Not an ISO calendar date (expected YYYY-MM-DD): ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Date.UTC normalises out-of-range parts, so round-tripping detects
  // impossible dates such as 2026-02-30.
  //
  // Date.UTC remaps years 0-99 to 1900-1999, which would falsely reject
  // "0099-01-01". setUTCFullYear has no such special case.
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError(`Not a real calendar date: ${value}`);
  }
  return value as CivilDate;
}

/**
 * Split a CivilDate into its numeric parts.
 *
 * A CivilDate is `YYYY-MM-DD` by construction — civilDate() is the only way
 * to make one — so fixed-offset slicing is safe and needs no assertion. Do
 * not re-run the regex here: that would require a non-null assertion on
 * exec(), which is both a lint violation and a smell.
 *
 * Prefer this over `split("-").map(Number)` with a tuple cast — that cast
 * suppresses a genuine `| undefined` under noUncheckedIndexedAccess.
 */
export function dateParts(date: CivilDate): { year: number; month: number; day: number } {
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

function toUtcMidnight(date: CivilDate): Date {
  const { year, month, day } = dateParts(date);
  // Built the same way civilDate() validates, and for the same reason:
  // Date.UTC remaps years 0-99 to 1900-1999, so it would turn a validated
  // "0099-01-01" into 1999 and hand back silently wrong arithmetic to every
  // caller downstream. setUTCFullYear has no such special case.
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  return instant;
}

function fromUtcMidnight(instant: Date): CivilDate {
  return instant.toISOString().slice(0, 10) as CivilDate;
}

/** Shift a calendar date by whole days. Negative shifts backwards. */
export function addDays(date: CivilDate, days: number): CivilDate {
  const instant = toUtcMidnight(date);
  instant.setUTCDate(instant.getUTCDate() + days);
  return fromUtcMidnight(instant);
}

/** Day of week: 0 Sunday … 6 Saturday. */
export function dayOfWeek(date: CivilDate): number {
  return toUtcMidnight(date).getUTCDay();
}

/** -1 if a is earlier, 0 if equal, 1 if a is later. */
export function compareDates(a: CivilDate, b: CivilDate): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @irp/core test`
Expected: PASS, all civil-date tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/civil-date.ts packages/core/src/civil-date.test.ts
git commit -m "feat(core): add civil date primitives with validation"
```

---

### Task 4: Programme timezone conversion

**Files:**
- Create: `packages/core/src/programme-time.ts`
- Test: `packages/core/src/programme-time.test.ts`

**Interfaces:**
- Consumes: `CivilDate`, `civilDate` from Task 3
- Produces:
  - `PROGRAMME_TIME_ZONE: "Asia/Colombo"`
  - `toProgrammeDate(instant: Date): CivilDate`
  - `endOfProgrammeDay(date: CivilDate): Date`

These are the **only two timezone-aware functions in the engine** (NFR-12).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/programme-time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { civilDate } from "./civil-date.js";
import { endOfProgrammeDay, toProgrammeDate } from "./programme-time.js";

describe("toProgrammeDate", () => {
  it("maps a mid-day UTC instant to the same Colombo date", () => {
    expect(toProgrammeDate(new Date("2026-07-28T06:00:00Z"))).toBe("2026-07-28");
  });

  it("maps late UTC evening to the NEXT Colombo date", () => {
    // 20:00 UTC is 01:30 the following day in Colombo (+05:30).
    expect(toProgrammeDate(new Date("2026-07-28T20:00:00Z"))).toBe("2026-07-29");
  });

  it("maps just before Colombo midnight to the earlier date", () => {
    // 18:29 UTC is 23:59 the same day in Colombo.
    expect(toProgrammeDate(new Date("2026-07-28T18:29:00Z"))).toBe("2026-07-28");
  });

  it("maps exactly Colombo midnight to the new date", () => {
    // 18:30 UTC is 00:00 the following day in Colombo.
    expect(toProgrammeDate(new Date("2026-07-28T18:30:00Z"))).toBe("2026-07-29");
  });
});

describe("endOfProgrammeDay", () => {
  it("returns the UTC instant for 23:59:59.999 Colombo", () => {
    // 23:59:59.999 on 2026-07-28 in Colombo is 18:29:59.999Z the same day.
    expect(endOfProgrammeDay(civilDate("2026-07-28")).toISOString()).toBe(
      "2026-07-28T18:29:59.999Z",
    );
  });

  it("round-trips: the instant it returns still belongs to that date", () => {
    const date = civilDate("2026-07-28");
    expect(toProgrammeDate(endOfProgrammeDay(date))).toBe(date);
  });

  it("round-trips one millisecond later into the next date", () => {
    const end = endOfProgrammeDay(civilDate("2026-07-28"));
    expect(toProgrammeDate(new Date(end.getTime() + 1))).toBe("2026-07-29");
  });

  // civilDate() accepts years 0-99, so the deadline arithmetic must handle
  // them too. Date.UTC remaps 0-99 to 1900-1999, which would land this on
  // 1999-01-01. The round-trip is the real invariant and exercises both
  // timezone-aware functions at once.
  it("stays in the first century instead of remapping to 1900-1999", () => {
    const date = civilDate("0099-01-01");
    expect(toProgrammeDate(endOfProgrammeDay(date))).toBe(date);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @irp/core test`
Expected: FAIL — `Failed to resolve import "./programme-time.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/programme-time.ts`:

```ts
import { civilDate, dateParts, type CivilDate } from "./civil-date.js";

/**
 * Every deadline, cycle boundary and late determination is evaluated in this
 * zone (NFR-12, FR-9). The deploy region is not Sri Lanka, so the server's
 * local timezone is never consulted.
 */
export const PROGRAMME_TIME_ZONE = "Asia/Colombo";

const DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: PROGRAMME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const WALL_CLOCK_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: PROGRAMME_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPart["type"],
): string {
  const found = parts.find((p) => p.type === type);
  if (found === undefined) {
    throw new Error(`Intl did not return a "${type}" part`);
  }
  return found.value;
}

/** The Colombo calendar date that a UTC instant falls on. */
export function toProgrammeDate(instant: Date): CivilDate {
  const parts = DATE_PARTS.formatToParts(instant);
  // Intl emits the year unpadded — year 99 formats as "99", not "0099" —
  // which would fail civilDate()'s four-digit regex outright. Padding is a
  // no-op for every year from 1000 on.
  const year = part(parts, "year").padStart(4, "0");
  return civilDate(`${year}-${part(parts, "month")}-${part(parts, "day")}`);
}

/**
 * Milliseconds this zone is ahead of UTC at a given instant.
 *
 * Both sides of the subtraction are floored to the whole second. The
 * formatter emits no milliseconds, so the wall clock below is built with
 * ms = 0; subtracting an instant that carries milliseconds would skew the
 * offset by up to 999 ms and push every computed deadline off by nearly a
 * second. Zone offsets are always whole minutes, so discarding milliseconds
 * from both sides loses nothing.
 *
 * Epoch-seeded rather than `Date.UTC` for the same reason as toUtcMidnight:
 * Date.UTC would remap a year 0-99 to 1900-1999 and yield an offset wrong by
 * nineteen centuries.
 */
function zoneOffsetMs(instant: Date): number {
  const parts = WALL_CLOCK_PARTS.formatToParts(instant);
  const asIfUtc = new Date(0);
  asIfUtc.setUTCFullYear(
    Number(part(parts, "year")),
    Number(part(parts, "month")) - 1,
    Number(part(parts, "day")),
  );
  asIfUtc.setUTCHours(
    Number(part(parts, "hour")),
    Number(part(parts, "minute")),
    Number(part(parts, "second")),
    0,
  );
  return asIfUtc.getTime() - (instant.getTime() - instant.getUTCMilliseconds());
}

/**
 * The UTC instant of 23:59:59.999 Colombo on the given date — the submission
 * deadline for that weekday (FR-13).
 *
 * Two passes: the offset is derived at a first-guess instant, then re-derived
 * at the corrected instant. Sri Lanka has observed no DST since 2006 so one
 * pass would do today, but deriving the offset rather than hardcoding +05:30
 * means a future zone change cannot silently corrupt every deadline.
 */
export function endOfProgrammeDay(date: CivilDate): Date {
  const { year, month, day } = dateParts(date);
  // Seeded from epoch and set via setUTCFullYear for the same reason
  // toUtcMidnight does: Date.UTC remaps years 0-99 to 1900-1999, and
  // civilDate() accepts those years.
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  probe.setUTCHours(23, 59, 59, 999);
  const wallClock = probe.getTime();
  const firstGuess = new Date(wallClock - zoneOffsetMs(new Date(wallClock)));
  return new Date(wallClock - zoneOffsetMs(firstGuess));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @irp/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/programme-time.ts packages/core/src/programme-time.test.ts
git commit -m "feat(core): add Asia/Colombo date and deadline conversion"
```

---

### Task 5: Weekday primitives

**Files:**
- Create: `packages/core/src/weekday.ts`
- Test: `packages/core/src/weekday.test.ts`

**Interfaces:**
- Consumes: `CivilDate`, `addDays`, `dayOfWeek`, `compareDates` from Task 3
- Produces:
  - `isWeekday(date: CivilDate): boolean`
  - `previousWeekday(date: CivilDate): CivilDate`
  - `nextWeekday(date: CivilDate): CivilDate`
  - `workingDaysBetween(start: CivilDate, end: CivilDate): CivilDate[]` — inclusive of both ends

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/weekday.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { civilDate } from "./civil-date.js";
import {
  isWeekday,
  nextWeekday,
  previousWeekday,
  workingDaysBetween,
} from "./weekday.js";

// 2026-07-27 is a Monday. 2026-08-01 is a Saturday, 2026-08-02 a Sunday.

describe("isWeekday", () => {
  it("is true for Monday", () => {
    expect(isWeekday(civilDate("2026-07-27"))).toBe(true);
  });

  it("is true for Friday", () => {
    expect(isWeekday(civilDate("2026-07-31"))).toBe(true);
  });

  it("is false for Saturday", () => {
    expect(isWeekday(civilDate("2026-08-01"))).toBe(false);
  });

  it("is false for Sunday", () => {
    expect(isWeekday(civilDate("2026-08-02"))).toBe(false);
  });
});

describe("previousWeekday", () => {
  it("returns Friday for a Monday", () => {
    expect(previousWeekday(civilDate("2026-08-03"))).toBe("2026-07-31");
  });

  it("returns the prior day mid-week", () => {
    expect(previousWeekday(civilDate("2026-07-29"))).toBe("2026-07-28");
  });

  it("returns Friday when called on a Saturday", () => {
    expect(previousWeekday(civilDate("2026-08-01"))).toBe("2026-07-31");
  });

  it("returns Friday when called on a Sunday", () => {
    expect(previousWeekday(civilDate("2026-08-02"))).toBe("2026-07-31");
  });

  it("crosses a month boundary", () => {
    expect(previousWeekday(civilDate("2026-09-01"))).toBe("2026-08-31");
  });
});

describe("nextWeekday", () => {
  it("returns Monday for a Friday", () => {
    expect(nextWeekday(civilDate("2026-07-31"))).toBe("2026-08-03");
  });

  it("returns Monday for a Saturday", () => {
    expect(nextWeekday(civilDate("2026-08-01"))).toBe("2026-08-03");
  });

  it("returns the next day mid-week", () => {
    expect(nextWeekday(civilDate("2026-07-28"))).toBe("2026-07-29");
  });
});

describe("workingDaysBetween", () => {
  it("excludes the weekend in a full calendar week", () => {
    const days = workingDaysBetween(civilDate("2026-07-27"), civilDate("2026-08-02"));
    expect(days).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
    ]);
  });

  it("includes both endpoints when they are weekdays", () => {
    expect(workingDaysBetween(civilDate("2026-07-28"), civilDate("2026-07-28"))).toEqual([
      "2026-07-28",
    ]);
  });

  it("returns empty for a weekend-only span", () => {
    expect(workingDaysBetween(civilDate("2026-08-01"), civilDate("2026-08-02"))).toEqual([]);
  });

  it("returns empty when end precedes start", () => {
    expect(workingDaysBetween(civilDate("2026-07-31"), civilDate("2026-07-27"))).toEqual([]);
  });

  it("never includes a weekend across a long span", () => {
    const days = workingDaysBetween(civilDate("2026-07-10"), civilDate("2026-08-09"));
    for (const day of days) {
      expect(isWeekday(day)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @irp/core test`
Expected: FAIL — `Failed to resolve import "./weekday.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/weekday.ts`:

```ts
import { addDays, compareDates, dayOfWeek, type CivilDate } from "./civil-date.js";

const MONDAY = 1;
const FRIDAY = 5;

/** Monday to Friday. Weekends have no submission slot at all (FR-12). */
export function isWeekday(date: CivilDate): boolean {
  const day = dayOfWeek(date);
  return day >= MONDAY && day <= FRIDAY;
}

/** The nearest weekday strictly before `date`. Monday yields the prior Friday. */
export function previousWeekday(date: CivilDate): CivilDate {
  let cursor = addDays(date, -1);
  while (!isWeekday(cursor)) {
    cursor = addDays(cursor, -1);
  }
  return cursor;
}

/** The nearest weekday strictly after `date`. Friday yields the following Monday. */
export function nextWeekday(date: CivilDate): CivilDate {
  let cursor = addDays(date, 1);
  while (!isWeekday(cursor)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

/** Every weekday from `start` to `end` inclusive. Empty if end precedes start. */
export function workingDaysBetween(start: CivilDate, end: CivilDate): CivilDate[] {
  const days: CivilDate[] = [];
  let cursor = start;
  while (compareDates(cursor, end) <= 0) {
    if (isWeekday(cursor)) {
      days.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  return days;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @irp/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/weekday.ts packages/core/src/weekday.test.ts
git commit -m "feat(core): add weekday arithmetic skipping weekends"
```

---

### Task 6: Cycle boundaries

**Files:**
- Create: `packages/core/src/cycle.ts`
- Test: `packages/core/src/cycle.test.ts`

**Interfaces:**
- Consumes: `CivilDate`, `civilDate`, `compareDates` from Task 3; `workingDaysBetween` from Task 5
- Produces:
  - `interface CycleBounds { start: CivilDate; end: CivilDate }`
  - `cycleContaining(date: CivilDate): CycleBounds`
  - `shiftCycle(start: CivilDate, months: number): CivilDate`
  - `cycleWorkingDays(bounds: CycleBounds): CivilDate[]`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/cycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { civilDate } from "./civil-date.js";
import { cycleContaining, cycleWorkingDays, shiftCycle } from "./cycle.js";
import { isWeekday } from "./weekday.js";

describe("cycleContaining", () => {
  it("puts the 10th at the start of its own cycle", () => {
    expect(cycleContaining(civilDate("2026-08-10"))).toEqual({
      start: "2026-08-10",
      end: "2026-09-09",
    });
  });

  it("puts the 9th at the end of the previous cycle", () => {
    expect(cycleContaining(civilDate("2026-09-09"))).toEqual({
      start: "2026-08-10",
      end: "2026-09-09",
    });
  });

  it("places a mid-cycle date correctly", () => {
    expect(cycleContaining(civilDate("2026-08-25"))).toEqual({
      start: "2026-08-10",
      end: "2026-09-09",
    });
  });

  it("handles a date before the 10th in January", () => {
    expect(cycleContaining(civilDate("2026-01-05"))).toEqual({
      start: "2025-12-10",
      end: "2026-01-09",
    });
  });

  it("handles a short February", () => {
    expect(cycleContaining(civilDate("2026-02-20"))).toEqual({
      start: "2026-02-10",
      end: "2026-03-09",
    });
  });

  it("handles the December to January rollover", () => {
    expect(cycleContaining(civilDate("2026-12-15"))).toEqual({
      start: "2026-12-10",
      end: "2027-01-09",
    });
  });
});

describe("shiftCycle", () => {
  it("advances one cycle", () => {
    expect(shiftCycle(civilDate("2026-08-10"), 1)).toBe("2026-09-10");
  });

  it("advances across a year boundary", () => {
    expect(shiftCycle(civilDate("2026-12-10"), 1)).toBe("2027-01-10");
  });

  it("advances six cycles, the full programme length", () => {
    expect(shiftCycle(civilDate("2026-08-10"), 6)).toBe("2027-02-10");
  });

  it("goes backwards", () => {
    expect(shiftCycle(civilDate("2026-01-10"), -1)).toBe("2025-12-10");
  });
});

describe("cycleWorkingDays", () => {
  it("contains only weekdays", () => {
    const days = cycleWorkingDays({
      start: civilDate("2026-08-10"),
      end: civilDate("2026-09-09"),
    });
    for (const day of days) {
      expect(isWeekday(day)).toBe(true);
    }
  });

  it("starts on or after the cycle start and ends on or before the cycle end", () => {
    const days = cycleWorkingDays({
      start: civilDate("2026-08-10"),
      end: civilDate("2026-09-09"),
    });
    expect(days.at(0)).toBe("2026-08-10");
    expect(days.at(-1)).toBe("2026-09-09");
  });

  it("returns between 20 and 24 working days for a typical cycle", () => {
    const days = cycleWorkingDays({
      start: civilDate("2026-08-10"),
      end: civilDate("2026-09-09"),
    });
    expect(days.length).toBeGreaterThanOrEqual(20);
    expect(days.length).toBeLessThanOrEqual(24);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @irp/core test`
Expected: FAIL — `Failed to resolve import "./cycle.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/cycle.ts`:

```ts
import { civilDate, compareDates, dateParts, type CivilDate } from "./civil-date.js";
import { workingDaysBetween } from "./weekday.js";

/** Cycles run the 10th of one month to the 9th of the next (FR-9). */
const CYCLE_START_DAY = 10;
const CYCLE_END_DAY = 9;

export interface CycleBounds {
  readonly start: CivilDate;
  readonly end: CivilDate;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function pad4(value: number): string {
  return String(value).padStart(4, "0");
}

/** Build a CivilDate from year/month/day numbers, normalising month overflow. */
function build(year: number, month: number, day: number): CivilDate {
  let y = year;
  let m = month;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return civilDate(`${pad4(y)}-${pad2(m)}-${pad2(day)}`);
}

/** The 10th-to-9th cycle that `date` falls inside. */
export function cycleContaining(date: CivilDate): CycleBounds {
  const { year, month, day } = dateParts(date);
  // Before the 10th means we are still inside the cycle that opened last month.
  const startMonth = day < CYCLE_START_DAY ? month - 1 : month;
  // build() already normalises month over/underflow, so the end month can be
  // derived from the same unnormalised inputs rather than re-parsing `start`.
  return {
    start: build(year, startMonth, CYCLE_START_DAY),
    end: build(year, startMonth + 1, CYCLE_END_DAY),
  };
}

/** Move a cycle start forward or backward by whole cycles. */
export function shiftCycle(start: CivilDate, months: number): CivilDate {
  const { year, month } = dateParts(start);
  return build(year, month + months, CYCLE_START_DAY);
}

/** Every weekday inside a cycle. Weekends are absent, not marked (FR-12). */
export function cycleWorkingDays(bounds: CycleBounds): CivilDate[] {
  return workingDaysBetween(bounds.start, bounds.end);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @irp/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cycle.ts packages/core/src/cycle.test.ts
git commit -m "feat(core): add 10th-to-9th cycle boundary arithmetic"
```

---

### Task 7: Cycle anchoring to admission date

**Files:**
- Modify: `packages/core/src/cycle.ts`
- Modify: `packages/core/src/cycle.test.ts`

**Interfaces:**
- Consumes: `cycleContaining`, `shiftCycle`, `CycleBounds` from Task 6
- Produces:
  - `interface Cycle extends CycleBounds { index: number }` — `index` is 1-based
  - `firstEvaluatedCycleStart(admission: CivilDate): CivilDate`
  - `cycleFor(date: CivilDate, admission: CivilDate): Cycle | null` — `null` when `date` precedes the first evaluated cycle

**Why `null` rather than a partial cycle:** FR-27 says a student who joins **or leaves** partway through a cycle is not evaluated for that cycle. A student admitted 22 August is not evaluated for 10 Aug – 9 Sep; their first evaluated cycle is 10 Sep – 9 Oct. This is derived from FR-27, not assumed, so it carries no `ASSUMPTION` marker.

**Only the joining half of FR-27 is implemented here.** Departure is not modelled: there is no
`Enrolment` record to hang a departure date on until the data-model plan, and `cycleFor` takes
no departure argument. `cycleFor` is therefore **not FR-27-complete** — it will return a cycle
for a student who left halfway through it. Closing this needs the data model first, so it is
deliberately deferred rather than half-built here.

- [ ] **Step 1: Append the failing tests to `packages/core/src/cycle.test.ts`**

```ts
import { cycleFor, firstEvaluatedCycleStart } from "./cycle.js";

describe("firstEvaluatedCycleStart", () => {
  it("uses the same cycle when admitted exactly on the 10th", () => {
    expect(firstEvaluatedCycleStart(civilDate("2026-08-10"))).toBe("2026-08-10");
  });

  it("skips to the next cycle when admitted mid-cycle (FR-27)", () => {
    expect(firstEvaluatedCycleStart(civilDate("2026-08-22"))).toBe("2026-09-10");
  });

  it("skips to the next cycle when admitted on the 9th", () => {
    expect(firstEvaluatedCycleStart(civilDate("2026-09-09"))).toBe("2026-09-10");
  });

  it("handles admission before the 10th in January", () => {
    expect(firstEvaluatedCycleStart(civilDate("2026-01-05"))).toBe("2026-01-10");
  });
});

describe("cycleFor", () => {
  const admission = civilDate("2026-08-22");

  it("returns null for a date inside the skipped partial cycle", () => {
    expect(cycleFor(civilDate("2026-08-25"), admission)).toBeNull();
  });

  it("returns index 1 for the first evaluated cycle", () => {
    expect(cycleFor(civilDate("2026-09-15"), admission)).toEqual({
      start: "2026-09-10",
      end: "2026-10-09",
      index: 1,
    });
  });

  it("returns index 2 for the second evaluated cycle", () => {
    expect(cycleFor(civilDate("2026-10-15"), admission)).toEqual({
      start: "2026-10-10",
      end: "2026-11-09",
      index: 2,
    });
  });

  it("returns index 6 for the final programme cycle", () => {
    expect(cycleFor(civilDate("2027-02-15"), admission)?.index).toBe(6);
  });

  it("counts from the admission cycle when admitted exactly on the 10th", () => {
    expect(cycleFor(civilDate("2026-08-15"), civilDate("2026-08-10"))?.index).toBe(1);
  });

  it("returns null for a date before admission entirely", () => {
    expect(cycleFor(civilDate("2026-07-01"), admission)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @irp/core test`
Expected: FAIL — `firstEvaluatedCycleStart is not a function`.

- [ ] **Step 3: Append the implementation to `packages/core/src/cycle.ts`**

```ts
export interface Cycle extends CycleBounds {
  /** 1-based position within the student's programme. */
  readonly index: number;
}

/**
 * The first cycle a student is actually evaluated for.
 *
 * This implements only the JOINING half of FR-27. The full requirement is
 * that a student who joins *or leaves* partway through a cycle is not
 * evaluated for that cycle; here, admission counts only when it lands exactly
 * on a cycle start (the 10th), and otherwise evaluation begins with the
 * following cycle.
 *
 * Departure is not modelled at all. There is no enrolment record to hang a
 * departure date on until the data-model plan lands, and `cycleFor` takes no
 * departure argument. A caller must NOT treat `cycleFor` as FR-27-complete:
 * it will happily return a cycle for a student who left halfway through it.
 */
export function firstEvaluatedCycleStart(admission: CivilDate): CivilDate {
  const { start } = cycleContaining(admission);
  return admission === start ? start : shiftCycle(start, 1);
}

/** Whole cycles between two cycle starts. */
function cyclesBetween(from: CivilDate, to: CivilDate): number {
  const fromParts = dateParts(from);
  const toParts = dateParts(to);
  return (toParts.year - fromParts.year) * 12 + (toParts.month - fromParts.month);
}

/**
 * The evaluated cycle that `date` falls in, for a student admitted on
 * `admission`. Returns null when `date` precedes the first evaluated cycle.
 */
export function cycleFor(date: CivilDate, admission: CivilDate): Cycle | null {
  const first = firstEvaluatedCycleStart(admission);
  const bounds = cycleContaining(date);
  if (compareDates(bounds.start, first) < 0) {
    return null;
  }
  return { ...bounds, index: cyclesBetween(first, bounds.start) + 1 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @irp/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cycle.ts packages/core/src/cycle.test.ts
git commit -m "feat(core): anchor cycles to admission date per FR-27"
```

---

### Task 8: Submission window and grace

**Files:**
- Create: `packages/core/src/submission-window.ts`
- Test: `packages/core/src/submission-window.test.ts`

**Interfaces:**
- Consumes: `CivilDate`, `addDays`, `compareDates` from Task 3; `toProgrammeDate`, `endOfProgrammeDay` from Task 4; `previousWeekday`, `nextWeekday` from Task 5
- Produces:
  - `interface SubmissionWindow { targetDates: CivilDate[]; graceClosesAt: Date }`
  - `submissionWindow(now: Date): SubmissionWindow`
  - `graceDeadlineFor(target: CivilDate): Date`
  - `canSubmitFor(target: CivilDate, now: Date): boolean`

**Weekends are submittable (FR-33).** Optional days can hold Extra entries, so `canSubmitFor` has no weekday guard. One uniform rule covers both kinds of day: **grace for any date runs to the end of the next weekday.** Friday, Saturday and Sunday therefore all stay open until Monday 23:59:59 Colombo, and `graceDeadlineFor` needs no weekend branch at all.

**ASSUMPTION: O-10.** FR-13 accepts a late entry "for one further day"; FR-15 permits targeting "the current weekday or the immediately preceding weekday". These conflict on Monday — under FR-13 Friday's grace closes Saturday night, under FR-15 Friday is still Monday's "immediately preceding weekday". This implements the FR-15 reading. Since weekend work is *optional* (FR-12, FR-33), closing Friday's grace on Saturday night would force a weekend login to protect a weekday submission, making optional work effectively mandatory. Needs mentor confirmation.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/submission-window.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { civilDate } from "./civil-date.js";
import {
  canSubmitFor,
  graceDeadlineFor,
  submissionWindow,
} from "./submission-window.js";

// Colombo is UTC+05:30. 2026-07-28 is a Tuesday, 2026-07-31 a Friday,
// 2026-08-01 a Saturday, 2026-08-03 a Monday.
const tuesdayMorning = new Date("2026-07-28T04:00:00Z"); // 09:30 Tue in Colombo
const saturdayMorning = new Date("2026-08-01T04:00:00Z"); // 09:30 Sat in Colombo
const mondayMorning = new Date("2026-08-03T04:00:00Z"); // 09:30 Mon in Colombo

describe("submissionWindow", () => {
  it("allows today and the previous weekday on a mid-week day", () => {
    expect(submissionWindow(tuesdayMorning).targetDates).toEqual([
      "2026-07-28",
      "2026-07-27",
    ]);
  });

  it("allows Saturday itself plus the prior Friday, since weekends are optional work", () => {
    expect(submissionWindow(saturdayMorning).targetDates).toEqual([
      "2026-08-01",
      "2026-07-31",
    ]);
  });

  it("on Monday still allows the whole weekend and the prior Friday", () => {
    // Friday, Saturday and Sunday all have Monday as their next weekday,
    // so all three remain inside grace until Monday night.
    expect(submissionWindow(mondayMorning).targetDates).toEqual([
      "2026-08-03",
      "2026-08-02",
      "2026-08-01",
      "2026-07-31",
    ]);
  });

  it("drops the weekend again once Monday has passed", () => {
    const tuesdayAfter = new Date("2026-08-04T04:00:00Z");
    expect(submissionWindow(tuesdayAfter).targetDates).toEqual([
      "2026-08-04",
      "2026-08-03",
    ]);
  });

  it("closes grace at end of the current Colombo day mid-week", () => {
    expect(submissionWindow(tuesdayMorning).graceClosesAt.toISOString()).toBe(
      "2026-07-28T18:29:59.999Z",
    );
  });

  // graceClosesAt tracks the OLDEST open target, which on a weekend is the
  // preceding Friday — still open until Monday night. Reporting end-of-today
  // here would understate the window by up to two days.
  it("on a Saturday, grace closes at the end of Monday, not tonight", () => {
    expect(submissionWindow(saturdayMorning).graceClosesAt.toISOString()).toBe(
      "2026-08-03T18:29:59.999Z",
    );
  });

  it("on a Sunday, grace also closes at the end of Monday", () => {
    const sundayMorning = new Date("2026-08-02T04:00:00Z");
    expect(submissionWindow(sundayMorning).graceClosesAt.toISOString()).toBe(
      "2026-08-03T18:29:59.999Z",
    );
  });

  it("on a Monday, grace closes tonight — the prior Friday's last chance", () => {
    expect(submissionWindow(mondayMorning).graceClosesAt.toISOString()).toBe(
      "2026-08-03T18:29:59.999Z",
    );
  });
});

describe("graceDeadlineFor", () => {
  it("gives a mid-week target until the end of the next day", () => {
    expect(graceDeadlineFor(civilDate("2026-07-28")).toISOString()).toBe(
      "2026-07-29T18:29:59.999Z",
    );
  });

  it("gives a Friday target until the end of the following Monday", () => {
    expect(graceDeadlineFor(civilDate("2026-07-31")).toISOString()).toBe(
      "2026-08-03T18:29:59.999Z",
    );
  });
});

describe("canSubmitFor", () => {
  it("allows the current weekday", () => {
    expect(canSubmitFor(civilDate("2026-07-28"), tuesdayMorning)).toBe(true);
  });

  it("allows the previous weekday inside grace", () => {
    expect(canSubmitFor(civilDate("2026-07-27"), tuesdayMorning)).toBe(true);
  });

  it("rejects a day whose grace has closed", () => {
    expect(canSubmitFor(civilDate("2026-07-24"), tuesdayMorning)).toBe(false);
  });

  it("rejects a future date", () => {
    expect(canSubmitFor(civilDate("2026-07-29"), tuesdayMorning)).toBe(false);
  });

  it("accepts a weekend target as optional Extra work (FR-33)", () => {
    expect(canSubmitFor(civilDate("2026-08-01"), mondayMorning)).toBe(true);
  });

  it("accepts submitting for Saturday while it is still Saturday", () => {
    expect(canSubmitFor(civilDate("2026-08-01"), saturdayMorning)).toBe(true);
  });

  it("rejects a weekend target once its grace has closed", () => {
    const tuesdayAfter = new Date("2026-08-04T04:00:00Z");
    expect(canSubmitFor(civilDate("2026-08-01"), tuesdayAfter)).toBe(false);
  });

  it("still allows Friday on the following Monday (ASSUMPTION O-10)", () => {
    expect(canSubmitFor(civilDate("2026-07-31"), mondayMorning)).toBe(true);
  });

  it("rejects Friday once Monday has ended", () => {
    const tuesdayAfter = new Date("2026-08-04T04:00:00Z");
    expect(canSubmitFor(civilDate("2026-07-31"), tuesdayAfter)).toBe(false);
  });

  // Boundary is inclusive to the last millisecond of the Colombo day.
  it("accepts at the exact final millisecond of grace", () => {
    const lastInstant = new Date("2026-07-29T18:29:59.999Z");
    expect(canSubmitFor(civilDate("2026-07-28"), lastInstant)).toBe(true);
  });

  it("rejects one millisecond after grace closes", () => {
    const justAfter = new Date("2026-07-29T18:30:00.000Z");
    expect(canSubmitFor(civilDate("2026-07-28"), justAfter)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @irp/core test`
Expected: FAIL — `Failed to resolve import "./submission-window.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/submission-window.ts`:

```ts
import { addDays, compareDates, type CivilDate } from "./civil-date.js";
import { endOfProgrammeDay, toProgrammeDate } from "./programme-time.js";
import { nextWeekday, previousWeekday } from "./weekday.js";

export interface SubmissionWindow {
  /** Dates an entry may target right now. Most recent first. */
  readonly targetDates: CivilDate[];
  /** When the oldest currently-open target expires. */
  readonly graceClosesAt: Date;
}

/**
 * The last instant an entry for `target` is accepted.
 *
 * One rule covers required and optional days alike: grace runs to the end of
 * the next WEEKDAY. Friday, Saturday and Sunday all resolve to Monday night.
 *
 * ASSUMPTION: O-10. FR-13 says "one further day"; FR-15 says an entry may
 * target the current or immediately preceding weekday. They disagree on
 * Monday. This implements the FR-15 reading. Weekend work is optional
 * (FR-12, FR-33), so closing Friday's grace on Saturday night would force a
 * weekend login to protect a weekday submission — making optional work
 * effectively mandatory. Needs mentor confirmation.
 */
export function graceDeadlineFor(target: CivilDate): Date {
  return endOfProgrammeDay(nextWeekday(target));
}

/**
 * Whether an entry targeting `target` is accepted at instant `now`
 * (FR-14, FR-15, FR-33).
 *
 * No weekday guard: weekends are optional days that may hold Extra entries.
 */
export function canSubmitFor(target: CivilDate, now: Date): boolean {
  if (compareDates(target, toProgrammeDate(now)) > 0) {
    return false;
  }
  return now.getTime() <= graceDeadlineFor(target).getTime();
}

/**
 * Every date a student may submit for at instant `now`, most recent first.
 *
 * Candidates run from the previous weekday to today inclusive, which sweeps
 * up any intervening weekend. Each is then filtered by canSubmitFor, so the
 * grace rule stays in exactly one place.
 */
export function submissionWindow(now: Date): SubmissionWindow {
  const today = toProgrammeDate(now);
  const targetDates: CivilDate[] = [];

  let cursor = previousWeekday(today);
  while (compareDates(cursor, today) <= 0) {
    if (canSubmitFor(cursor, now)) {
      targetDates.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }
  // The oldest accepted target expires soonest, so its deadline is the one
  // that closes the window. Read before reverse(), while index 0 is still
  // the oldest.
  //
  // Do NOT shortcut this to endOfProgrammeDay(today). That is only correct
  // on a weekday, where nextWeekday(previousWeekday(today)) === today. On a
  // Saturday the oldest target is Friday, whose grace runs to Monday night
  // — reporting "tonight" would tell a student their window closes two days
  // early. Today is always submittable, so the fallback never fires.
  const graceClosesAt = graceDeadlineFor(targetDates[0] ?? today);

  targetDates.reverse();

  return { targetDates, graceClosesAt };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @irp/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/submission-window.ts packages/core/src/submission-window.test.ts
git commit -m "feat(core): add submission window and grace period

Implements the FR-15 reading of the grace window, which conflicts with
FR-13's 'one further day' on Mondays. Marked ASSUMPTION: O-10 pending
mentor confirmation."
```

---

### Task 9: Day classification

**Files:**
- Create: `packages/core/src/classify-day.ts`
- Test: `packages/core/src/classify-day.test.ts`

**Interfaces:**
- Consumes: `CivilDate` from Task 3; `toProgrammeDate` from Task 4; `isWeekday` from Task 5; `graceDeadlineFor` from Task 8
- Produces:
  - `type DayStatus = "onTime" | "late" | "absent" | "missed" | "pending" | "extra" | "none" | "future"`
  - `interface DayFacts { hasEntry: boolean; firstEntryAt: Date | null; hasAbsence: boolean }`
  - `classifyDay(date: CivilDate, facts: DayFacts, now: Date): DayStatus`

There is deliberately **no `rejected` status** — the review flow has no reject state.

**The on-time member is `onTime`, deliberately not `submitted`.** Plan 2's OpenAPI carries a
review state also called `Submitted`, meaning *has been handed in*. That is a different axis
from *was it delivered by its deadline* — a late entry is `Submitted` in the review sense and
`late` here. Two adjacent `status` concepts sharing a value name with different semantics is a
bug factory, so they are kept distinct by name.

**Required days** (weekdays) resolve to `onTime`/`late`/`absent`/`missed`/`pending`.
**Optional days** (weekends) resolve to `extra` when work was recorded and `none` when it was
not — never `missed`, never `late`, because you cannot be late for work that was never
required (FR-12, FR-33). Absence does not apply to a weekend and is ignored there.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/classify-day.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { civilDate } from "./civil-date.js";
import { classifyDay, type DayFacts } from "./classify-day.js";

const none: DayFacts = { hasEntry: false, firstEntryAt: null, hasAbsence: false };
const tuesday = civilDate("2026-07-28");
const tuesdayMidday = new Date("2026-07-28T06:00:00Z");
const thursdayAfter = new Date("2026-07-30T06:00:00Z");

describe("classifyDay", () => {
  it("returns future for a date after today", () => {
    expect(classifyDay(civilDate("2026-07-30"), none, tuesdayMidday)).toBe("future");
  });

  it("returns pending for today with no entry yet", () => {
    expect(classifyDay(tuesday, none, tuesdayMidday)).toBe("pending");
  });

  it("returns onTime when the entry landed on the day itself", () => {
    const facts: DayFacts = {
      hasEntry: true,
      firstEntryAt: new Date("2026-07-28T10:00:00Z"),
      hasAbsence: false,
    };
    expect(classifyDay(tuesday, facts, thursdayAfter)).toBe("onTime");
  });

  it("returns late when the entry landed after the day ended but inside grace", () => {
    const facts: DayFacts = {
      hasEntry: true,
      firstEntryAt: new Date("2026-07-29T06:00:00Z"),
      hasAbsence: false,
    };
    expect(classifyDay(tuesday, facts, thursdayAfter)).toBe("late");
  });

  // Where the O-10 grace assumption meets the classifier. canSubmitFor keeps
  // Friday open until Monday night, so a Friday entry created Monday morning
  // is ACCEPTED — but Friday's own day ended long before, so the mentor must
  // still see it as late, not on time.
  it("returns late for a Friday entry that landed the following Monday morning", () => {
    const friday = civilDate("2026-07-31");
    const facts: DayFacts = {
      hasEntry: true,
      firstEntryAt: new Date("2026-08-03T04:00:00Z"), // 09:30 Monday in Colombo
      hasAbsence: false,
    };
    const laterThatWeek = new Date("2026-08-05T06:00:00Z");
    expect(classifyDay(friday, facts, laterThatWeek)).toBe("late");
  });

  it("returns absent when marked absent, even with no entry", () => {
    const facts: DayFacts = { hasEntry: false, firstEntryAt: null, hasAbsence: true };
    expect(classifyDay(tuesday, facts, thursdayAfter)).toBe("absent");
  });

  it("prefers absent over missed", () => {
    const facts: DayFacts = { hasEntry: false, firstEntryAt: null, hasAbsence: true };
    expect(classifyDay(civilDate("2026-07-20"), facts, thursdayAfter)).toBe("absent");
  });

  it("returns missed once grace has closed with nothing recorded", () => {
    expect(classifyDay(civilDate("2026-07-20"), none, thursdayAfter)).toBe("missed");
  });

  it("returns pending while grace is still open with nothing recorded", () => {
    // Monday 27th, judged on Tuesday 28th — grace runs to end of Tuesday.
    expect(classifyDay(civilDate("2026-07-27"), none, tuesdayMidday)).toBe("pending");
  });

  it("returns extra for a weekend day with an entry (FR-33)", () => {
    const facts: DayFacts = {
      hasEntry: true,
      firstEntryAt: new Date("2026-08-01T10:00:00Z"),
      hasAbsence: false,
    };
    const laterThatWeek = new Date("2026-08-05T06:00:00Z");
    expect(classifyDay(civilDate("2026-08-01"), facts, laterThatWeek)).toBe("extra");
  });

  it("returns none for a weekend day with no entry — never missed", () => {
    const laterThatWeek = new Date("2026-08-05T06:00:00Z");
    expect(classifyDay(civilDate("2026-08-01"), none, laterThatWeek)).toBe("none");
  });

  it("never returns late for a weekend, however long after the entry landed", () => {
    const facts: DayFacts = {
      hasEntry: true,
      firstEntryAt: new Date("2026-08-03T10:00:00Z"), // Monday, after Saturday ended
      hasAbsence: false,
    };
    const laterThatWeek = new Date("2026-08-05T06:00:00Z");
    expect(classifyDay(civilDate("2026-08-01"), facts, laterThatWeek)).toBe("extra");
  });

  it("ignores an absence record on a weekend", () => {
    const facts: DayFacts = { hasEntry: false, firstEntryAt: null, hasAbsence: true };
    const laterThatWeek = new Date("2026-08-05T06:00:00Z");
    expect(classifyDay(civilDate("2026-08-01"), facts, laterThatWeek)).toBe("none");
  });

  it("returns future for a weekend still ahead", () => {
    expect(classifyDay(civilDate("2026-08-01"), none, tuesdayMidday)).toBe("future");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @irp/core test`
Expected: FAIL — `Failed to resolve import "./classify-day.js"`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/classify-day.ts`:

```ts
import { compareDates, type CivilDate } from "./civil-date.js";
import { endOfProgrammeDay, toProgrammeDate } from "./programme-time.js";
import { graceDeadlineFor } from "./submission-window.js";
import { isWeekday } from "./weekday.js";

/**
 * The state of one day for one student.
 *
 * Required days (weekdays) resolve to the first five. Optional days
 * (weekends) resolve to "extra" or "none" — never missed, never late,
 * because you cannot be late for work that was never required.
 *
 * There is no "rejected" — the review flow runs Submitted to In Review to
 * Evaluated with no reject step, and that is a confirmed non-goal.
 *
 * "onTime" is deliberately NOT called "submitted". These are two different
 * axes: DayStatus answers "was the work delivered by its deadline", while the
 * review flow's `Submitted` state answers "has the work been handed in for
 * review yet". A late entry is `Submitted` in the review sense and "late"
 * here. Giving both the same name would invite a caller to compare across
 * the two and quietly get the wrong answer.
 */
export type DayStatus =
  | "onTime"
  | "late"
  | "absent"
  | "missed"
  | "pending"
  | "extra"
  | "none"
  | "future";

/**
 * What is on record for one day.
 *
 * A discriminated union rather than three independent fields. `hasEntry: true`
 * alongside `firstEntryAt: null` is not a state this system can be in, and
 * leaving it representable means a later fact-builder could produce a day that
 * holds a real entry but classifies as `missed` — a silent, wrong figure on
 * the mentor's dashboard. Making it unrepresentable costs nothing here.
 */
export type DayFacts =
  | {
      readonly hasEntry: true;
      /** When the earliest entry for this date was created. */
      readonly firstEntryAt: Date;
      readonly hasAbsence: boolean;
    }
  | {
      readonly hasEntry: false;
      readonly firstEntryAt: null;
      readonly hasAbsence: boolean;
    };

/**
 * Classify one day.
 *
 * Order matters twice over. Future is checked first so an unreached day is
 * never reported as a gap. On required days, absence wins over missed because
 * absence is explicitly recorded with a reason and carries no penalty, while
 * missed is a silence.
 */
export function classifyDay(date: CivilDate, facts: DayFacts, now: Date): DayStatus {
  if (compareDates(date, toProgrammeDate(now)) > 0) {
    return "future";
  }

  // Optional day (FR-33). Recorded work is Extra; silence is nothing at all.
  // An absence record here is meaningless — there was nothing to be absent
  // from — so it is ignored rather than treated as a state.
  if (!isWeekday(date)) {
    return facts.hasEntry ? "extra" : "none";
  }

  // The union narrows firstEntryAt to Date here — no null check needed.
  if (facts.hasEntry) {
    const dayEnded = endOfProgrammeDay(date).getTime();
    return facts.firstEntryAt.getTime() <= dayEnded ? "onTime" : "late";
  }

  if (facts.hasAbsence) {
    return "absent";
  }

  // Nothing recorded. Still open until grace closes; final afterwards (FR-14).
  return now.getTime() <= graceDeadlineFor(date).getTime() ? "pending" : "missed";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @irp/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/classify-day.ts packages/core/src/classify-day.test.ts
git commit -m "feat(core): classify weekdays as submitted, late, absent or missed"
```

---

### Task 10: Public barrel and the never-a-weekend property test

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/invariants.test.ts`
- Delete: `packages/core/src/smoke.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–9
- Produces: the complete `@irp/core` public surface, importable as `import { ... } from "@irp/core"`

- [ ] **Step 1: Write the invariant tests**

Create `packages/core/src/invariants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addDays,
  civilDate,
  classifyDay,
  cycleContaining,
  cycleWorkingDays,
  isWeekday,
  nextWeekday,
  previousWeekday,
  submissionWindow,
  toProgrammeDate,
  type DayFacts,
} from "./index.js";

/** Every date from 2026-01-01 for three years. */
function everyDateForThreeYears(): string[] {
  const dates: string[] = [];
  let cursor = civilDate("2026-01-01");
  const stop = civilDate("2029-01-01");
  while (cursor < stop) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

describe("invariants across three years of dates", () => {
  const all = everyDateForThreeYears();

  it("previousWeekday never returns a weekend", () => {
    for (const date of all) {
      expect(isWeekday(previousWeekday(civilDate(date)))).toBe(true);
    }
  });

  it("nextWeekday never returns a weekend", () => {
    for (const date of all) {
      expect(isWeekday(nextWeekday(civilDate(date)))).toBe(true);
    }
  });

  it("cycleWorkingDays never contains a weekend", () => {
    for (const date of all) {
      for (const day of cycleWorkingDays(cycleContaining(civilDate(date)))) {
        expect(isWeekday(day)).toBe(true);
      }
    }
  });

  it("every cycle runs from a 10th to a 9th", () => {
    for (const date of all) {
      const { start, end } = cycleContaining(civilDate(date));
      expect(start.endsWith("-10")).toBe(true);
      expect(end.endsWith("-09")).toBe(true);
    }
  });

  it("every cycle contains the date that produced it", () => {
    for (const date of all) {
      const { start, end } = cycleContaining(civilDate(date));
      expect(start <= date && date <= end).toBe(true);
    }
  });

  // A single mid-day instant per date exercises the calendar arithmetic
  // thoroughly and the timezone boundary not at all. 18:29:59.999Z is the
  // last millisecond of a Colombo day and 18:30:00.000Z the first of the
  // next, so each date is also probed either side of the rollover — where a
  // UTC-vs-Colombo mixup would show up as an off-by-one day.
  const instantsFor = (date: string): Date[] => [
    new Date(`${date}T06:00:00Z`),
    new Date(`${date}T18:29:59.999Z`),
    new Date(`${date}T18:30:00.000Z`),
  ];

  it("submissionWindow always offers today as a target, including across the Colombo midnight boundary", () => {
    // Today can never be out of grace, weekday or weekend. "Today" is the
    // Colombo date at that instant, which past 18:30Z is the NEXT UTC date.
    for (const date of all) {
      for (const instant of instantsFor(date)) {
        const today = toProgrammeDate(instant);
        expect(submissionWindow(instant).targetDates).toContain(today);
      }
    }
  });

  it("submissionWindow never offers a future date, including across the Colombo midnight boundary", () => {
    for (const date of all) {
      for (const instant of instantsFor(date)) {
        const today = toProgrammeDate(instant);
        for (const target of submissionWindow(instant).targetDates) {
          expect(target <= today).toBe(true);
        }
      }
    }
  });

  it("a weekend is never missed, late, absent or pending (FR-12, FR-33)", () => {
    const withEntry: DayFacts = {
      hasEntry: true,
      firstEntryAt: new Date("2026-01-01T00:00:00Z"),
      hasAbsence: true,
    };
    const withoutEntry: DayFacts = {
      hasEntry: false,
      firstEntryAt: null,
      hasAbsence: true,
    };
    const wellAfter = new Date("2029-06-01T06:00:00Z");
    for (const date of all) {
      if (isWeekday(civilDate(date))) continue;
      expect(classifyDay(civilDate(date), withEntry, wellAfter)).toBe("extra");
      expect(classifyDay(civilDate(date), withoutEntry, wellAfter)).toBe("none");
    }
  });

  // Asserting the exact status, not just "not extra and not none" — the
  // negative form would pass for six different statuses and so proves very
  // little. Every date in this sweep is a past weekday with nothing on
  // record and grace long closed, which is exactly "missed".
  it("a weekday with nothing recorded and grace closed is always missed", () => {
    const facts: DayFacts = { hasEntry: false, firstEntryAt: null, hasAbsence: false };
    const wellAfter = new Date("2029-06-01T06:00:00Z");
    for (const date of all) {
      if (!isWeekday(civilDate(date))) continue;
      expect(classifyDay(civilDate(date), facts, wellAfter)).toBe("missed");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @irp/core test`
Expected: FAIL — the barrel exports nothing yet, so imports are undefined.

- [ ] **Step 3: Write the barrel**

Replace `packages/core/src/index.ts` entirely:

```ts
export {
  addDays,
  civilDate,
  compareDates,
  dateParts,
  dayOfWeek,
  type CivilDate,
} from "./civil-date.js";
export {
  PROGRAMME_TIME_ZONE,
  endOfProgrammeDay,
  toProgrammeDate,
} from "./programme-time.js";
export {
  isWeekday,
  nextWeekday,
  previousWeekday,
  workingDaysBetween,
} from "./weekday.js";
export {
  cycleContaining,
  cycleFor,
  cycleWorkingDays,
  firstEvaluatedCycleStart,
  shiftCycle,
  type Cycle,
  type CycleBounds,
} from "./cycle.js";
export {
  canSubmitFor,
  graceDeadlineFor,
  submissionWindow,
  type SubmissionWindow,
} from "./submission-window.js";
export { classifyDay, type DayFacts, type DayStatus } from "./classify-day.js";
```

- [ ] **Step 4: Delete the smoke test**

```bash
rm packages/core/src/smoke.test.ts
```

- [ ] **Step 5: Run the full suite**

Run: `pnpm --filter @irp/core test`
Expected: PASS, all suites green.

- [ ] **Step 6: Verify types compile**

Run: `pnpm --filter @irp/core typecheck`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/invariants.test.ts
git rm packages/core/src/smoke.test.ts
git commit -m "feat(core): export public surface and add weekend invariants"
```

---

### Task 11: Timezone-hostile CI

**Files:**
- Modify: `packages/core/package.json`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the `test` and `typecheck` scripts from Tasks 1–2
- Produces: a PR workflow that runs the suite twice under two hostile timezones

**Why this matters:** the single most likely silent failure in this project is code that reads the server's local timezone and happens to work on a machine set to Asia/Colombo. The deploy region is not Sri Lanka. Running the suite under a deliberately wrong `TZ` turns that from a production surprise into a CI failure.

- [ ] **Step 1: Add a hostile-timezone test script to `packages/core/package.json`**

Replace the `scripts` block:

```json
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:tz": "cross-env TZ=America/New_York vitest run"
  },
```

Add to `devDependencies`:

```json
    "cross-env": "^10.1.0"
```

- [ ] **Step 2: Verify the suite passes under a hostile timezone**

Run: `pnpm install && pnpm --filter @irp/core test:tz`
Expected: PASS. If anything fails here, the failure is real — some code is reading local time.

- [ ] **Step 3: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        # The deploy region is not Sri Lanka. Running under hostile zones
        # catches any reliance on server local time (NFR-12).
        timezone: ["UTC", "America/New_York", "Pacific/Kiritimati"]
    env:
      TZ: ${{ matrix.timezone }}
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 11.17.0

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm -r typecheck

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm -r test
```

`Pacific/Kiritimati` is UTC+14, the furthest zone ahead of Colombo; `America/New_York` is well behind it. Between them they catch both directions of off-by-one-day error.

- [ ] **Step 4: Verify the workflow file is valid YAML**

Run: `node -e "const {readFileSync}=require('fs');const s=readFileSync('.github/workflows/ci.yml','utf8');if(!s.includes('runs-on'))throw new Error('malformed');console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml packages/core/package.json pnpm-lock.yaml
git commit -m "ci: run test suite under three hostile timezones

Guards NFR-12. Code that reads server local time passes locally and
fails in the deploy region; this catches it in CI instead."
```

- [ ] **Step 6: Push and confirm CI is green**

```bash
git push -u origin HEAD
```

Expected: all three matrix jobs pass on GitHub Actions.

---

## Definition of done for this plan

- [ ] `pnpm install` succeeds from a clean checkout
- [ ] `pnpm -r typecheck` exits 0
- [ ] `pnpm lint` exits 0 with no warnings
- [ ] `pnpm -r test` passes
- [ ] `pnpm --filter @irp/core test:tz` passes
- [ ] CI green across all three timezone matrix jobs
- [ ] `@irp/core` exports the full documented surface from `src/index.ts`
- [ ] Every `ASSUMPTION:` marker in the code has a matching entry in the open-points list

## Follow-ups this plan creates

| # | Item | Owner | When |
|---|---|---|---|
| O-10 | Grace-window conflict between FR-13 and FR-15 — implemented on the FR-15 reading, needs mentor confirmation | Damian | Next batched Teams message |
| O-11 | Weekends reclassified as optional Extra work, revising FR-12 and adding FR-33. **Changes §3.4, which §4.2 reserves to the decision owner** — needs mentor sign-off | Damian | Next batched Teams message |
| O-12 | Next.js 16 in place of the pinned 15 ([ADR-0004](../../adr/0004-nextjs-16-over-pinned-15.md)). **Needs mentor sign-off before Plan 3**; reversal cost is zero until then | Damian | Next batched Teams message |
| — | Move to TypeScript 7 once typescript-eslint supports it ([ADR-0005](../../adr/0005-typescript-6-for-eslint-compatibility.md)). Without this recorded, "temporarily one behind" becomes permanent | Damian | Check at Plan 4 |
| — | O-10, O-11 and O-12 are all recorded in `docs/interview-and-prd.md` §5 | — | Done |
| — | Plan 2: API contract and service | — | After this plan merges |
