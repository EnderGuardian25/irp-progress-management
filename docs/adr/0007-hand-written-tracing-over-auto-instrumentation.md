# ADR-0007 — Hand-written request tracing over auto-instrumentation

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** NFR-6 (trace visibility in App Insights within 60 s of a request)
- **Relates to:** ADR-0006 (OpenAPI 3.1 over 3.0)

---

## Context

Deliverable 3 (`apps/api`, Plan 2B) requires every request to be traced, and every RFC 7807
Problem body the API returns must carry the active `traceId` so a mentor-reported error can be
matched to a trace in Application Insights. `apps/api` is an ESM package (`"type": "module"` in
`apps/api/package.json`; relative imports carry explicit `.js` extensions), which constrains how
OpenTelemetry can be wired in: Node's ESM loader does not let a library monkey-patch another
module's exports the way CommonJS `require` interception does, without an explicit loader hook.

Three OpenTelemetry instrumentation strategies were available for a Fastify service:

1. Auto-instrumentation packages (`@opentelemetry/instrumentation-fastify`,
   `@opentelemetry/instrumentation-http`) that patch Fastify's and Node's internals to emit
   spans automatically.
2. `@fastify/otel`, a Fastify-native plugin that wraps the same auto-instrumentation idea behind
   a first-party plugin interface.
3. A hand-written Fastify plugin using `@opentelemetry/sdk-trace-node` directly: one span per
   request, created in an `onRequest` hook and closed in `onResponse`, with the tracer provider
   and its `SpanExporter` injected into `buildServer` rather than reached via global state.

Deliverable 3 also needs deterministic tests: a test must be able to assert "exactly one span
was recorded, and it carries the response status code" without depending on export timing,
batching windows, or a running collector.

## Decision

Write the tracing plugin by hand, exporting three functions from `apps/api/src/telemetry.ts`:

- `createTracerProvider(exporter: SpanExporter): NodeTracerProvider` — builds a
  `NodeTracerProvider` from `@opentelemetry/sdk-trace-node`, given an **injected** exporter,
  wired through a `SimpleSpanProcessor` (exports synchronously on span end, so tests observe the
  span immediately after the request completes rather than after a batch flush).
- `tracingPlugin` — a `fastify-plugin`-wrapped plugin that takes an already-built
  `NodeTracerProvider` as an option, starts one span per request in `onRequest`, records thrown
  errors on the span in `onError`, and sets `http.status_code` and ends the span in `onResponse`.
  The span is stored on `request.span` (a module augmentation of `FastifyRequest`).
- `currentTraceId(request): string | undefined` — reads the 32-hex trace ID off
  `request.span`'s span context, returning `undefined` if there is no span or the context is the
  all-zero invalid trace ID.

The exporter is dependency-injected at `createTracerProvider` call sites: a `ConsoleSpanExporter`
(or, from Plan 4 onward, an Azure Monitor exporter) in `buildServer` for real traffic, and
`InMemorySpanExporter` from `@opentelemetry/sdk-trace-base` in tests.

## Consequences

### Positive

- **No ESM loader flags.** Auto-instrumentation patches modules by intercepting `require`/
  `import`, which under Node's ESM loader needs `--experimental-loader` (or `--import` with a
  `register()` call) wired into every entry point — `dev` (`tsx watch`), `test` (`vitest`), and
  the production container command. A hand-written plugin needs none of that: it is ordinary
  imported code that Fastify calls through its hook lifecycle.
- **Deterministic tests.** `InMemorySpanExporter` plus `SimpleSpanProcessor` means a span is
  visible to `exporter.getFinishedSpans()` synchronously after `onResponse` runs — no polling,
  no batch-flush timers, no test-order dependency from a shared global tracer.
- **`traceId` is read directly off the request**, with no dependency on how a third-party
  plugin chooses to expose (or not expose) the active span. The Problem Details error handler
  (a later task) can call `currentTraceId(request)` unconditionally.
- Span naming, attributes, and lifecycle are fully in our control — `http.status_code` is set
  from the actual Fastify reply, not inferred by a generic HTTP instrumentation that does not
  know about Fastify's routing.

### Negative

- **We forgo automatic spans for downstream calls** (Prisma queries, any outbound HTTP). Only
  the request-level span exists; a slow Prisma call is invisible as its own span. Acceptable for
  Deliverable 3's scope (request-level tracing only); revisit with manual child spans around
  Prisma calls if per-dependency latency breakdown is needed later.
- **~30 lines of OpenTelemetry wiring we now own and must keep correct** against upstream SDK
  changes (the 1.x → 2.x `spanProcessors` constructor change this ADR's implementation task
  already had to account for is exactly this kind of maintenance cost).
- `SimpleSpanProcessor` exports synchronously per span, which is the right trade for test
  determinism but is not the production-throughput choice — a `BatchSpanProcessor` should
  replace it for the real exporter in Plan 4 once the destination (Azure Monitor) is chosen.

## Alternatives considered

### Rejected — `@opentelemetry/instrumentation-fastify` + `@opentelemetry/instrumentation-http`

The standard OpenTelemetry approach: register instrumentations once at process start and every
Fastify route and outbound HTTP call is traced automatically, no per-route code. Rejected
because auto-instrumentation works by monkey-patching the target module's exports before
anything else imports it, which under CommonJS `require` happens implicitly via
`Module.prototype.require` hooking but under ESM requires the module to be loaded through a
loader hook (`--experimental-loader`/`--import` + `register()`) *before* the target module is
first imported anywhere in the process — a constraint that has to be satisfied identically in
`tsx watch` (dev), `vitest` (test), and the container's production entry point, and is fragile to
get wrong silently (a missed hook means spans just don't appear, with no error). Independently,
span lifecycle under this package is emitted by the instrumentation's own hook wrapping, which
is harder to assert deterministically in a test than a plugin we wrote ourselves — there is no
equivalent of "call `onResponse` synchronously and assert exactly one span."

### Rejected — `@fastify/otel`

A Fastify-native plugin that removes the ESM loader-hook problem (it hooks into Fastify's own
plugin/hook system rather than patching module internals), so it is a real improvement over
alternative 1 for this specific constraint. Still rejected: it adds an external dependency for
functionality that is roughly 30 lines of code once written directly, it owns span naming and
lifecycle decisions we would rather control ourselves (e.g., which hook ends the span, what the
span name format is), and it couples `traceId` retrieval to whatever API surface that package
chooses to expose on the request — a surface we do not control and would need to re-verify on
every upgrade. The Problem Details handler needs `currentTraceId(request)` to be a trivial,
stable read; owning both sides of that contract is worth the ~30 lines.

### Rejected — a global `NodeSDK` singleton with a console exporter

The other common pattern: call `NodeSDK.start()` once at process boot with a globally registered
tracer provider, and have every module fetch spans via `trace.getTracer(...)` against the global.
Rejected specifically because of the testing requirement: a global, mutable, process-wide tracer
provider means tests cannot swap in `InMemorySpanExporter` per test without either resetting
global OpenTelemetry state between tests (order-dependent, easy to leak between test files under
`vitest`'s parallelism) or running every trace-sensitive test in its own process. Dependency
injection — passing the provider into `buildServer` and into `tracingPlugin`'s options — avoids
global state entirely; each test constructs its own provider bound to its own exporter.

## Revisit when

- Plan 4 selects the Azure Monitor exporter — swap `SimpleSpanProcessor` for a
  `BatchSpanProcessor` in the production `createTracerProvider` call site (tests keep
  `SimpleSpanProcessor` for determinism).
- Per-dependency spans (Prisma, outbound HTTP) are needed — add manual child spans inside the
  relevant service functions rather than reaching for auto-instrumentation.
