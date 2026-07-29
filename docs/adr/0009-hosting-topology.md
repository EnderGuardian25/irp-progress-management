# ADR-0009 — Hosting topology on Azure Container Apps: GHCR, public-with-firewall Postgres, and a migration job

- **Status:** Accepted
- **Date:** 2026-07-29
- **Deciders:** Damian De Cruz (Spec / Impl / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** NFR-1 (p95 < 250 ms at 50 RPS), NFR-2 (200 RPS burst / 30 s, zero 5xx),
  NFR-3 (auth-gated 10 RPS × 5 min, zero token failures), NFR-5 (deploy pipeline < 8 min),
  NFR-6 (traces in App Insights within 60 s); Deliverable 3 (deploy + observability)
- **Relates to:** ADR-0008 (`@prisma/adapter-pg`) — this ADR fixes *where* that direct connection
  terminates; O-5 (personal-data handling), because student submission text lives in the database
  this ADR exposes on a public endpoint

---

## Context

`CLAUDE.md` fixes the deploy target as **Azure Container Apps** with **Bicep** in `infra/`, and
`handoff.md` §2a requires slice 1 to be *deployed and traced* before any product feature lands.
Plan 4 owns the deploy, but Plan 3 lands `infra/entra.bicep`, so the surrounding topology has to be
settled now rather than discovered while writing `main.bicep`.

The hosting substrate is **Damian's own Azure free account** — subscription
`7bb869f8-053c-4c2d-b444-1bf079bfcef7` in the `bisteccare.lk` tenant. Two properties of that
account shape everything below:

1. **The free grants are consumption-based and per-subscription, not per-app.** Two containers
   pinned at one replica each, 24/7 at the smallest size, overrun the Container Apps monthly grant
   several times over. The grant is not "two small apps are free"; it is a fixed pool of
   vCPU-seconds and GiB-seconds.
2. **The $200 credit expires roughly 2026-08-27**, 30 days from account creation. Deliverable 4's
   load test has to run inside that window or it competes with the free grant instead of the credit.

Five decisions had to be made together, because each constrains the next: where images live, how
the API reaches Postgres, how migrations run, which region, and what the replica floor is.

> **Cost figures in this ADR are order-of-magnitude and were not verified against a live price
> sheet.** They are recorded to show the *shape* of the trade-off, not as budget numbers. Confirm
> against current Azure pricing before relying on any of them.

## Decision

### D1 — Images go to GitHub Container Registry (`ghcr.io`)

Both images (`apps/api`, `apps/web`) are built and pushed by GitHub Actions to GHCR. Container Apps
pulls from there.

### D2 — Postgres is reached over its public endpoint, with a firewall allowlist and TLS

Azure Database for PostgreSQL Flexible Server, B1ms, public network access enabled,
`sslmode=require`, and firewall rules limited to the Container Apps environment's static outbound IP
plus the developer IP. Not VNet-integrated.

### D3 — Migrations run as a Container Apps Job, not from a CI runner

`prisma migrate deploy` runs as a Container Apps **Job** inside the same environment as the API,
triggered by the deploy workflow. The job's egress carries the environment's static outbound IP, so
it is already inside D2's allowlist.

### D4 — Region is Southeast Asia (Singapore)

### D5 — Replica floor is 0, raised to ≥1 for the API only during the load test

`apps/web` and `apps/api` both scale to zero at rest. The k6 run (Plan 11) sets the API's
`minReplicas` to at least 1 for its duration.

## Consequences

### Positive

- **Nothing in the fixed stack table is waived.** Container Apps, Postgres 16, Bicep, and GitHub
  Actions all stay exactly as `CLAUDE.md` pins them, so no stakeholder escalation is needed for the
  hosting shape — only for the tenant gap FR-1 already records.
- **`infra/main.bicep` stays a real applied artefact.** Deliverable 3 is graded on infrastructure
  as code; a topology that Bicep can express end to end keeps that deliverable honest.
- **D3 removes an entire class of deploy flakiness.** GitHub-hosted runners have dynamic egress
  IPs, so any CI-side database access under D2 would need a firewall rule opened and closed around
  each run — a race, a cleanup-on-failure problem, and a window where the database is broadly
  reachable. A job inside the environment has none of those.
- **D4 keeps the NFR-1 measurement meaningful.** p95 < 250 ms is measured from k6, and roughly
  50 ms RTT to Sri Lanka leaves the budget dominated by application time rather than distance.
- **D5 is what makes the free grant sufficient at rest.** With both apps at zero when idle, the
  monthly grant comfortably covers demo and development traffic.

### Negative

- **D1 introduces a long-lived credential that ACR would not have.** With ACR, Bicep grants
  `AcrPull` to the container app's managed identity and no registry secret exists anywhere. GHCR has
  no managed-identity path, so a private package needs a PAT with `read:packages` stored as a
  Container Apps registry secret — one more credential to rotate, and one more way the deploy can
  fail. Making the packages public removes the credential entirely at the cost of world-readable
  images; that choice is deliberately left open in `docs/manual-setup-steps.md` §1.5, defaulting to
  private because it is the reversible direction.
- **D2 leaves a database holding personal data on a public endpoint.** The firewall and TLS are real
  controls, but this is weaker than a private endpoint and is accepted on demo-scoped grounds only.
  It belongs in the deploy runbook as a stated limitation, and it is the same concern class as O-5.
- **D5 trades a cold start for cost.** A scale-from-zero request pays several seconds of container
  start. That is fine for a human opening the app and fatal for a p95 measurement, which is exactly
  why the load test overrides it — but it means **the NFR-1 numbers are only valid with the floor
  raised**, and a run that forgets to raise it will produce misleading results rather than an
  obvious error.
- **D5 also means the SIGTERM gap already logged against Plan 4 now matters more, not less.** Scale-
  to-zero makes container shutdown a routine event rather than a deploy-time one, so the missing
  `SIGTERM` handler in `apps/api` drops in-flight requests more often. That work is a Plan 4
  obligation and this ADR raises its priority.

## Alternatives considered

### Rejected — Azure Container Registry Basic (for D1)

The better-integrated option, and genuinely tempting: Container Apps authenticates to ACR with a
managed identity, so **no registry credential exists at all** — Bicep assigns `AcrPull` and the pull
just works. Rejected on cost and locality: ACR Basic is a flat monthly charge (roughly $5) that is
*not* covered by the free grants, and it would be the only always-billing resource in the topology
on an account whose credit expires in a month. Keeping images beside the source in GHCR also means
one fewer Azure resource in `main.bicep` and one fewer thing to provision before a first deploy. The
managed-identity advantage is real and is recorded as the reason to revisit if the credential ever
causes an incident.

### Rejected — Docker Hub (for D1)

Free for public images and universally supported. Rejected because its anonymous and free-tier pull
rate limits are enforced per source IP, and a Container Apps environment scaling from zero pulls
repeatedly from a shared Azure egress address — a rate-limit failure would present as an
intermittent, unattributable deploy or cold-start failure. GHCR has no comparable limit for our
usage, and images already live next to the repository that builds them.

### Rejected — VNet-integrated Container Apps environment with a Postgres private endpoint (for D2)

The correct-by-construction answer: no public database endpoint at all. Rejected for this sprint on
scope grounds. It requires a VNet-injected Container Apps environment with a dedicated subnet of at
least /23, pushes the environment toward workload profiles rather than pure consumption (changing
the cost model the free grant depends on), and materially expands `main.bicep` at the point in the
programme where 50 of 75 remaining graded points sit behind *having something deployed at all*. The
security gap is documented rather than hidden, and this is the first thing to change if the system
ever holds real student data.

### Rejected — "Allow public access from all Azure services" firewall rule (for D2)

The one-checkbox version of D2, and a common shortcut. Rejected because it is far broader than it
sounds: it admits *any* Azure tenant's resources, not just ours, so it is close to no network
control at all while reading like a restriction. A static-outbound-IP allowlist is a similar amount
of Bicep and actually constrains the source.

### Rejected — running `prisma migrate deploy` from the GitHub Actions runner (for D3)

The obvious approach, and what most pipelines do. Rejected because it is incompatible with D2: a
runner's egress IP is dynamic and unknowable ahead of time, so the workflow would have to create a
firewall rule, migrate, and delete the rule — leaving the database open to a wide range if the job
fails between steps, and racing any concurrent deploy. A Container Apps Job runs inside the
environment and is already allowlisted.

### Rejected — migrating on API boot (for D3)

Tempting because it needs no extra resource. Rejected because with D5's scale-to-zero, boot happens
constantly and unpredictably; every cold start would attempt a migration, and concurrent replicas
starting together would race for the migration lock. It also couples schema change to request
serving, so a bad migration takes the API down rather than failing one job.

### Rejected — Central India (for D4)

Comparable latency to Sri Lanka and sometimes better small-SKU quota availability. Rejected in
favour of Singapore only marginally — Southeast Asia is slightly closer and has the broader service
catalogue for Container Apps and App Insights. **Retained as the fallback** if free-tier B1ms
capacity turns out to be unavailable in Southeast Asia; that has not yet been verified with `az`,
because the CLI is not yet installed on the current machine.

### Rejected — always-on `minReplicas: 1` on both apps (for D5)

Removes cold starts entirely and would let the load test run without special handling. Rejected
because it is the single largest avoidable cost in the topology: two always-on replicas overrun the
Container Apps free grant by roughly 3–4×, on the order of $15–30/month, indefinitely, on a personal
account. The cold start it avoids only matters during a measured load test, which is a bounded window
we can override for.

## Revisit when

- **The GHCR credential causes a deploy failure**, or the packages are made public — either
  outcome changes D1's negative consequence and may make ACR's managed-identity path worth the $5.
- **The system holds real student data**, at which point D2's public endpoint should become a
  private endpoint and the VNet cost is justified.
- **Free-tier B1ms availability in Southeast Asia is verified** (needs `az`, see
  `docs/manual-setup-steps.md` §1.2). If unavailable, D4 falls back to Central India.
- **NFR-1/NFR-2 results come back** — if p95 misses at 50 RPS with the floor raised, the next levers
  are `PrismaPg` pool sizing (ADR-0008) and the container CPU/memory allocation, in that order.
- **The $200 credit expires (~2026-08-27)**, after which every choice above is measured against the
  free grant alone.
