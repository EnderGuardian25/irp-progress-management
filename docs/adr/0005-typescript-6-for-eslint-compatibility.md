# ADR-0005 — TypeScript 6.0.3 rather than 7.0.2, for ESLint compatibility

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Damian De Cruz (Impl Lead — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** none directly; governs every package in the workspace
- **Relates to:** ADR-0004

---

## Context

The Impl Lead issued a standing instruction to build on the newest available version of
every framework and platform. On 2026-07-28 that means **TypeScript 7.0.2**, the first stable
release of the native compiler — a substantial rewrite, and notably faster than the
JavaScript-based toolchain it replaces.

The same session added ESLint to Plan 1, because the spec's PR pipeline lists a lint step
that nothing implemented.

These two decisions are in direct conflict, and the conflict is hard rather than a warning:

```
typescript-eslint@8.65.0  peerDependencies:
  eslint:     ^8.57.0 || ^9.0.0 || ^10.0.0
  typescript: >=4.8.4 <6.1.0        ← 7.0.2 is outside this range
```

The critical detail is that **ESLint cannot parse TypeScript at all without
typescript-eslint** — it supplies the parser, not merely a rule set. So this is not a matter
of losing some type-aware rules on TypeScript 7; it is losing the ability to lint `.ts` files
whatsoever. "Newest TypeScript" and "ESLint" are mutually exclusive today.

Available stable releases when this was decided: 5.9.3, **6.0.3**, 7.0.2.

## Decision

Pin the workspace to **TypeScript 6.0.3** — the newest stable release that the surrounding
ecosystem actually supports — with **typescript-eslint 8.65.0** and **ESLint 10.8.0**
providing type-aware linting.

The governing principle, which generalises beyond this one choice: *newest version that the
tools around it support*, not *newest version published*.

## Consequences

### Positive

- Full type-aware linting works, so the spec's PR pipeline is implementable as written.
- 6.0.3 is a stable release, not a beta or release candidate.
- Reduces risk across the rest of the stack. Prisma 7, Next.js 16 and Vitest 4 all currently
  target the JavaScript-based compiler; TypeScript 7 is days old in ecosystem terms and its
  compiler-API changes are exactly what breaks tooling that reaches into it.
- The upgrade path is a version bump. Nothing in the codebase becomes harder to migrate by
  waiting.

### Negative

- One major version behind the newest release, so the sprint does not get TypeScript 7's
  compile-speed improvement. At this codebase's size that is not a measurable cost.
- Creates a standing follow-up: when typescript-eslint ships TypeScript 7 support, the
  workspace should move. Without that follow-up recorded, "temporarily one behind" quietly
  becomes permanent.

## Alternatives considered

### Rejected — TypeScript 7.0.2 with no ESLint

Honours the newest-version instruction literally. Rejected because it reverses the ESLint
decision taken minutes earlier in the same session, and because it leaves the spec's stated
PR pipeline unimplementable. It also concentrates ecosystem risk: the version most likely to
break Prisma and Next tooling, adopted with the least tooling available to detect the
breakage.

### Rejected — TypeScript 7.0.2 with typescript-eslint's canary build

typescript-eslint publishes a canary at `8.65.1-alpha.8`. Rejected because the published peer
range still excludes TypeScript 7, so there is no evidence the canary supports it — verifying
would mean a spike with a substantial chance of landing back on TypeScript 6 anyway. Building
the whole workspace's lint capability on an alpha is also poor footing for a graded sprint.

### Rejected — TypeScript 5.9.3

Inside typescript-eslint's supported range and the most conservative option. Rejected as
needlessly old: 6.0.3 is equally stable, equally supported, and a whole major closer to
current. There is no reason to give up a major version for no compatibility gain.

## Revisit when

- typescript-eslint publishes support for TypeScript 7 — at which point the workspace moves
  to 7.x and this ADR is superseded.
- Any other dependency forces a TypeScript version outside 6.x.
