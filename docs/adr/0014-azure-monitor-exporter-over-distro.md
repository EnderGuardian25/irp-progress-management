# ADR-0014 — The Azure Monitor trace exporter, not the Azure Monitor distro

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint)
- **Requirements:** NFR-6 (traces visible in App Insights within 60 s); Deliverable 3
- **Relates to:** ADR-0007 (hand-written tracing plugin over auto-instrumentation), ADR-0005
  (pin the newest version the ecosystem supports, not the newest published)

## Context

`apps/api` traces requests through a hand-written Fastify plugin and exports spans through the
`createTracerProvider(exporter: SpanExporter)` seam. Plan 4B sends those spans to Application
Insights, so this plan chooses what sits on the far side of the seam.

## Decision

Depend on **`@azure/monitor-opentelemetry-exporter`, pinned exactly to `1.0.0-beta.43`**, and
select it at runtime when `APPLICATIONINSIGHTS_CONNECTION_STRING` is present.

The version is exact, with no caret. `^1.0.0-beta.43` resolves to `1.0.0-preview.6` — semver
compares prerelease identifiers alphabetically and `"preview" > "beta"` — and that preview is
from 2020, requiring `@opentelemetry/api ^0.10.2`. A range here silently downgrades the whole
telemetry stack by five years.

## Consequences

### Positive

- One dependency, implementing the `SpanExporter` interface the seam already takes. Nothing about
  how the service is composed changes.
- Its OpenTelemetry ranges (`sdk-trace-base ^2.8.0`, `resources ^2.8.0`,
  `semantic-conventions ^1.40.0`, `api ^1.9.0`) are satisfied by this repo's existing pins, so no
  other version moves.
- 4B's observability work becomes supplying a connection string.

### Negative

- **It is a beta, and this package line has never had a stable release.** That is a real risk
  accepted deliberately, as with `next-auth` in ADR-0010. The mitigation is the seam itself:
  `selectSpanExporter` is four lines and the exporter is replaceable without touching the tracing
  plugin, the provider, or any route.
- `latest` is `1.0.0-beta.32`, an *older* build than the `1.0.0-beta.43` pinned here, so a bare
  `pnpm add` gives something different from what this repo uses. The pin must stay exact.

## Alternatives considered

### Rejected — `@azure/monitor-opentelemetry` (the distro)

Superficially the better choice: version `1.18.2` is **stable**, whereas the exporter is a beta.
Rejected for two reasons. First, it bundles auto-instrumentation for HTTP, pg, redis, mongodb,
mysql, winston and bunyan, plus `@opentelemetry/sdk-node` — which directly contradicts **ADR-0007**,
where auto-instrumentation was rejected in favour of the hand-written plugin. Adopting the distro
would reverse that decision as a side effect of picking an exporter. Second, its stability is
partly cosmetic here: `@azure/monitor-opentelemetry@1.18.2` itself depends on
`@azure/monitor-opentelemetry-exporter@1.0.0-beta.43`, so the distro ships the very beta this ADR
pins. The choice is not "stable versus beta"; it is "the beta, or the beta plus an
auto-instrumentation tree we already rejected".

### Rejected — an OTLP exporter pointed at Application Insights

Vendor-neutral, stable, and it would keep the code portable to any OTLP backend. Rejected because
Application Insights has no first-class OTLP ingestion endpoint: reaching it over OTLP requires
running an OpenTelemetry Collector as a sidecar or separate container. That is an extra deployable
component, an extra thing in `main.bicep`, and an extra failure mode between the API and its
traces — for a portability benefit this project has no stated need for, on a deploy target
`CLAUDE.md` fixes as Azure.

## Revisit when

- **A stable `@azure/monitor-opentelemetry-exporter` 1.0.0 ships** — take it.
- **Traces do not appear in App Insights within 60 s during Plan 4B**, which would make NFR-6 fail
  and put the distro's `sdk-node` wiring back on the table despite ADR-0007.
- **The system needs a second telemetry backend**, at which point OTLP plus a collector stops being
  overhead and starts being the point.
