# ADR-0013 — `proxy.ts` over `middleware.ts`: moving the auth guard from Edge to Node

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint)
- **Requirements:** FR-1, FR-2 (authenticated access), NFR-14
- **Relates to:** ADR-0009 (hosting topology — the deploy target settles this), ADR-0012 (the dev
  auth bypass, whose guard is invoked from this entry point)

## Context

Next 16 deprecates the `middleware.ts` file convention in favour of `proxy.ts`, warning on every
build. Adopting it looks like a rename and is not one. Per `next/dist/build/entries.js`:

    if (isProxyFile(params.page))      { params.onServer(); return; }
    if (isMiddlewareFile(params.page)) {
      if (params.pageRuntime === 'nodejs') { params.onServer(); return; }
      else                                 { params.onEdgeServer(); return; }
    }

So `proxy.ts` runs on **Node**, unconditionally, while `middleware.ts` runs on the **Edge** unless
its runtime is set explicitly. This file holds the sign-in UX redirect and, through its
`auth.config.ts` import, one of the three entry points that invoke `assertBypassNotInProduction`.
Next hard-errors if both files exist, so there is no incremental migration.

The export contract also changes: Next resolves
`(isProxy ? mod.proxy : mod.middleware) || mod.default`, so the export must be renamed to `proxy` or
the build throws `ProxyMissingExportError` — something `tsc` cannot catch.

## Decision

Adopt `proxy.ts`, exporting `proxy`, keeping the existing matcher and the `auth.config.ts` import.
Delete `middleware.ts` in the same commit.

The deploy target settles it. ADR-0009 puts this application in a container on Azure Container Apps
running Node, with no Edge network anywhere in the topology. The Edge bundle is dead weight there,
and Node is the runtime that actually serves the guard.

## Consequences

### Positive

- The build warning is gone, and the file convention matches the framework's supported direction
  rather than a deprecated one.
- The guard runs on the same runtime as the rest of the server, so there is one execution
  environment to reason about instead of two.
- Node lifts the Edge runtime's API restrictions for anything this file needs later.

### Negative

- **It is a behavioural change on the auth path**, which is the most sensitive path in the system.
  The mitigation is that `apps/api` — not this file — is the security boundary, plus the full
  Playwright suite as a gate.
- Node middleware runs in the server process rather than at the edge, so it cannot short-circuit
  before reaching the origin. Irrelevant here: there is no CDN or edge tier in ADR-0009's topology.

## Alternatives considered

### Rejected — keep `middleware.ts` and live with the deprecation warning

Zero risk today, and the file works. Rejected because the warning is a deprecation, not a style
note: the convention will be removed, and the migration would then land in whichever plan is least
able to absorb an auth-path change. Doing it here — where the container that settles the runtime
question is being built, and where a full Playwright run is already part of the task — is the
cheapest this ever gets. Carrying a known-required change forward also means every future
`next build` log has a warning in it, which is how real warnings get missed.

### Rejected — keep `middleware.ts` and pin `runtime: 'nodejs'`

The subtle one, and genuinely tempting: `isMiddlewareFile` with `pageRuntime === 'nodejs'` also
routes to `onServer()`, so this achieves the Edge → Node move with a one-line config addition and
no rename. Rejected because it takes the runtime change *without* the deprecation fix — the file
convention is still the deprecated one, the warning still prints, and the migration is still owed.
It is strictly the worse half of the same work, and it leaves the codebase in a state where a
future reader sees a `nodejs` runtime pin and cannot tell whether it was deliberate or a
workaround.

### Rejected — delete the file entirely and rely on `apps/api`

Defensible on security grounds: this file is explicitly *not* the security boundary, and
`apps/api`'s global fail-closed hook is. Rejected because the redirect is a UX affordance, not a
control — without it, an unauthenticated user reaches a page shell that then fails its data fetch,
instead of landing on `/signin`. Deleting it would also remove one of the three entry points that
invoke `assertBypassNotInProduction`, narrowing that guard's coverage for no gain.

## Revisit when

- **An edge tier or CDN is introduced**, at which point running the redirect at the edge would
  genuinely save an origin round trip.
- **Next stabilises a different convention again** — the same analysis applies: check
  `runDependingOnPageType`, do not assume it is a rename.
