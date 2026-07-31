# Plan 4B — Infra, deploy, observability: design

- **Date:** 2026-07-31
- **Branch:** `feat/plan-4b-infra-deploy-observability`
- **Covers:** T-19 (`infra/main.bicep`), T-20 (deploy workflow), T-21 (OTel → App Insights),
  T-22 (rollback), T-23 (`deploy-runbook.md`)
- **Requirements:** Deliverable 3; NFR-5 (pipeline < 8 min), NFR-6 (traces < 60 s)
- **Governed by:** [ADR-0009](../../adr/0009-hosting-topology.md) (hosting topology — binding),
  [ADR-0011](../../adr/0011-bicep-graph-extension-over-bootstrap-script.md) (unchanged, still
  governs `entra.bicep`), [ADR-0014](../../adr/0014-azure-monitor-exporter-over-distro.md)
  (the exporter this plan supplies a connection string to)

---

## 1. What this plan is

Plan 4A containerised the stack and hardened its runtime. This plan puts it on Azure and makes it
observable, completing slice 1's "deployed and traced" requirement.

It is the first plan whose output cannot be fully verified by the agent writing it. Applying Bicep
needs an authenticated Azure session and four resource providers registered, both of which are
Damian's to do. **The plan is therefore built apply-ready**: everything that can be proven without
credentials is proven in CI, and everything that cannot is a runbook procedure with expected output
and a blank to fill in. Nothing claims to be tested that has not been.

## 2. Premises corrected before designing

Three claims carried in `handoff.md` and `docs/manual-setup-steps.md` were verified false on
2026-07-30. They are recorded here because two of them were load-bearing for the Entra design.

| Documented claim | Verified reality |
|---|---|
| Azure CLI "absent on machine 2" | Installed, **2.88.0**, authenticated as `Damian@bisteccare.lk` |
| Graph "blocked by conditional access — every call returns `InteractionRequired`" | **Graph reads work.** Four consecutive calls succeeded (`/organization`, `/domains`, `/policies/authorizationPolicy`, `/applications`) |
| "The users are not in `bisteccare.lk` … a single-tenant app would let nobody but Damian sign in" | **`bistecglobal.com` and `bisteccare.lk` are the same tenant**, `d5e769b0-fd19-45e4-a4a8-b73545450234`. Both are verified domains on *BISTEC Global*, alongside ~20 others |

Also established, all read-only:

- `defaultUserRolePermissions.allowedToCreateApps` is **`true`** — standard users can create app
  registrations. `allowedToCreateTenants` is also `true`.
- Damian holds **`Owner`** on subscription `7bb869f8-053c-4c2d-b444-1bf079bfcef7`, and a
  `User Access Administrator` assignment exists — so role assignments are possible.
- All four resource providers (`Microsoft.App`, `Microsoft.DBforPostgreSQL`, `Microsoft.Insights`,
  `Microsoft.OperationalInsights`) are still **`NotRegistered`**.

**What this does and does not change.** It means ADR-0011's premise — that the subscription's
directory and the users' directory differ — is false, and a single-tenant app in `d5e769b0` would
let real mentors and students sign in, satisfying FR-1 properly. **That option was offered and
declined for this plan**: `d5e769b0` is BISTEC's live corporate directory, and registering a
user-facing SSO app there is a governance decision, not a technical one. Entra is deferred a fourth
time. The finding is recorded so the decision is made on true premises whenever it is revisited.

Graph reads succeeding once is **not** proof of reliability — the original note said failures were
"inconsistent within a single session." Nothing in this plan depends on Graph.

## 3. Scope

**In scope**

- `infra/main.bicep` and `infra/bicepconfig.json` — the full resource graph (T-19)
- A deploy workflow on push to `main` (T-20)
- App Insights wiring for `apps/api` (T-21)
- A rollback procedure (T-22)
- `docs/deploy-runbook.md` (T-23)
- The **deploy identity** — an app registration, a GitHub OIDC federated credential, and a role
  assignment. Created by hand once, documented in the runbook
- A **third sign-in state** in `apps/web` for an environment with neither the bypass nor Entra

**Out of scope**

- `infra/entra.bicep` — **fourth deferral.** Treat as owed, not optional
- Real Microsoft sign-in; FR-1 stays partially satisfied
- Waking the dormant real-token CI job
- Anything needing admin consent or an app-role assignment
- Tracing `apps/web`
- A budget-alert resource

**Consequence for Plan 11, recorded not buried.** NFR-3 ("auth-gated 10 RPS for 5 min, zero token
failures") needs real tokens via the k6 service principal, which needs Entra. Deferring Entra
therefore blocks an NFR-3 prerequisite. Plans 11's load test can still cover NFR-1, NFR-2 and NFR-4.

## 4. Architecture — the resource graph

Resource-group scoped, Southeast Asia (ADR-0009 D4).

| Resource | Type | Notes |
|---|---|---|
| Log Analytics workspace | `Microsoft.OperationalInsights/workspaces` | Required by both the Container Apps environment and workspace-based App Insights. Also where both apps' stdout lands, which is the primary tool for diagnosing a failed apply |
| Application Insights | `Microsoft.Insights/components` | Workspace-based. Supplies `APPLICATIONINSIGHTS_CONNECTION_STRING` |
| Container Apps environment | `Microsoft.App/managedEnvironments` | Consumption |
| Postgres Flexible Server | `Microsoft.DBforPostgreSQL/flexibleServers` | B1ms, public network access, `sslmode=require` (ADR-0009 D2) |
| Database | `.../flexibleServers/databases` | `irp` |
| Firewall rules | `.../flexibleServers/firewallRules` | Parameterised — see §5 |
| Container app `api` | `Microsoft.App/containerApps` | External ingress, target port 3001, `minReplicas: 0` (D5) |
| Container app `web` | `Microsoft.App/containerApps` | External ingress, target port 3000, `minReplicas: 0` |
| Migration job | `Microsoft.App/jobs` | Manual trigger, runs `prisma migrate deploy` inside the environment (D3) |

**No `registries[]` block and no registry secret anywhere.** GHCR packages are **public** (decided
2026-07-31, closing `manual-setup-steps.md` §1.5), so Container Apps pulls anonymously. This fires
ADR-0009's own "revisit when the packages are made public" trigger; the conclusion is **no change
needed** — D1's negative consequence (a long-lived `read:packages` PAT) is simply retired, and the
ACR-for-managed-identity question is moot because no registry credential exists at all. The accepted
cost is world-readable images; they carry no secrets, since all configuration is injected at
runtime, so the exposure is the source code.

Images are tagged with the **git SHA**, not `latest`. `apps/api`'s `/health` already reports
`APP_VERSION`, so the deployed commit is verifiable from outside — a gate the `images` job already
relies on.

## 5. The firewall rule, and the one real technical risk

ADR-0009 D2 allowlists "the Container Apps environment's **static outbound IP**." **That premise is
unverified and may be wrong.** A stable outbound IP is normally a property of VNet-integrated or
workload-profile environments; ADR-0009 explicitly rejected VNet. A Consumption-only environment may
have no single stable egress address.

This matters in a way that is easy to get wrong: a template referencing a non-existent property
fails to compile, which is loud and fine — but a rule allowlisting the *wrong* address is quiet, and
presents as the API being unable to reach its database long after the deploy reports success.

**Design decision: two-phase, parameterised.** `main.bicep` takes the allowlisted addresses as a
parameter. Task 1 is a read-only `az` investigation that settles what a consumption environment
actually exposes. If a clean template-time reference exists, the phases collapse into one and the
parameter gets a default; if not, the runbook documents reading the egress address once after the
first apply and passing it in.

**Rejected:** the "allow public access from all Azure services" rule. ADR-0009 already rejected it,
correctly — it admits any Azure tenant's resources, so it reads as a restriction while being close
to no network control at all. Not reopened.

## 6. Deploy identity

An app registration and service principal in `d5e769b0`, with:

- a **GitHub OIDC federated credential**, subject
  `repo:EnderGuardian25/irp-progress-management:ref:refs/heads/main`
- **`Contributor` scoped to the resource group**, not the subscription

`main.bicep` is therefore **resource-group scoped**, with `az group create` as a one-line bootstrap
step. A subscription-scoped template that created its own resource group would require Contributor at
subscription scope.

**This needs no admin consent and no mentor sign-off.** The credential authenticates to ARM, not
Graph — it requests no Graph permissions, exposes no API, and is assigned to no users. Admin consent
was only ever required for the *user-facing* SSO app, which this plan does not create. Damian's
existing `Owner` role covers the role assignment, and `allowedToCreateApps: true` covers the
registration.

**No ADR, by decision.** `CLAUDE.md` requires an ADR for any decision with a plausible rejected
alternative, and this qualifies; the call was made to record it here instead, because ADR-0011
already governs how Entra objects get *declared* and this is a one-off bootstrap credential — the
chicken-and-egg case a manual step is genuinely right for. Rejected alternatives:

- **A client secret in `AZURE_CREDENTIALS`.** Works everywhere and is the older convention. Rejected
  because it is a long-lived credential that must be rotated and can leak — precisely what OIDC
  federation exists to remove. It would also be the only stored secret in the topology now that GHCR
  is public.
- **Subscription-scoped `Contributor`.** Simpler, one less bootstrap step, and lets the template
  create its own resource group. Rejected as unnecessary blast radius: the deploy needs one resource
  group and nothing else in the subscription.

## 7. The deploy pipeline

On push to `main`:

1. Build and push both images to GHCR, tagged with the git SHA
2. `azure/login@v2` via OIDC
3. `az deployment group create` on `main.bicep`, `imageTag` as a parameter
4. Start the migration Job and **wait for completion**, failing the deploy if the job fails
5. Smoke test: `/health` reports the expected SHA; `/api/v1/me` returns **401** with an RFC 7807 body

Steps 4–5 reuse assertions the `images` job already makes against local containers, so they are
carried over rather than invented.

**Migration ordering — a documented compromise, not an oversight.** Step 3 updates the container apps
and the Job definition in one apply, so for a few seconds new application code can coexist with an
unmigrated schema. Accepted now because scale-to-zero means no replicas run at rest, there is one
revision, and Plan 5's migrations will be additive.

**Revisit on either trigger:** the first non-additive migration, or `minReplicas > 0`. The fix is a
second apply — infra and Job first, migrate to completion, then apply the apps behind a `deployApps`
parameter. Rejected for now only on complexity; it is correct by construction and should be adopted
the moment either trigger fires.

**NFR-5 (< 8 min).** The image build dominates. For reference, the existing `images` job builds all
three targets *and* smoke-tests a full compose stack in 4–5.5 minutes with `cache-from: type=gha`;
this workflow builds two of those targets and runs no local stack, but adds an ARM apply, a Job run
and a smoke test. ARM applies of unchanged resources are near-no-ops. The budget is expected to hold
but is **not** proven — the runbook records the measured figure on the first real deploy so a
regression, or a miss, is visible rather than assumed.

## 8. Observability

**T-21 requires no application code changes**, and confirming that is part of its value. Plan 4A
built `selectSpanExporter(env)` (ADR-0014), which returns an `AzureMonitorTraceExporter` as soon as
`APPLICATIONINSIGHTS_CONNECTION_STRING` is non-empty and a `ConsoleSpanExporter` otherwise. This plan
supplies the connection string and nothing else.

It is passed as a **Container Apps secret referenced via `secretRef`**, not a plain environment
variable, because it carries an instrumentation key.

The shared Log Analytics workspace also receives both apps' stdout, so `apps/api`'s pino JSON logs
are queryable by KQL. The runbook carries the actual queries, because this is the first thing to
reach for when an apply succeeds and the app does not work.

**`apps/web` is deliberately untraced.** The exporter seam is `apps/api`-only, T-21's "every route
traced" concerns the API, and instrumenting Next is a separate decision. Recorded as a limitation.

**NFR-6 (< 60 s) cannot be verified without a deployment.** It ships as a runbook procedure: issue a
request, then `az monitor app-insights query` for the span, with the expected shape and a line to
record the observed latency.

## 9. The third sign-in state

In the deployed environment `AUTH_DEV_BYPASS` is absent — enforced, since guard one makes the web
container exit non-zero if it is `true` with `NODE_ENV=production` — and `isEntraConfigured` is
false. `apps/web/app/(auth)/signin/page.tsx` currently branches only two ways, so it renders a
working-looking **"Sign in with Microsoft"** button wired to a provider that was never registered.
Clicking it fails.

That is the "renders perfectly, nothing throws" failure class this repository has been caught by
repeatedly, positioned on the first thing a mentor would click on Demo Day.

**Fix:** a third state. When neither the bypass nor Entra is configured, render an explicit
"sign-in is not configured in this environment" panel — no button, and a line naming what is missing.
Unit-tested across all three states.

This is in scope because 4B creates the first environment in which that state is reachable.

## 10. Testing and gates

**Provable in CI without credentials, and therefore gated:**

- `az bicep build` — compiles `main.bicep` to ARM JSON, catching syntax and type errors
- `bicep lint` against a committed `infra/bicepconfig.json`
- The three-state sign-in unit tests
- Everything the existing `verify` and `images` jobs already cover

**The Bicep gate must be demonstrated red** before it is trusted — a deliberate type error, a failing
run, then revert. Two of this repository's original four gates looked correct and did nothing, and in
Plan 2B a *gate-proof* turned out to be the thing that could not fail. Apply the same skepticism one
level up.

**Not provable without credentials, and therefore runbook procedures with blanks to fill in:**

- `az deployment group what-if` / `validate` — both call ARM and require authentication. An earlier
  draft of this design claimed a credential-free `what-if` gate; that was wrong and is corrected here
- The apply itself, the migration Job, the smoke test against real URLs
- Rollback (T-22)
- NFR-5 and NFR-6 measurements
- The §5 egress-address question

## 11. Rollback (T-22)

Both container apps use **single-revision mode** — an explicit choice, not a default to discover
later. Container Apps retains prior revisions regardless, so rollback is re-applying the previous
SHA. Multiple-revision mode with traffic weights would enable canary and instant traffic-shift
rollback, and is rejected here as machinery this system has no use for: there is one environment, no
canary requirement, and traffic weights add a second thing that can be misconfigured while the app
looks healthy.

Ships as exact commands with expected output, plus a results table to complete after running it once.

**Two limits stated plainly.** The plan does **not** claim a tested rollback until the procedure has
been executed — T-22's wording is "tested rollback path", and the honest status until then is
"procedure written, execution outstanding." And **rollback covers the application, not the
database**: migrations are forward-only, so rolling an image back does not roll a migration back.

## 12. Task sequence

Deploy-first, so the largest unknown is settled before anything is built on it.

| # | Task |
|---|---|
| 1 | Read-only `az` investigation of the consumption-environment egress address; settle §5 |
| 2 | `main.bicep` foundations — Log Analytics, App Insights, environment; `bicepconfig.json`; the build/lint gate, **demonstrated red** |
| 3 | Postgres, database, parameterised firewall rules |
| 4 | Container app `api`, with the connection string as a `secretRef` |
| 5 | Container app `web` |
| 6 | Migration Job |
| 7 | The third sign-in state + unit tests |
| 8 | Deploy workflow — GHCR push, OIDC login, apply, run job, smoke test |
| 9 | Rollback procedure + `docs/deploy-runbook.md` |
| 10 | Documentation reconciliation |

## 13. The runbook's contents (T-23)

- **Bootstrap:** `az login`; the four `az provider register` commands; `az group create`; the app
  registration, federated credential and role assignment; the GitHub variables and secrets
- **First apply:** the command, expected output, and how to read a failure
- **The egress/firewall step** from §5
- **Migration:** invoking the Job and confirming it succeeded
- **Observability:** the KQL for container logs and the App Insights query for a span, with the
  NFR-6 measurement recorded
- **Rollback:** the procedure and its results table
- **Spend:** the one command to check consumption against the credit
- **Stated limitations:** a public database endpoint holding personal data (ADR-0009 D2, the same
  concern class as O-5); no working sign-in; forward-only migrations; NFR-1 valid only with the
  replica floor raised (ADR-0009 D5); and the ~2026-08-27 credit expiry

## 14. Documentation reconciliation (Task 10)

- `handoff.md` — §2a status, §3 current position, and the corrected premises from §2 above
- `CLAUDE.md` — deploy and infrastructure facts worth not rediscovering
- `docs/manual-setup-steps.md` — §1.1a and §1.2 are **factually wrong** and must be corrected: the
  CLI is installed, Graph reads work, and the two "separate directories" are one. §1.5 is closed
  (public). §1.2a stays open and is the remaining blocker
- `docs/adr/0009-hosting-topology.md` — record that the "packages made public" revisit trigger fired
  and that the conclusion was no change

## 15. Definition of done

- `pnpm typecheck`, `pnpm lint` (zero warnings), `pnpm test`, `AUTH_DEV_BYPASS=false pnpm --filter
  @irp/web build`, and the Playwright suite all clean
- `az bicep build` and `bicep lint` pass in CI, and the gate has been demonstrated red
- `docs/deploy-runbook.md` exists and is complete apart from the measurements only a real apply can
  fill in
- Every claim about what is tested is true
