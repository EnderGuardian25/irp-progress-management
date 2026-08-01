# Plan 4B — Infra, deploy, observability: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the containerised stack to Azure Container Apps with Bicep, trace it in Application Insights, and document a rollback — completing slice 1's "deployed and traced" requirement and Deliverable 3.

**Architecture:** A resource-group-scoped `infra/main.bicep` describing Log Analytics, Application Insights, a Consumption Container Apps environment, Postgres Flexible Server B1ms, two container apps at `minReplicas: 0`, and a manual-trigger migration Job. A `deploy.yml` workflow pushes SHA-tagged images to public GHCR, authenticates with GitHub OIDC, applies the template, runs the migration Job, and smoke-tests. Everything provable without Azure credentials is a CI gate; everything else is a runbook procedure with expected output.

**Tech Stack:** Bicep (CLI 0.45.15 via `az bicep install`), Azure CLI 2.88.0, Azure Container Apps, Azure Database for PostgreSQL Flexible Server, Application Insights, GitHub Actions with OIDC federation, GHCR.

**Spec:** `docs/superpowers/specs/2026-07-31-plan-4b-infra-deploy-observability-design.md`

---

## Global Constraints

- **Region is Southeast Asia** (ADR-0009 D4). Central India is the recorded fallback if B1ms capacity is unavailable.
- **`minReplicas: 0` on both container apps** (ADR-0009 D5). Do not raise it; Plan 11 raises the API's floor for the load test only.
- **Postgres is B1ms / Burstable, public network access, `sslmode=require`** (ADR-0009 D2).
- **GHCR packages are public.** There must be **no `registries[]` block and no registry credential anywhere** in the template or workflow beyond the push step's own `GITHUB_TOKEN`.
- **Images are tagged with the git SHA**, never `latest`.
- **Do NOT set `APP_VERSION` as a container-app runtime env var.** The Dockerfile bakes it via `ARG`/`ENV` at build time, and 4A's CORRECTION 4 item 3 deliberately removed the runtime copy from `compose.yaml` so the `/health` assertion actually proves the build arg reached the image. Setting it at runtime silently re-opens that hole.
- **`infra/entra.bicep` is OUT OF SCOPE** — fourth deferral. Do not create it.
- **`JWKS_URI` / `JWT_ISSUER` are deliberately unresolvable placeholders**, exactly as in `compose.yaml`. `createRemoteJWKSet` is lazy — it performs no network I/O at construction — so the API boots and serves `/health` regardless. Do not "fix" them.
- **No secrets in Bicep `output`s.** Deployment outputs are readable from deployment history. Reference values inline instead.
- **The Bicep gate must be demonstrated red** before it is trusted (Task 2). Two of this repo's original four gates did nothing until tested, and in Plan 2B a gate-*proof* was itself the thing that could not fail.
- **All linter rules in `infra/bicepconfig.json` are set to `error`**, mirroring `redocly.yaml`'s `recommended-strict`: warnings that do not fail the build are unenforced.
- **The implementer has NO Azure credentials.** Never write a step that requires `az login`, an apply, or any ARM write. `az bicep lint` and `az bicep build` need no authentication; everything else is a runbook procedure.
- **Windows PowerShell 5.1 gotcha:** `--query "length(@)"` fails — PowerShell mangles `(@)` and `az` reports `invalid jmespath_type`. Use `--output tsv --query "[].name"` and count lines instead.
- Verification set for any `apps/web` change: `pnpm typecheck`, `pnpm lint`, `pnpm test`, **and** `AUTH_DEV_BYPASS=false pnpm --filter @irp/web build` — plain `tsc` misses `typedRoutes` and export-shape errors.

## Environment facts (verified 2026-07-30/31, read-only)

| Fact | Value |
|---|---|
| Subscription | `7bb869f8-053c-4c2d-b444-1bf079bfcef7` ("Azure subscription 1"), Enabled |
| Tenant | `d5e769b0-fd19-45e4-a4a8-b73545450234` — **BISTEC Global**; `bistecglobal.com` and `bisteccare.lk` are both verified domains of *this one tenant* |
| Azure CLI | **2.88.0, installed and authenticated** as `Damian@bisteccare.lk` |
| Bicep CLI | **0.45.15**, installed at `~/.azure/bin/bicep.exe` via `az bicep install` |
| Subscription role | **`Owner`** (plus a `User Access Administrator` assignment) — role assignments are possible |
| `allowedToCreateApps` | **`true`** — standard users can create app registrations |
| Resource groups | **0** — nothing deployed yet |
| Resource providers | `Microsoft.App`, `Microsoft.DBforPostgreSQL`, `Microsoft.Insights`, `Microsoft.OperationalInsights` all **`NotRegistered`** |

**Do not attempt to register the providers or create anything.** They are Damian's to run; Task 9's runbook documents the commands.

## Files

| File | Responsibility |
|---|---|
| `infra/main.bicep` | The whole resource graph. Grows across Tasks 2–6 |
| `infra/bicepconfig.json` | Linter rules, all at `error` |
| `infra/main.sample.bicepparam` | A committed, credential-free example parameter file showing every required parameter |
| `.github/workflows/ci.yml` | Gains an `infra` job running the Bicep gate |
| `.github/workflows/deploy.yml` | New. Build/push, OIDC login, apply, migrate, smoke test |
| `package.json` | Gains `infra:lint` |
| `apps/web/app/(auth)/signin/sign-in-panel.tsx` | New. The three-state sign-in panel, pure and testable |
| `apps/web/app/(auth)/signin/page.tsx` | Reduced to a shell that computes two flags and passes them |
| `apps/web/test/signin.test.tsx` | Gains three-state panel tests |
| `docs/deploy-runbook.md` | New. T-23 |
| `handoff.md`, `CLAUDE.md`, `docs/manual-setup-steps.md`, `docs/adr/0009-hosting-topology.md` | Task 10 reconciliation |

---

## Task 1: Settle the egress-address question

The design's §5 flags ADR-0009 D2's "static outbound IP" premise as unverified. This task answers it **without deploying**, by using the Bicep compiler as an oracle: for a known resource type, reading a property that does not exist produces a `BCP053` diagnostic that **enumerates every property the type does have**. So the property set of a `Microsoft.App/managedEnvironments` can be discovered offline.

> **Note, added during execution:** `BCP053` is a **warning**, not an error, and `az bicep lint`
> exits `0` on it. Judge these probes by their *output*, never by their exit code. The same fact
> forced a redesign of Task 2's gate.

**Files:**
- Create (temporary, deleted in this task): `infra/scratch-probe.bicep`
- Modify: `docs/superpowers/specs/2026-07-31-plan-4b-infra-deploy-observability-design.md` (append a finding to §5)

**Interfaces:**
- Produces: the decision recorded in §5 that Tasks 3 and 9 depend on — whether `allowedClientIpAddresses` gets a template-time default or stays runbook-populated.

- [ ] **Step 1: Confirm the Bicep CLI is present**

```powershell
az bicep version
```

Expected: `Bicep CLI version 0.45.15` or newer. If it reports "Bicep CLI not found", run `az bicep install` — it needs no authentication.

- [ ] **Step 2: Write the probe file**

Create `infra/scratch-probe.bicep`:

```bicep
// TEMPORARY. Deleted in this task. Exists only to ask the Bicep compiler which
// properties Microsoft.App/managedEnvironments actually exposes, so ADR-0009
// D2's "static outbound IP" premise can be checked without deploying anything.
targetScope = 'resourceGroup'

resource probe 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: 'does-not-need-to-exist'
}

output staticIp string = probe.properties.staticIp
output defaultDomain string = probe.properties.defaultDomain
```

`existing` means no deployment is described — the compiler still type-checks every property read.

- [ ] **Step 3: Compile it and record which properties exist**

```powershell
az bicep lint --file infra/scratch-probe.bicep
```

Expected: **exit 0**, proving `staticIp` and `defaultDomain` both exist on this API version. Record the result.

- [ ] **Step 4: Probe for an outbound-IP property**

Replace the two `output` lines in `infra/scratch-probe.bicep` with each of these **one at a time**, running `az bicep lint --file infra/scratch-probe.bicep` after each, and record which compile and which fail:

```bicep
output probe1 string = probe.properties.staticIp
```
```bicep
output probe2 array = probe.properties.outboundIpAddresses
```
```bicep
output probe3 string = probe.properties.outboundSettings.outBoundType
```

Expected: at least one reports **`BCP053`** ("does not contain property"), and the diagnostic enumerates the type's complete property set — which is the actual answer.

> **CORRECTED during execution, 2026-07-31.** This step originally said "at least one **fails**". It does not fail: **`BCP053` is a warning and `az bicep lint` exits `0`.** Read the *output*, not the exit code. That discovery is why Task 2's gate had to be redesigned — see the correction there.
>
> **Result:** `staticIp` and `defaultDomain` exist; `outboundIpAddresses` and `outboundSettings` do not. `ManagedEnvironmentProperties@2024-03-01` exposes **no egress property at all**, so the two-phase firewall design stands. Recorded in the design spec §5.

- [ ] **Step 5: Append the finding to the design spec's §5**

Add to `docs/superpowers/specs/2026-07-31-plan-4b-infra-deploy-observability-design.md`, at the end of §5:

```markdown
### Finding (Task 1, 2026-07-31)

Probed offline with `az bicep lint` against an `existing` resource declaration, which type-checks
property reads without deploying. Results:

| Property read | Compiles? |
|---|---|
| `properties.staticIp` | _record yes/no_ |
| `properties.defaultDomain` | _record yes/no_ |
| `properties.outboundIpAddresses` | _record yes/no_ |
| `properties.outboundSettings.outBoundType` | _record yes/no_ |

**Decision:** _record which of the two branches below applies._

- **If a property giving the environment's egress address(es) compiles:** `main.bicep` may reference
  it directly and `allowedClientIpAddresses` gets that reference as its default. One phase.
- **If none does:** the two-phase design stands unchanged — `allowedClientIpAddresses` has **no
  default**, and the runbook documents reading the egress address after the first apply and passing
  it in.

**Note on what this does and does not prove.** A property existing in the ARM schema does not prove
its value is *stable* for a Consumption-only environment. Even in the one-phase branch, the runbook
must still tell the operator to re-check the allowlist if the API loses database connectivity after a
previously working deploy — a wrong allowlist is silent and presents as a database outage, not as a
deploy failure.
```

Fill in every `_record ..._` placeholder with the real observed result. **Do not leave them.**

- [ ] **Step 6: Delete the probe file**

```powershell
Remove-Item infra/scratch-probe.bicep
```

- [ ] **Step 7: Verify the probe file is gone and commit**

```powershell
if (Test-Path infra/scratch-probe.bicep) { Write-Output "STILL PRESENT - delete it" } else { Write-Output "clean" }
```

```bash
git add docs/superpowers/specs/2026-07-31-plan-4b-infra-deploy-observability-design.md
git commit -m "docs(spec): settle the Container Apps egress-address question offline

Probed Microsoft.App/managedEnvironments' property set with az bicep lint
against an `existing` declaration, which type-checks property reads without
deploying and without credentials. Records which properties exist and which
branch of the design's two-phase firewall decision therefore applies.

Also records what the probe does NOT prove: a property existing in the schema
says nothing about whether its value is stable for a Consumption-only
environment, so the runbook still has to treat a wrong allowlist as a live
possibility. A wrong allowlist is silent and presents as a database outage
rather than a deploy failure."
```

---

## Task 2: `main.bicep` foundations and the Bicep gate

**Files:**
- Create: `infra/main.bicep`, `infra/bicepconfig.json`
- Modify: `package.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `logAnalytics`, `appInsights`, `containerAppsEnvironment` symbolic names, and the params `location`, `namePrefix`. Tasks 3–6 extend the same file and rely on these exact names.

- [ ] **Step 1: Create the linter config**

Create `infra/bicepconfig.json`:

```json
{
  "analyzers": {
    "core": {
      "enabled": true,
      "verbose": true,
      "rules": {
        "adminusername-should-not-be-literal": { "level": "error" },
        "no-hardcoded-env-urls": { "level": "error" },
        "no-unnecessary-dependson": { "level": "error" },
        "no-unused-params": { "level": "error" },
        "no-unused-vars": { "level": "error" },
        "outputs-should-not-contain-secrets": { "level": "error" },
        "prefer-interpolation": { "level": "error" },
        "secure-parameter-default": { "level": "error" },
        "simplify-interpolation": { "level": "error" },
        "use-stable-resource-identifiers": { "level": "error" }
      }
    }
  }
}
```

Every rule is `error`, not `warning`. A warning that does not fail the build is unenforced — the same reasoning that put `recommended-strict` in `redocly.yaml`.

- [ ] **Step 2: Create `main.bicep` with the three foundation resources**

Create `infra/main.bicep`:

```bicep
// The IRP Progress Management System's Azure footprint.
//
// Resource-group scoped on purpose. The deploy service principal holds
// Contributor on THIS RESOURCE GROUP only, not the subscription, so the
// resource group is created once by hand (see docs/deploy-runbook.md) rather
// than by a subscription-scoped template.
//
// Governed by ADR-0009. Do not change region, SKU tier or the replica floor
// without amending it.
targetScope = 'resourceGroup'

@description('Azure region for every resource. ADR-0009 D4 fixes Southeast Asia; Central India is the recorded fallback if Burstable B1ms capacity is unavailable.')
param location string = resourceGroup().location

@description('Name prefix for every resource. Short because Postgres server names become part of a public DNS label.')
@minLength(3)
@maxLength(11)
param namePrefix string = 'irp'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    // Both container apps ship stdout here, so this is where a failed deploy
    // gets diagnosed. 30 days is the free-tier retention.
    retentionInDays: 30
  }
}

// Workspace-based, which is the only mode still supported for new components.
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// NOTE: appInsights.properties.ConnectionString is deliberately NOT an output.
// Deployment outputs are readable from deployment history, and the linter's
// outputs-should-not-contain-secrets rule is set to error. Task 4 references it
// inline as a container-app secret instead.
output containerAppsEnvironmentId string = containerAppsEnvironment.id
output containerAppsDefaultDomain string = containerAppsEnvironment.properties.defaultDomain
```

- [ ] **Step 3: Verify it compiles**

```powershell
az bicep lint --file infra/main.bicep
Write-Output "exit: $LASTEXITCODE"
```

Expected: **exit 0**. If an API version is rejected, the compiler names it — fix it to the nearest available version and record the change in a comment. That the compiler catches a bad API version offline is precisely why this gate is worth having.

> ### CORRECTION 1 (found during execution, 2026-07-31): the gate below was redesigned
>
> This task originally gated on `az bicep lint`'s **exit code**. That gate would have enforced
> nothing. **`az bicep lint` exits `0` on warnings**, and `BCP053` — reading a property a resource
> type does not have — is a *warning*. So a template referencing a nonexistent property would have
> passed.
>
> This is the **Redocly lesson repeating verbatim.** `CLAUDE.md` already records that Redocly's plain
> `recommended` preset "exits 0 on warnings and there is no `--fail-on-warnings` flag", which left
> the zero-warning bar unenforced for most of Plan 2A. Same shape, different tool.
>
> Setting linter rules to `error` in `bicepconfig.json` does **not** fix it: `BCP053` is a **core
> compiler diagnostic, not a configurable linter rule**, so its severity cannot be raised from
> config.
>
> **The gate now fails on any diagnostic, not on the exit code**, via a small Node runner. Steps 8–10
> prove *both* failure classes — a linter-rule error and a `BCP053` warning.

- [ ] **Step 4: Create the gate runner**

Create `infra/lint.mjs`:

```js
// Fails on ANY Bicep diagnostic, not on the exit code.
//
// `az bicep lint` exits 0 on WARNINGS. BCP053 — reading a property a resource
// type does not have — is a warning, so a template referencing a nonexistent
// property passes an exit-code-only gate. That is the same shape as Redocly's
// plain `recommended` preset exiting 0 on warnings, which left this repo's
// zero-warning bar unenforced for most of Plan 2A (see CLAUDE.md).
//
// Raising severity in bicepconfig.json does NOT help: BCP053 is a core compiler
// diagnostic, not a configurable linter rule.
//
// Diagnostics are matched on Bicep's own `file.bicep(line,col)` citation rather
// than on "any output at all", because the Azure CLI emits unrelated WARNING
// lines of its own (extension-preview notices, config notices) that must not
// fail the build. A non-zero exit with no diagnostic is still a failure.
import { spawnSync } from "node:child_process";

const target = process.argv[2] ?? "infra/main.bicep";
const onWindows = process.platform === "win32";

const result = spawnSync("az", ["bicep", "lint", "--file", target], {
  encoding: "utf8",
  shell: onWindows,
});

if (result.error) {
  console.error(`Could not run the Azure CLI: ${result.error.message}`);
  process.exit(1);
}

const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const diagnostics = combined
  .split(/\r?\n/)
  .filter((line) => /\.bicep\(\d+,\d+\)/.test(line));

if (diagnostics.length > 0) {
  for (const line of diagnostics) console.error(line.trim());
  console.error(
    `\n::error::Bicep reported ${diagnostics.length} diagnostic(s) for ${target}. ` +
      `Warnings fail this gate deliberately: az bicep lint exits 0 on them, so the exit code alone proves nothing.`,
  );
  process.exit(1);
}

if (result.status !== 0) {
  console.error(combined.trim());
  console.error(`::error::az bicep lint exited ${result.status} for ${target}.`);
  process.exit(1);
}

console.log(`${target}: no Bicep diagnostics.`);
```

In `package.json`, add to `scripts`:

```json
"infra:lint": "node infra/lint.mjs"
```

`lint` rather than `build` on purpose: it performs full semantic analysis and reports both errors and linter diagnostics **without emitting an ARM JSON artifact**. `az bicep build` would write `infra/main.json`, which is generated output this repo would then have to gitignore and guard — a fourth generated path for no benefit.

- [ ] **Step 5: Run it through pnpm**

```powershell
pnpm infra:lint
Write-Output "exit: $LASTEXITCODE"
```

Expected: `infra/main.bicep: no Bicep diagnostics.` and exit 0.

- [ ] **Step 6: Add the `infra` CI job**

In `.github/workflows/ci.yml`, add a new job as a sibling of `verify`, `real-token` and `images`:

```yaml
  # A separate job, not a step in `verify`. `verify` is a three-timezone matrix
  # and nothing about Bicep compilation is timezone-sensitive, so folding it in
  # would triple the cost for zero extra coverage — against NFR-5's budget.
  #
  # This job needs NO Azure credentials. `az bicep lint` compiles and
  # type-checks locally; it never calls ARM. That is the whole reason the
  # template can be gated before a subscription is ready. `az deployment
  # what-if` and `validate` DO call ARM and are therefore runbook procedures,
  # not gates — see the design spec §10.
  infra:
    runs-on: ubuntu-latest
    # See the note on verify. Backstop only; observed runtime is well under a
    # minute.
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      # ubuntu-latest ships the Azure CLI, but not the Bicep CLI.
      - name: Install the Bicep CLI
        run: az bicep install

      # NOT `az bicep lint` directly: it exits 0 on warnings, and BCP053 (a
      # nonexistent property) is a warning. The runner fails on any diagnostic.
      - name: Lint and type-check the Bicep template
        run: node infra/lint.mjs infra/main.bicep
```

- [ ] **Step 7: Verify the workflow parses**

```powershell
node -e "const y=require('./node_modules/.pnpm/js-yaml@4.2.0/node_modules/js-yaml/index.js');const f=require('fs');const d=y.load(f.readFileSync('.github/workflows/ci.yml','utf8'));console.log('jobs:',Object.keys(d.jobs).join(', '));console.log('infra timeout:',d.jobs.infra['timeout-minutes'])"
```

Expected: `jobs: verify, real-token, images, infra` and `infra timeout: 10`.

- [ ] **Step 8: PROVE THE GATE FAILS, class 1 — a linter-rule error**

Temporarily add an unused parameter to `infra/main.bicep`, immediately after the `namePrefix` param:

```bicep
param deliberatelyUnusedParameterToProveTheGateFails string = 'remove me'
```

Then:

```powershell
pnpm infra:lint
Write-Output "exit: $LASTEXITCODE"
```

Expected: **non-zero exit**, with a `no-unused-params` diagnostic naming the parameter. If it exits 0, the gate is not enforcing — check that `bicepconfig.json` sits in `infra/` beside `main.bicep` and that the rule level is `error`. Remove the parameter afterwards.

- [ ] **Step 9: PROVE THE GATE FAILS, class 2 — a `BCP053` WARNING**

This is the class the original gate would have missed entirely, so it matters more than class 1. Temporarily append to `infra/main.bicep`:

```bicep
output deliberatelyNonexistentProperty string = containerAppsEnvironment.properties.thisPropertyDoesNotExist
```

Then:

```powershell
pnpm infra:lint
Write-Output "exit: $LASTEXITCODE"
```

Expected: **non-zero exit**, with `BCP053` naming `thisPropertyDoesNotExist`.

Now prove the original gate would have passed it, so the correction is evidenced rather than asserted:

```powershell
az bicep lint --file infra/main.bicep
Write-Output "az bicep lint exit: $LASTEXITCODE"
```

Expected: **exit 0** despite the same `BCP053` warning. Record both exit codes in the commit message — this is the evidence that the exit-code gate was hollow.

- [ ] **Step 10: Remove both deliberate errors and confirm green**

Delete the unused parameter and the bogus output, then:

```powershell
pnpm infra:lint
Write-Output "exit: $LASTEXITCODE"
```

Expected: `no Bicep diagnostics.` and exit 0.

- [ ] **Step 11: Commit**

```bash
git add infra/main.bicep infra/bicepconfig.json package.json .github/workflows/ci.yml
git commit -m "feat(infra): Bicep foundations and a credential-free lint gate

Log Analytics, workspace-based Application Insights, and a Consumption
Container Apps environment wired to that workspace, so both apps' stdout is
queryable — the primary tool for diagnosing a failed apply.

Resource-group scoped so the deploy service principal can hold Contributor on
one resource group rather than the subscription.

The gate is a separate CI job, not a step in verify: verify is a three-timezone
matrix and Bicep compilation is not timezone-sensitive. It needs no Azure
credentials, because az bicep lint compiles and type-checks locally and never
calls ARM — which is what lets the template be gated before the subscription is
ready. az deployment what-if and validate DO call ARM and are runbook
procedures instead.

Every linter rule is set to error rather than warning, for the same reason
redocly.yaml uses recommended-strict: a warning that does not fail the build is
unenforced.

Demonstrated red before being trusted, per the house rule. An unused parameter
produced a no-unused-params error and a non-zero exit; removing it returned the
gate to green. Two of this repo's original four gates looked correct and did
nothing until someone tested them."
```

---

## Task 3: Postgres, database, and the parameterised firewall

**Files:**
- Modify: `infra/main.bicep`
- Create: `infra/main.sample.bicepparam`

**Interfaces:**
- Consumes: `location`, `namePrefix` (Task 2).
- Produces: `postgres` (with `properties.fullyQualifiedDomainName`), the param names `postgresAdminUsername`, `postgresAdminPassword`, `allowedClientIpAddresses`, and the variable `databaseUrl` used by Tasks 4 and 6.

- [ ] **Step 1: Add the Postgres parameters**

Append to the parameter block in `infra/main.bicep`, after `namePrefix`:

```bicep
@description('Postgres administrator login. Not a literal default, per the adminusername-should-not-be-literal linter rule.')
param postgresAdminUsername string

@description('Postgres administrator password. Supplied from a GitHub secret; never committed. Entra authentication for Postgres would remove this credential entirely but needs the Entra work this plan defers.')
@secure()
param postgresAdminPassword string

@description('IPv4 addresses allowed to reach Postgres, each added as a single-address firewall rule. Deliberately defaults to EMPTY: an empty allowlist creates no rule at all, so a forgotten value fails closed as a connection error rather than silently opening the server. Populated per docs/deploy-runbook.md.')
param allowedClientIpAddresses array = []
```

- [ ] **Step 2: Add the server, database and firewall rules**

Append to `infra/main.bicep`, after the `containerAppsEnvironment` resource:

```bicep
// ADR-0009 D2: public endpoint with a firewall allowlist and TLS, NOT VNet
// integration. That is a documented, demo-scoped compromise, not an oversight —
// the database holds student submission text, which is personal data, and this
// is weaker than a private endpoint. It is the first thing to change if the
// system ever holds real student data. Recorded as a stated limitation in
// docs/deploy-runbook.md.
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${namePrefix}-pg'
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUsername
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'irp'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// One single-address rule per entry. An empty array produces no rules, which is
// the intended fail-closed behaviour.
//
// NOT the "allow public access from all Azure services" rule (start/end
// 0.0.0.0), which ADR-0009 rejected: it admits ANY Azure tenant's resources, so
// it reads as a restriction while being close to no network control at all.
resource firewallRules 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = [
  for (address, index) in allowedClientIpAddresses: {
    parent: postgres
    name: 'allow-${index}'
    properties: {
      startIpAddress: address
      endIpAddress: address
    }
  }
]

// sslmode=require is not optional — ADR-0009 D2 pairs the public endpoint with
// TLS, and Prisma will happily connect without it if not told to.
var databaseUrl = 'postgresql://${postgresAdminUsername}:${postgresAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/irp?schema=public&sslmode=require'
```

- [ ] **Step 3: Compile**

```powershell
pnpm infra:lint
Write-Output "exit: $LASTEXITCODE"
```

Expected: **non-zero**, with `no-unused-vars` for `databaseUrl` — nothing consumes it until Task 4. This is expected and is fixed in Task 4, not here.

To keep the tree green at every commit, temporarily reference it by adding this line at the very end of the file, and **delete it in Task 4 Step 3**:

```bicep
// TEMPORARY, deleted in Task 4: keeps no-unused-vars satisfied until the api
// container app consumes databaseUrl. Not an output of any value.
output databaseUrlIsConsumedInTask4 bool = !empty(databaseUrl)
```

Re-run `pnpm infra:lint`. Expected: exit 0.

> If the linter instead reports `outputs-should-not-contain-secrets` on that temporary output — plausible, since `databaseUrl` interpolates a `@secure()` parameter — then **delete the temporary output** and accept a red `no-unused-vars` for the duration of this task, noting it in the commit message and fixing it in Task 4. Do not weaken either rule to make this convenient.

- [ ] **Step 4: Create the sample parameter file**

Create `infra/main.sample.bicepparam`:

```bicep
// A COMMITTED EXAMPLE. Copy, fill in, and keep your copy out of git.
// Contains no real values and no secrets.
//
// The real deploy does not use a .bicepparam file at all — the workflow passes
// parameters on the command line so the password can come from a GitHub secret
// and never touch disk. This file exists so a human can see every parameter the
// template requires in one place.
using './main.bicep'

param location = 'southeastasia'
param namePrefix = 'irp'
param postgresAdminUsername = 'irpadmin'
// Never a real value here. Supply on the command line or from a secret store.
param postgresAdminPassword = ''
// Empty until the first apply reveals the egress address. See the runbook.
param allowedClientIpAddresses = []
param imageTag = 'replace-with-a-git-sha'
```

> `imageTag` is introduced in Task 4. If this file is linted before Task 4 lands, the compiler will reject the unknown parameter — that is correct. Add the `imageTag` line only once Task 4 has declared the parameter, or add it here and expect Task 3's lint to flag it until Task 4 lands. Prefer the former: **omit the `imageTag` line in this task and add it in Task 4 Step 2.**

- [ ] **Step 5: Verify and commit**

```powershell
pnpm infra:lint
Write-Output "exit: $LASTEXITCODE"
```

Expected: exit 0.

```bash
git add infra/main.bicep infra/main.sample.bicepparam
git commit -m "feat(infra): Postgres Flexible Server, database, and fail-closed firewall rules

B1ms Burstable, Postgres 16, public network access with sslmode=require, per
ADR-0009 D2. That is a documented demo-scoped compromise rather than an
oversight: the database holds student submission text, and a public endpoint is
weaker than a private one. Recorded as a stated limitation for the runbook.

allowedClientIpAddresses defaults to EMPTY and produces no firewall rule at all
when empty, so a forgotten value fails closed as a connection error instead of
silently leaving the server open. Explicitly NOT the 0.0.0.0 'allow all Azure
services' rule, which admits any tenant's resources while reading like a
restriction.

The admin password is a @secure() parameter supplied from a GitHub secret.
Entra authentication for Postgres would remove the credential entirely but
needs the Entra work this plan defers."
```

---

## Task 4: The `api` container app

**Files:**
- Modify: `infra/main.bicep`, `infra/main.sample.bicepparam`

**Interfaces:**
- Consumes: `containerAppsEnvironment`, `appInsights` (Task 2); `databaseUrl`, `postgres` (Task 3).
- Produces: `apiApp` with `properties.configuration.ingress.fqdn`, and the params `imageTag`, `containerRegistryBase`. Task 5 reads the FQDN; Task 6 reuses `imageTag` and `containerRegistryBase`.

- [ ] **Step 1: Delete Task 3's temporary output**

Remove these lines from the end of `infra/main.bicep` (skip if Task 3's fallback path was taken and they were never added):

```bicep
// TEMPORARY, deleted in Task 4: keeps no-unused-vars satisfied until the api
// container app consumes databaseUrl. Not an output of any value.
output databaseUrlIsConsumedInTask4 bool = !empty(databaseUrl)
```

- [ ] **Step 2: Add the image parameters**

Append to the parameter block in `infra/main.bicep`:

```bicep
@description('Container image tag. Always a git SHA, never "latest" — /health reports the baked-in APP_VERSION so the deployed commit is verifiable from outside.')
param imageTag string

@description('GHCR base path for both images. Packages are PUBLIC, so Container Apps pulls anonymously and no registries[] block or registry credential exists anywhere in this template.')
param containerRegistryBase string = 'ghcr.io/enderguardian25'

@description('JWKS endpoint. Deliberately unresolvable until the Entra work lands: createRemoteJWKSet is LAZY and performs no network I/O at construction, so the API boots and serves /health regardless. Do not "fix" this.')
param jwksUri string = 'https://jwks.invalid/keys'

@description('Expected token issuer, STRING-COMPARED against the iss claim rather than fetched. Deliberately unresolvable, as above.')
param jwtIssuer string = 'https://issuer.invalid/v2.0'

@description('Expected token audience.')
param jwtAudience string = 'api://irp-progress-management'
```

Also add the `imageTag` line to `infra/main.sample.bicepparam`:

```bicep
param imageTag = 'replace-with-a-git-sha'
```

- [ ] **Step 3: Add the container app**

Append to `infra/main.bicep`:

```bicep
resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-api'
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3001
        transport: 'auto'
        allowInsecure: false
      }
      // No registries[] block: GHCR packages are public and the pull is
      // anonymous. This is the single biggest simplification the public-GHCR
      // decision buys, and it retires ADR-0009 D1's negative consequence.
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
        {
          // Carries an instrumentation key, so a secret rather than a plain env
          // var. selectSpanExporter (ADR-0014) switches to the Azure Monitor
          // exporter as soon as this is non-empty — supplying it is the ENTIRE
          // application-side change T-21 requires.
          name: 'appinsights-connection-string'
          value: appInsights.properties.ConnectionString
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${containerRegistryBase}/irp-api:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3001'
            }
            // APP_VERSION is DELIBERATELY ABSENT. The Dockerfile bakes it via
            // ARG/ENV at build time, and 4A's CORRECTION 4 item 3 removed the
            // runtime copy from compose.yaml precisely so the /health assertion
            // proves the build arg reached the image. Setting it here would
            // satisfy that assertion from the runtime value alone and re-open
            // the hole. Do not add it.
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: 'appinsights-connection-string'
            }
            {
              name: 'JWKS_URI'
              value: jwksUri
            }
            {
              name: 'JWT_ISSUER'
              value: jwtIssuer
            }
            {
              name: 'JWT_AUDIENCE'
              value: jwtAudience
            }
          ]
        }
      ]
      scale: {
        // ADR-0009 D5. Scale to zero at rest is what makes the free grant
        // sufficient. Plan 11 raises this for the load test ONLY — NFR-1's p95
        // numbers are valid only with the floor raised.
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
}
```

- [ ] **Step 4: Compile and commit**

```powershell
pnpm infra:lint
Write-Output "exit: $LASTEXITCODE"
```

Expected: exit 0, with no `no-unused-vars` for `databaseUrl` now that it is consumed.

```bash
git add infra/main.bicep infra/main.sample.bicepparam
git commit -m "feat(infra): the api container app, with App Insights wired through a secretRef

Supplying APPLICATIONINSIGHTS_CONNECTION_STRING is the entire application-side
change T-21 needs. Plan 4A built selectSpanExporter (ADR-0014) to switch to the
Azure Monitor exporter the moment that variable is non-empty, so this commit
changes no application code at all — which was the point of the seam.

Passed as a Container Apps secret rather than a plain env var because it carries
an instrumentation key.

APP_VERSION is deliberately NOT set at runtime. The Dockerfile bakes it as a
build arg, and 4A's CORRECTION 4 item 3 removed the runtime copy from
compose.yaml so the /health assertion actually proves the build arg reached the
image. Setting it here would let the runtime value satisfy that assertion and
silently re-open the hole.

No registries[] block: GHCR packages are public, so the pull is anonymous and no
registry credential exists in the template.

JWKS_URI and JWT_ISSUER are deliberately unresolvable placeholders. Entra is
deferred, and createRemoteJWKSet is lazy, so the API boots and serves /health
regardless."
```

---

## Task 5: The `web` container app

**Files:**
- Modify: `infra/main.bicep`

**Interfaces:**
- Consumes: `containerAppsEnvironment`, `apiApp`, `imageTag`, `containerRegistryBase`.
- Produces: `webApp`, and the params `authSecret`. Task 9's runbook uses the FQDN outputs added here.

- [ ] **Step 1: Add the `authSecret` parameter**

Append to the parameter block:

```bicep
@description('Auth.js cookie encryption key, 32+ random bytes. Supplied from a GitHub secret. Without it, session cookies cannot be encrypted or decrypted.')
@secure()
param authSecret string
```

- [ ] **Step 2: Add the container app**

Append to `infra/main.bicep`:

```bicep
resource webApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-web'
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        {
          name: 'auth-secret'
          value: authSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${containerRegistryBase}/irp-web:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '3000'
            }
            {
              name: 'HOSTNAME'
              value: '0.0.0.0'
            }
            {
              name: 'AUTH_SECRET'
              secretRef: 'auth-secret'
            }
            {
              // Resolved from the environment's default domain rather than the
              // app's own FQDN, which would be a self-reference. Container Apps
              // FQDNs are '<app-name>.<environment default domain>', so this is
              // exact, not a guess.
              name: 'AUTH_URL'
              value: 'https://${namePrefix}-web.${containerAppsEnvironment.properties.defaultDomain}'
            }
            {
              // Server-side only. The browser never holds a token, so it never
              // calls the API directly (Plan 3 spec 4.1).
              name: 'API_BASE_URL'
              value: 'https://${apiApp.properties.configuration.ingress.fqdn}'
            }
            // AUTH_DEV_BYPASS is DELIBERATELY ABSENT, and cannot be set here.
            // NODE_ENV is production, so assertBypassNotInProduction makes all
            // four entry points refuse to boot — CI asserts the web container
            // exits non-zero with the guard's own error string when the flag is
            // true. See ADR-0012.
            //
            // The three AUTH_MICROSOFT_ENTRA_ID_* variables are likewise absent
            // because Entra is deferred, so isEntraConfigured is false and no
            // provider is registered. Task 7 makes /signin say so honestly
            // instead of rendering a button that cannot work.
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
      }
    }
  }
}

output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
output webUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
```

- [ ] **Step 3: Compile and commit**

```powershell
pnpm infra:lint
Write-Output "exit: $LASTEXITCODE"
```

Expected: exit 0.

```bash
git add infra/main.bicep
git commit -m "feat(infra): the web container app

AUTH_URL is built from the environment's defaultDomain rather than the app's own
ingress FQDN, which would be a self-reference. Container Apps FQDNs are
'<app>.<environment default domain>', so this is exact rather than a guess —
and Auth.js needs AUTH_URL to match the origin the browser actually used or the
post-callback redirect lands on an origin without the session cookie.

AUTH_DEV_BYPASS is absent and cannot be set: NODE_ENV is production, so the
guard makes every entry point refuse to boot (ADR-0012). The Entra variables are
absent because Entra is deferred, so no provider is registered — Task 7 makes
/signin say that honestly rather than rendering a dead button.

Emits apiUrl and webUrl outputs. Neither is a secret; the runbook and the deploy
workflow's smoke test both need them."
```

---

## Task 6: The migration Job

**Files:**
- Modify: `infra/main.bicep`

**Interfaces:**
- Consumes: `containerAppsEnvironment`, `databaseUrl`, `imageTag`, `containerRegistryBase`.
- Produces: a `Microsoft.App/jobs` resource named `${namePrefix}-migrate`, started by name in Task 8.

- [ ] **Step 1: Add the Job**

Append to `infra/main.bicep`, before the `output` lines:

```bicep
// ADR-0009 D3: migrations run as a Container Apps Job inside the environment,
// not from a CI runner. A GitHub runner's egress IP is dynamic, so a
// runner-side migration under D2's allowlist would mean opening a firewall rule
// per run — a race, a cleanup-on-failure problem, and a window where the
// database is broadly reachable. This job's egress is the environment's, which
// is already allowlisted.
//
// Also NOT migrate-on-boot: with scale-to-zero, boot happens constantly, so
// every cold start would attempt a migration and concurrent replicas would race
// for the lock.
resource migrateJob 'Microsoft.App/jobs@2024-03-01' = {
  name: '${namePrefix}-migrate'
  location: location
  properties: {
    environmentId: containerAppsEnvironment.id
    configuration: {
      triggerType: 'Manual'
      // Generous: a first migration on a cold B1ms server is slow. The deploy
      // workflow waits for completion and fails on a non-zero exit.
      replicaTimeout: 600
      // No retry. A failed migration must be looked at, not silently repeated —
      // a partially applied migration retried blindly is worse than a hard stop.
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        {
          name: 'database-url'
          value: databaseUrl
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: '${containerRegistryBase}/irp-migrate:${imageTag}'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
          ]
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Compile**

```powershell
pnpm infra:lint
Write-Output "exit: $LASTEXITCODE"
```

Expected: exit 0.

- [ ] **Step 3: Confirm the migrate image name matches the Dockerfile target**

```powershell
Select-String -Path Dockerfile -Pattern "^FROM .* AS (migrate|api|web)$" | ForEach-Object { $_.Line }
```

Expected: three stage names — `migrate`, `api`, `web`. The Bicep image names (`irp-api`, `irp-web`, `irp-migrate`) must match what Task 8's workflow pushes. If they diverge, the deploy fails with an image-pull error that says nothing about the mismatch.

- [ ] **Step 4: Commit**

```bash
git add infra/main.bicep
git commit -m "feat(infra): the migration Container Apps Job

ADR-0009 D3. Runs prisma migrate deploy inside the environment, whose egress is
already in D2's firewall allowlist. A CI-runner migration would need a firewall
rule opened and closed per run — a race, a cleanup-on-failure problem, and a
window where the database is broadly reachable. Migrate-on-boot is likewise
wrong here: scale-to-zero makes boot constant, so every cold start would attempt
a migration and concurrent replicas would race for the lock.

replicaRetryLimit is 0 on purpose. A failed migration must be looked at, not
silently retried — a partially applied migration retried blindly is worse than a
hard stop."
```

---

## Task 7: The third sign-in state

Today `apps/web/app/(auth)/signin/page.tsx` branches two ways — bypass or Entra. In the deployed environment **neither** is available: `AUTH_DEV_BYPASS` is absent (the guard makes it impossible) and `isEntraConfigured` is false. So it renders a working-looking "Sign in with Microsoft" button wired to a provider that was never registered, and clicking it fails. That is this repo's recurring "renders perfectly, nothing throws" failure, sitting on the first thing a mentor would click.

The panel is extracted so it can be tested without importing `@/auth` — the existing `apps/web/test/signin.test.tsx` has to mock `@/auth` precisely because real `next-auth` needs `next/server`, which Vitest cannot resolve. A panel that receives its action as a prop needs no such mock.

**Files:**
- Create: `apps/web/app/(auth)/signin/sign-in-panel.tsx`
- Modify: `apps/web/app/(auth)/signin/page.tsx`
- Modify: `apps/web/test/signin.test.tsx`

**Interfaces:**
- Produces: `SignInPanel({ bypassEnabled, entraConfigured, signInAction }: SignInPanelProps)`.

> ### CORRECTION 2 (found during execution, 2026-07-31): the three states were baked into static HTML
>
> As originally written, this task fixed the wrong-button bug and left a worse one behind. It moved
> the branch into `SignInPanel` but kept `bypassEnabled` / `entraConfigured` as module-scope
> constants and added **no route segment config** — so Next prerendered `/signin` as **static**.
> Verified after Step 6: `/signin` appeared in `.next/prerender-manifest.json` with `signin.html`
> written to `.next/server/app/`. One of the three states was chosen at **build** time and baked into
> HTML.
>
> That is not cosmetic. The **Plan 3 spec §7 Entra cutover is documented as four config steps with
> NO code change.** With a baked page, setting the three `AUTH_MICROSOFT_ENTRA_ID_*` variables on the
> Container App would have left the "not configured" panel on screen until someone rebuilt the image
> — the documented cutover would have silently not worked. A page whose rendered output depends on
> runtime environment configuration must not be statically prerendered.
>
> **Two things were added to this task and are now in its steps:**
>
> 1. `export const dynamic = "force-dynamic"` in Step 4, with the comment explaining why. The route
>    table then reports `ƒ /signin` instead of `○ /signin`, `/signin` leaves
>    `prerender-manifest.json`, and `signin.html` is gone. `/not-registered` stays static, correctly
>    — it reads no environment.
> 2. A **route-segment test** in Step 1 asserting that export. Without it the invariant was
>    load-bearing but enforced only by a comment: deleting the export left all 79 other tests green
>    while `/signin` silently went back to being baked. That is the false-green shape `CLAUDE.md`
>    records four times over. Proved red before being trusted —
>    `AssertionError: expected undefined to be 'force-dynamic'`.
>
> `force-dynamic` removes the baked HTML; it does **not** make the two constants re-read per request.
> They are still evaluated once per **server process**. The §7 cutover works because changing env
> vars on a Container App creates a new revision, and therefore a new process — not because of live
> reload.
>
> One further deviation, from review: Step 1's "offers NO sign-in control" test originally asserted
> only that two *specific* button names were absent, so a differently labelled control would have
> passed the test guarding the state this whole task exists for. It now asserts
> `queryAllByRole("button")` has length 0.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/test/signin.test.tsx`:

```tsx
describe("SignInPanel", () => {
  it("offers the dev identity picker when the bypass is on", () => {
    render(<SignInPanel bypassEnabled entraConfigured={false} signInAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Mentor \(Admin\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign in with Microsoft/ })).not.toBeInTheDocument();
  });

  it("offers the Microsoft button when Entra is configured and the bypass is off", () => {
    render(<SignInPanel bypassEnabled={false} entraConfigured signInAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Sign in with Microsoft/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mentor \(Admin\)/ })).not.toBeInTheDocument();
  });

  // The deployed environment. This is the state that did not exist before Plan
  // 4B created an environment able to reach it.
  it("offers NO sign-in control when neither the bypass nor Entra is available", () => {
    render(<SignInPanel bypassEnabled={false} entraConfigured={false} signInAction={vi.fn()} />);
    // Assert NO button of ANY name, not just that these two specific labels are
    // absent — this is the state the whole task exists for, and a differently
    // labelled control is exactly the regression that matters. The two named
    // negatives stay as documentation of the states being ruled out.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Sign in with Microsoft/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mentor \(Admin\)/ })).not.toBeInTheDocument();
  });

  it("says plainly that sign-in is not configured, and names what is missing", () => {
    render(<SignInPanel bypassEnabled={false} entraConfigured={false} signInAction={vi.fn()} />);
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
    expect(screen.getByText(/AUTH_MICROSOFT_ENTRA_ID/)).toBeInTheDocument();
  });

  // The bypass must never win in a deployed environment. It cannot be set there
  // (ADR-0012's guard), but the panel should not be the thing relying on that.
  it("prefers the bypass over Entra when both are somehow present", () => {
    render(<SignInPanel bypassEnabled entraConfigured signInAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Mentor \(Admin\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign in with Microsoft/ })).not.toBeInTheDocument();
  });
});

// This invariant is NOT covered by rendering tests: SignInPanel takes its flags
// as props, so deleting `export const dynamic = "force-dynamic"` from page.tsx
// leaves every other test passing while /signin silently returns to being
// statically prerendered — baking one of three states into signin.html at build
// time and breaking the config-only Entra cutover documented in the Plan 3 spec
// §7. Assert the export directly, since that is the thing a future edit would
// remove.
describe("the /signin route segment config", () => {
  it("is force-dynamic, so the three states follow runtime configuration", async () => {
    const page = await import("@/app/(auth)/signin/page");
    expect(page.dynamic).toBe("force-dynamic");
  });
});
```

Add the import at the top of the file, beside the existing imports:

```tsx
import { SignInPanel } from "@/app/(auth)/signin/sign-in-panel";
```

The page module is imported dynamically inside the test, not at the top of the
file: the existing `vi.mock("@/auth")` must be registered before it loads, since
`page.tsx` imports `signIn` from there. No new mock is needed, and
`auth.config.ts`'s module-scope `assertBypassNotInProduction` is inert under
Vitest because `NODE_ENV` is `test`, not `production`.

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
pnpm --filter @irp/web test 2>&1 | Select-String -Pattern "SignInPanel|Cannot find module|Tests  "
```

Expected: FAIL — the module `sign-in-panel` does not exist.

- [ ] **Step 3: Create the panel**

Create `apps/web/app/(auth)/signin/sign-in-panel.tsx`:

```tsx
import { DevIdentityPicker } from "./dev-identity-picker";

export interface SignInPanelProps {
  /** AUTH_DEV_BYPASS === "true". Impossible in production — see ADR-0012. */
  bypassEnabled: boolean;
  /** All three AUTH_MICROSOFT_ENTRA_ID_* variables present and non-empty. */
  entraConfigured: boolean;
  /** Server action that starts the Entra flow. Passed in rather than imported
   *  so this component can be rendered in a unit test: importing @/auth pulls in
   *  real next-auth, which needs next/server and is unresolvable under Vitest. */
  signInAction: () => void | Promise<void>;
}

/**
 * Which sign-in control to show, in one place.
 *
 * THREE states, not two. The third — neither the bypass nor Entra — became
 * reachable the moment Plan 4B deployed an environment: NODE_ENV is production
 * there, so the bypass is refused by the guard, and Entra is unconfigured
 * because that work is deferred. Before this component, that combination
 * rendered a "Sign in with Microsoft" button wired to a provider that was never
 * registered: it looked right, threw nothing, and did nothing. That is the exact
 * failure class this repository keeps being caught by, and it would have been
 * the first thing a mentor clicked.
 *
 * The bypass deliberately wins when both are somehow set. It cannot be set in
 * production, but this component should not be the thing relying on that.
 */
export function SignInPanel({
  bypassEnabled,
  entraConfigured,
  signInAction,
}: SignInPanelProps): React.JSX.Element {
  if (bypassEnabled) {
    return <DevIdentityPicker />;
  }

  if (entraConfigured) {
    return (
      <form action={signInAction}>
        <button
          type="submit"
          className="rounded-[var(--radius-control)] px-4 py-2 font-semibold"
          style={{ background: "var(--primary)", color: "#ffffff" }}
        >
          Sign in with Microsoft
        </button>
      </form>
    );
  }

  return (
    <div
      className="rounded-[var(--radius-control)] border p-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <p className="mb-2 text-sm font-semibold" style={{ color: "var(--ink)" }}>
        Sign-in is not configured in this environment.
      </p>
      <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
        No identity provider is available, so there is deliberately nothing to
        click. Set the three <code>AUTH_MICROSOFT_ENTRA_ID_*</code> variables to
        enable Microsoft sign-in, or <code>AUTH_DEV_BYPASS=true</code> for local
        development.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Reduce the page to a shell**

In `apps/web/app/(auth)/signin/page.tsx`, replace the `import { DevIdentityPicker }` line with:

```tsx
import { isEntraConfigured } from "@/auth.config";
import { SignInPanel } from "./sign-in-panel";
```

Add the route segment config immediately after the imports, above `ILLUSTRATION`:

```tsx
// Rendered per request, NOT statically prerendered.
//
// Both bypassEnabled and entraConfigured are read from process.env, so the
// branch SignInPanel takes depends on the runtime environment. Next would
// otherwise prerender this page at BUILD time and bake one of the three states
// into signin.html — which was verified happening: /signin appeared in
// .next/prerender-manifest.json.
//
// The consequence was a trap rather than a cosmetic issue. The Plan 3 spec §7
// Entra cutover is documented as four config steps with NO code change, but
// with a baked page, setting the three AUTH_MICROSOFT_ENTRA_ID_* variables on
// the Container App would leave the "not configured" panel on screen until
// someone rebuilt the image. Do not remove this.
export const dynamic = "force-dynamic";
```

Replace the `const bypassEnabled = ...` line with:

```tsx
const bypassEnabled = process.env.AUTH_DEV_BYPASS === "true";
const entraConfigured = isEntraConfigured(process.env);
```

Replace the whole `{bypassEnabled ? (...) : (...)}` block — from `{bypassEnabled ? (` through its closing `)}` — with:

```tsx
        <SignInPanel
          bypassEnabled={bypassEnabled}
          entraConfigured={entraConfigured}
          signInAction={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/" });
          }}
        />
```

- [ ] **Step 5: Run the tests**

```powershell
pnpm --filter @irp/web test 2>&1 | Select-String -Pattern "Test Files|Tests  |FAIL"
```

Expected: PASS, with 5 more tests than before (79 total if the count was 74).

- [ ] **Step 6: Run the full verification set**

`tsc` alone does not run Next's own checks, and this task touches a page and a server action — exactly where it has missed errors before.

```powershell
pnpm typecheck; Write-Output "typecheck: $LASTEXITCODE"
pnpm lint; Write-Output "lint: $LASTEXITCODE"
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build; Write-Output "build: $LASTEXITCODE"; Remove-Item Env:\AUTH_DEV_BYPASS
```

Expected: all exit 0. The build emits one expected Turbopack warning about `process.exit` in `instrumentation.ts` and still reports "Compiled successfully" — that is documented and correct.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(auth)/signin/sign-in-panel.tsx" "apps/web/app/(auth)/signin/page.tsx" apps/web/test/signin.test.tsx
git commit -m "feat(web): a third sign-in state for an environment with no provider

The page branched two ways, bypass or Entra. A deployed environment is neither:
NODE_ENV is production so the bypass is refused by the guard (ADR-0012), and
Entra is unconfigured because that work is deferred. That combination rendered a
'Sign in with Microsoft' button wired to a provider that was never registered —
it looked right, threw nothing, and did nothing. This repository's recurring
failure mode, positioned on the first thing a mentor would click on Demo Day.

Now says so explicitly and renders no control at all, naming the variables that
would enable each path.

Extracted into SignInPanel taking the server action as a PROP rather than
importing @/auth, which is what makes it unit-testable: real next-auth needs
next/server, which Vitest cannot resolve, and the existing suite has to mock
@/auth for exactly that reason. Five tests cover all three states plus the
both-set precedence case — the bypass wins there, because this component should
not be the thing relying on the guard to make that impossible."
```

---

## Task 8: The deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `infra/main.bicep`'s parameters (`imageTag`, `postgresAdminUsername`, `postgresAdminPassword`, `authSecret`, `allowedClientIpAddresses`) and its `apiUrl` / `webUrl` outputs; the `migrate`/`api`/`web` Dockerfile targets.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

# Only on main, and only after CI has had its say on the PR. There is one
# environment, so there is no per-branch deploy to reason about.
on:
  push:
    branches: [main]
  # Lets a rollback re-run this workflow at a chosen SHA without an empty commit.
  workflow_dispatch:
    inputs:
      imageTag:
        description: "Git SHA to deploy. Defaults to the current commit."
        required: false
        type: string

concurrency:
  # Never two applies at once: ARM would serialise them anyway, and the migration
  # Job would race itself.
  group: deploy-production
  cancel-in-progress: false

permissions:
  # Required for OIDC federation to Azure. There is NO client secret anywhere.
  id-token: write
  contents: read
  packages: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    # NFR-5 targets under 8 minutes. This is a backstop well above that, so a
    # hang fails in minutes rather than burning GitHub's 360-minute default.
    timeout-minutes: 30
    env:
      RESOURCE_GROUP: irp-rg
      NAME_PREFIX: irp
      REGISTRY_BASE: ghcr.io/${{ github.repository_owner }}
    steps:
      - uses: actions/checkout@v4

      - name: Resolve the image tag
        id: tag
        run: |
          set -euo pipefail
          tag="${{ inputs.imageTag }}"
          if [ -z "$tag" ]; then tag="${GITHUB_SHA}"; fi
          echo "value=$tag" >> "$GITHUB_OUTPUT"
          echo "Deploying tag $tag"

      - uses: docker/setup-buildx-action@v3

      # Packages are PUBLIC, so no pull credential exists anywhere. This login
      # is for the PUSH only, and uses the built-in GITHUB_TOKEN rather than a
      # PAT.
      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # APP_VERSION is passed as a BUILD ARG and baked into the image. It is
      # deliberately NOT set as a container-app runtime env var, so /health
      # reporting it proves the build arg actually reached the image.
      - name: Build and push the api image
        uses: docker/build-push-action@v6
        with:
          context: .
          target: api
          push: true
          tags: ${{ env.REGISTRY_BASE }}/irp-api:${{ steps.tag.outputs.value }}
          build-args: APP_VERSION=${{ steps.tag.outputs.value }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push the web image
        uses: docker/build-push-action@v6
        with:
          context: .
          target: web
          push: true
          tags: ${{ env.REGISTRY_BASE }}/irp-web:${{ steps.tag.outputs.value }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push the migration image
        uses: docker/build-push-action@v6
        with:
          context: .
          target: migrate
          push: true
          tags: ${{ env.REGISTRY_BASE }}/irp-migrate:${{ steps.tag.outputs.value }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Log in to Azure with OIDC
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Apply the Bicep template
        id: apply
        # Secrets are read from env vars ($POSTGRES_ADMIN_USERNAME etc.) rather
        # than interpolated as ${{ secrets.* }} directly into the script body.
        # Direct interpolation substitutes the raw secret value into the
        # script TEXT before bash ever parses it, so a value containing shell
        # metacharacters (a quote, a backtick, a $(...)) can break the script
        # or inject a command. This does NOT remove the secrets from `az`'s
        # argv — they are still passed as command-line arguments and remain
        # visible to anything that can list processes on this runner. The
        # only way to avoid that would be writing them to a file on disk, a
        # worse trade for values this sensitive (a plaintext-secret file left
        # on the runner's filesystem needs its own cleanup-on-always step, and
        # a mistake there leaks further than argv does). Argv exposure is
        # accepted because the runner is ephemeral, single-tenant for the
        # duration of the job, and only first-party actions run in it.
        env:
          POSTGRES_ADMIN_USERNAME: ${{ secrets.POSTGRES_ADMIN_USERNAME }}
          POSTGRES_ADMIN_PASSWORD: ${{ secrets.POSTGRES_ADMIN_PASSWORD }}
          AUTH_SECRET: ${{ secrets.AUTH_SECRET }}
        run: |
          set -euo pipefail
          az deployment group create \
            --resource-group "$RESOURCE_GROUP" \
            --template-file infra/main.bicep \
            --name "deploy-${{ steps.tag.outputs.value }}" \
            --parameters \
              namePrefix="$NAME_PREFIX" \
              imageTag="${{ steps.tag.outputs.value }}" \
              containerRegistryBase="$REGISTRY_BASE" \
              postgresAdminUsername="$POSTGRES_ADMIN_USERNAME" \
              postgresAdminPassword="$POSTGRES_ADMIN_PASSWORD" \
              authSecret="$AUTH_SECRET" \
              allowedClientIpAddresses="${{ vars.ALLOWED_CLIENT_IPS || '[]' }}" \
            --query "properties.outputs" \
            --output json > outputs.json
          cat outputs.json
          # Assigned to a variable FIRST, then echoed — not
          # `echo "apiUrl=$(jq ...)" >> "$GITHUB_OUTPUT"` directly. A failing
          # command substitution embedded inside another command's argument
          # does not trip `errexit`; only a bare `var=$(cmd)` statement does.
          # With the substitution buried in echo's argument, a `jq` failure
          # here would silently write an empty output value instead of
          # failing this step, surfacing later as a confusing curl error in
          # the smoke-test steps rather than as a clear failure here.
          api_url=$(jq -r '.apiUrl.value' outputs.json)
          web_url=$(jq -r '.webUrl.value' outputs.json)
          echo "apiUrl=$api_url" >> "$GITHUB_OUTPUT"
          echo "webUrl=$web_url" >> "$GITHUB_OUTPUT"

      # Runs AFTER the apply, which leaves a brief window where new code can meet
      # an unmigrated schema. Accepted for now — scale-to-zero means no replicas
      # run at rest, there is one revision, and Plan 5's migrations are additive.
      # REVISIT on either trigger: the first non-additive migration, or
      # minReplicas > 0. The fix is a second apply behind a deployApps parameter.
      - name: Run the migration job and wait for it
        run: |
          set -euo pipefail
          # UNVERIFIABLE-UNTIL-FIRST-APPLY RISK: `az containerapp job start`'s
          # exact JSON output shape — specifically, whether the started
          # execution's identifier is at top-level `.name` — cannot be checked
          # offline; there is no Azure login or live subscription in this
          # environment. Captured explicitly and polled BY IDENTITY rather
          # than trusting `[0]` of the execution list, because `[0]` rests on
          # the unproven assumption that the most recent execution in that
          # list is always the one this run just started. If `.name` is the
          # wrong field on the real first deploy, the fallback is to revert to
          # `[0]`, accepting that unproven assumption.
          exec_name=$(az containerapp job start \
            --name "${NAME_PREFIX}-migrate" \
            --resource-group "$RESOURCE_GROUP" \
            --output json | jq -r '.name')
          if [ -z "$exec_name" ] || [ "$exec_name" = "null" ]; then
            echo "::error::Could not read the started execution's name from 'az containerapp job start' output — cannot poll by identity."
            exit 1
          fi
          echo "Job execution '$exec_name' started; polling for completion."
          # The real JobExecutionRunningState enum, confirmed against the
          # Azure Container Apps API type: Running, Processing, Stopped,
          # Degraded, Failed, Unknown, Succeeded. `Cancelled` is DELIBERATELY
          # ABSENT — it is not a member of that enum, so a branch matching it
          # was dead code that read as authoritative but never fired.
          #
          # Stopped and Degraded are treated as terminal failures alongside
          # Failed: an execution that has stopped or degraded is not going to
          # progress to Succeeded on its own, so waiting out the full
          # 10-minute budget for one of these would needlessly cost most of
          # NFR-5's 8-minute deploy target for a result already known.
          #
          # Unknown is NOT treated as terminal — a single transient Unknown
          # reading is far more plausible than a permanent failure, so polling
          # continues through it — but `last_status` is tracked and reported
          # in the timeout message below, so an Unknown that never resolves is
          # named explicitly rather than folded into a purely generic
          # message.
          last_status="(none observed yet)"
          for i in $(seq 1 60); do
            sleep 10
            status=$(az containerapp job execution list \
              --name "${NAME_PREFIX}-migrate" \
              --resource-group "$RESOURCE_GROUP" \
              --query "[?name=='${exec_name}'].properties.status | [0]" --output tsv)
            echo "attempt $i: $status"
            if [ -n "$status" ] && [ "$status" != "None" ]; then
              last_status="$status"
            fi
            case "$status" in
              Succeeded) echo "Migration succeeded."; exit 0 ;;
              Failed|Stopped|Degraded)
                echo "::error::The migration job execution '$exec_name' finished with status $status. The deploy is aborted; the app images are already live but the schema was not migrated."
                exit 1 ;;
            esac
          done
          echo "::error::The migration job execution '$exec_name' did not reach a terminal state within 10 minutes. Last observed status: $last_status."
          exit 1

      # Reuses the assertions the `images` job already makes against local
      # containers, now against the deployed URLs.
      - name: Smoke test — /health reports the deployed SHA
        run: |
          set -euo pipefail
          url="${{ steps.apply.outputs.apiUrl }}/health"
          # First request pays a scale-from-zero cold start (ADR-0009 D5), so
          # retry rather than treating a slow first response as a failure.
          # `reached` distinguishes "never became reachable" from "reachable
          # but reported the wrong SHA" below — without it, an endpoint that
          # never comes up at all falls through to the SHA-mismatch error and
          # blames APP_VERSION for a plain connectivity failure.
          reached=0
          for i in $(seq 1 10); do
            if body=$(curl -fsS --max-time 30 "$url"); then
              reached=1
              break
            fi
            sleep 10
          done
          if [ "$reached" -ne 1 ]; then
            echo "::error::/health at $url was never reachable after 10 attempts."
            exit 1
          fi
          echo "$body"
          echo "$body" | grep -q "${{ steps.tag.outputs.value }}" || {
            echo "::error::/health did not report the deployed SHA. APP_VERSION did not reach the image, or an older revision is still serving."
            exit 1
          }

      - name: Smoke test — unauthenticated /api/v1/me is 401 with a Problem Details body
        run: |
          set -euo pipefail
          status=$(curl -sS --max-time 30 -o me.json -w '%{http_code}' "${{ steps.apply.outputs.apiUrl }}/api/v1/me")
          echo "status=$status"; cat me.json
          if [ "$status" != "401" ]; then
            echo "::error::Expected 401 from an unauthenticated /api/v1/me, got $status."
            exit 1
          fi
          grep -q '"type"' me.json || {
            echo "::error::The 401 body is not RFC 7807 Problem Details."
            exit 1
          }

      - name: Smoke test — the web app serves its sign-in page
        run: |
          set -euo pipefail
          # CRITICAL FIX (caught in review, not by running this): as
          # originally written, this loop had no explicit fail-closed check
          # after it, unlike the /health step above. If all 10 attempts
          # failed, the loop exhausted without ever hitting `break`, the
          # script ended, and the STEP'S exit status was that of the last
          # command executed — `sleep 10`, which succeeds. So the step
          # reported PASSED even though the site was never reachable.
          # Reproduced with a stubbed always-failing `curl` under
          # `set -euo pipefail`: exited 0. `reached` makes the pass/fail
          # explicit instead of relying on whatever the loop's last command
          # happened to be.
          reached=0
          for i in $(seq 1 10); do
            if curl -fsS --max-time 30 -o /dev/null "${{ steps.apply.outputs.webUrl }}/signin"; then
              reached=1
              break
            fi
            sleep 10
          done
          if [ "$reached" -ne 1 ]; then
            echo "::error::${{ steps.apply.outputs.webUrl }}/signin was never reachable after 10 attempts."
            exit 1
          fi

      - name: Report the deployed URLs
        run: |
          {
            echo "### Deployed \`${{ steps.tag.outputs.value }}\`"
            echo "- API: ${{ steps.apply.outputs.apiUrl }}"
            echo "- Web: ${{ steps.apply.outputs.webUrl }}"
          } >> "$GITHUB_STEP_SUMMARY"
```

> ### CORRECTION 3 (found during review, 2026-07-31): the /signin smoke test could pass while the site was unreachable
>
> This task's YAML, exactly as originally written above, contained a **false-green bug** in the
> "Smoke test — the web app serves its sign-in page" step:
>
> ```bash
> for i in $(seq 1 10); do
>   curl -fsS --max-time 30 -o /dev/null "$URL/signin" && break || sleep 10
> done
> ```
>
> If all 10 attempts failed, the loop exhausted **without ever hitting `break`**, the script ended,
> and — under `set -euo pipefail` — the step's exit status was that of the **last command run**,
> which was `sleep 10`. `sleep` succeeds. **The step reported PASSED even though the web app was
> never reachable.** This was not caught by running the workflow — there is no live Azure
> environment to run it against yet — it was caught by an independent review that **reproduced it**
> by stubbing `curl` to always fail and confirming the step exits `0` under `set -euo pipefail`.
>
> The `/health` smoke test directly above this one in the same task did **not** have this defect: it
> already had an explicit `|| { echo "::error::..."; exit 1; }` after its own, structurally identical
> retry loop. The two loops were written side by side and only one of them failed closed — proof this
> class of bug is easy to introduce even when a correct sibling example is right there in the same
> file.
>
> **Fixed** (in both this plan and `.github/workflows/deploy.yml`, per `CLAUDE.md`'s rule that a
> defect found in the plan's own code gets fixed at source, not just in the generated artifact): a
> `reached` flag, set only inside the loop body on a real success and checked after the loop, so
> exhausting all 10 attempts now emits `::error::` naming the unreachable URL and fails the step
> explicitly, matching the `/health` step's shape. The same review pass also found and fixed two
> further defects in this task's own code while in the file: the migration-wait loop matched a
> `Cancelled` status that is not a member of the real `JobExecutionRunningState` enum (dead code) and
> left `Stopped`/`Degraded` unhandled (silently polling out the full 10-minute budget instead of
> failing fast), and it polled `[0]` of the execution list with nothing tying that result to the
> execution this run actually started, rather than by the started execution's identity. Both are
> fixed in the corrected YAML above; see its inline comments for the detail.

- [ ] **Step 2: Verify the workflow parses and its shape is right**

```powershell
node -e "const y=require('./node_modules/.pnpm/js-yaml@4.2.0/node_modules/js-yaml/index.js');const f=require('fs');const d=y.load(f.readFileSync('.github/workflows/deploy.yml','utf8'));console.log('name:',d.name);console.log('permissions:',JSON.stringify(d.permissions));console.log('timeout:',d.jobs.deploy['timeout-minutes']);console.log('steps:',d.jobs.deploy.steps.length)"
```

Expected: `permissions` includes `id-token: write` (without it, `azure/login` cannot use OIDC and fails with an unhelpful token error), `timeout: 30`, and 14 steps.

- [ ] **Step 3: Confirm no secret is echoed**

```powershell
Select-String -Path .github/workflows/deploy.yml -Pattern "echo .*secrets\.|cat .*secret" | ForEach-Object { $_.Line }
```

Expected: **no matches.** `outputs.json` is `cat`ed, which is safe — `main.bicep` emits only `apiUrl` and `webUrl`, and the linter's `outputs-should-not-contain-secrets` rule is set to `error` to keep it that way.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat(ci): deploy workflow — GHCR push, OIDC login, apply, migrate, smoke test

Authenticates with GitHub OIDC federation, so there is no stored Azure client
secret. id-token: write is required for that and its absence fails with an
unhelpful token error, so it is called out in a comment.

The GHCR login is for the PUSH only and uses the built-in GITHUB_TOKEN — the
packages are public, so no pull credential exists anywhere.

APP_VERSION is passed as a build arg and NOT as a container-app runtime env var,
which is what makes the /health smoke test prove the build arg reached the image
rather than merely reading a runtime value back.

The migration job runs after the apply, leaving a brief window where new code
could meet an unmigrated schema. Accepted and documented inline with its two
revisit triggers: the first non-additive migration, or minReplicas > 0. Job
polling treats Failed and Cancelled as distinct terminal states and reports that
the images are already live while the schema is not — the operator needs to know
which half succeeded.

Smoke tests retry rather than failing on the first slow response, because
ADR-0009 D5's scale-to-zero means the first request pays a cold start."
```

---

## Task 9: Rollback procedure and the deploy runbook

> ### CORRECTION 4 (found by review during execution, 2026-08-01): the documented rollback was destructive
>
> Both this task's runbook text and Task 8's workflow described a rollback as "dispatch Deploy with
> `imageTag` set to the previous SHA". **That did not roll anything back, and it destroyed the
> artifact needed to do so.**
>
> `actions/checkout` in `deploy.yml` takes no `ref:`, so a `workflow_dispatch` run checks out the tip
> of the selected branch — not the commit named by `imageTag`, which only ever names an image tag.
> The three build steps had no `if:`, so they always ran. A rollback therefore **built the current
> broken code, tagged it with the old SHA, and pushed it over the known-good image in GHCR.**
> `/health` then reported the old SHA, because `APP_VERSION` is baked from the same input, while the
> container ran current code — so every success signal the runbook told the operator to check was
> satisfied while nothing had been rolled back.
>
> **Fixed** by gating the buildx setup, the GHCR login and all three build/push steps on
> `steps.tag.outputs.mode == 'build'`, which the tag-resolution step sets only when `imageTag` is
> empty. A rollback now redeploys the existing immutable artifact and builds nothing; a tag missing
> from GHCR fails loudly at pull instead of silently deploying the wrong code.
>
> **Rejected:** adding `ref: ${{ inputs.imageTag }}` to `checkout` so rollbacks rebuild from the old
> commit. It still overwrites an existing artifact with a freshly built one, making the deployed
> image depend on the builder rather than on what was actually tested.
>
> Two smaller corrections landed with it: `infra/main.bicep` now sets `activeRevisionsMode: 'Single'`
> explicitly on both container apps rather than relying on the ARM default, because the rollback
> procedure depends on it and the design spec called it "an explicit choice, not a default to
> discover later"; and the runbook no longer claims all three smoke tests retry — `/api/v1/me`
> deliberately does not, because `/health` has already warmed the API and its bare
> `status=$(curl ...)` assignment trips `set -e` on failure.
>
> **This was caught by review, never by running it.** No deploy has ever been executed.

**Files:**
- Create: `docs/deploy-runbook.md`

- [ ] **Step 1: Write the runbook**

Create `docs/deploy-runbook.md`:

````markdown
# Deploy runbook

Everything needed to stand this system up, deploy it, observe it, and roll it back.

**Status of the measurements in this document.** Items marked **`[ ] MEASURE`** have not been run —
they need an authenticated Azure session and a real deployment, which the plan that wrote this file
did not have. They are procedures, not results. Do not cite an unfilled measurement as evidence.

---

## 1. One-time bootstrap

Everything here is done once, by hand, by a subscription Owner.

### 1.1 Register the resource providers

All four are `NotRegistered` on subscription `7bb869f8-053c-4c2d-b444-1bf079bfcef7`. Bicep fails with
a confusing error rather than a clear one if they are missing.

```powershell
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.DBforPostgreSQL
az provider register --namespace Microsoft.Insights
az provider register --namespace Microsoft.OperationalInsights
```

Confirm (takes a few minutes to flip to `Registered`):

```powershell
foreach ($ns in @("Microsoft.App","Microsoft.DBforPostgreSQL","Microsoft.Insights","Microsoft.OperationalInsights")) {
  Write-Output "$ns = $(az provider show --namespace $ns --query registrationState --output tsv)"
}
```

Expected: four lines reading `Registered`.

### 1.2 Create the resource group

```powershell
az group create --name irp-rg --location southeastasia
```

Southeast Asia per ADR-0009 D4. If Burstable B1ms capacity is unavailable there, the recorded
fallback is `centralindia` — change the region here and in the workflow's apply step together.

### 1.3 Create the deploy identity

An app registration with a GitHub OIDC federated credential and `Contributor` on **the resource
group only**. No client secret is created, and none is needed.

This needs **no admin consent**: the credential talks to ARM, not Graph. It requests no Graph
permissions, exposes no API, and is assigned to no users.

```powershell
$appId = az ad app create --display-name "irp-progress-management-deploy" --query appId --output tsv
az ad sp create --id $appId
az ad app federated-credential create --id $appId --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:EnderGuardian25/irp-progress-management:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
$spId = az ad sp show --id $appId --query id --output tsv
az role assignment create --assignee-object-id $spId --assignee-principal-type ServicePrincipal `
  --role Contributor `
  --scope "/subscriptions/7bb869f8-053c-4c2d-b444-1bf079bfcef7/resourceGroups/irp-rg"
Write-Output "AZURE_CLIENT_ID = $appId"
```

The `subject` must match **exactly**. A mismatch fails at `azure/login` with a generic token error
that does not mention the subject — if OIDC login fails, check this first.

`workflow_dispatch` runs on `main` also match `ref:refs/heads/main`, so the rollback path in §5 needs
no second credential.

### 1.4 Configure GitHub

Repository **secrets**:

| Name | Value |
|---|---|
| `AZURE_CLIENT_ID` | the `appId` printed above |
| `AZURE_TENANT_ID` | `d5e769b0-fd19-45e4-a4a8-b73545450234` |
| `AZURE_SUBSCRIPTION_ID` | `7bb869f8-053c-4c2d-b444-1bf079bfcef7` |
| `POSTGRES_ADMIN_USERNAME` | e.g. `irpadmin` — not `admin` or `postgres`, both of which Azure rejects |
| `POSTGRES_ADMIN_PASSWORD` | 16+ random characters |
| `AUTH_SECRET` | `openssl rand -base64 32` |

Repository **variable** (not a secret — it is an IP list):

| Name | Value |
|---|---|
| `ALLOWED_CLIENT_IPS` | `[]` initially. Filled in after §3 |

### 1.5 Make the GHCR packages public

After the first push creates them, set each of `irp-api`, `irp-web` and `irp-migrate` to **Public**
under the repository's Packages settings. Container Apps then pulls anonymously and the template
needs no registry credential at all.

Until they are public, the pull fails with `UNAUTHORIZED` and the container app shows a
provisioning failure rather than a helpful message.

---

## 2. First deploy

Push to `main`, or run the **Deploy** workflow manually.

Expected: about 5–7 minutes, dominated by the three image builds.

**`[ ] MEASURE` — NFR-5, pipeline under 8 minutes.** Record the total workflow duration on the first
deploy and the first cached deploy: _first: ____ · cached: ____ · target: < 8:00_

If the apply fails, read `az deployment group show`:

```powershell
az deployment group show --resource-group irp-rg --name "deploy-<sha>" --query "properties.error" --output json
```

---

## 3. The firewall allowlist

The API reaches Postgres over its public endpoint, so the Container Apps environment's egress
address must be allowlisted. See the design spec §5 and its Task 1 finding for why this is a separate
step rather than a template reference.

Find the egress address:

```powershell
az containerapp env show --name irp-env --resource-group irp-rg --output json | Select-String -Pattern "staticIp|outbound"
```

Then set the `ALLOWED_CLIENT_IPS` repository variable to a JSON array of the addresses — plus your
own IP if you want to connect with `psql` — and re-run the Deploy workflow:

```
["203.0.113.10","198.51.100.4"]
```

**This is the failure that looks like something else.** A wrong or empty allowlist does not fail the
deploy. The apply succeeds, `/health` succeeds — it does not touch the database — and only requests
that read data fail. If `/api/v1/me` returns 500 for a valid token while `/health` is green, suspect
this before suspecting the application.

---

## 4. Observability

### Container logs (both apps' stdout)

```powershell
az monitor log-analytics query --workspace (az monitor log-analytics workspace show --resource-group irp-rg --workspace-name irp-logs --query customerId --output tsv) --analytics-query "ContainerAppConsoleLogs_CL | where ContainerAppName_s == 'irp-api' | order by TimeGenerated desc | take 50" --output table
```

`apps/api` logs pino JSON, so `Log_s` carries the structured record including `reqId` and `traceId`.

### Traces

`selectSpanExporter` (ADR-0014) switched to the Azure Monitor exporter because
`APPLICATIONINSIGHTS_CONNECTION_STRING` is set by the template. No application code was changed to
achieve this.

Issue a request, then:

```powershell
az monitor app-insights query --app irp-insights --resource-group irp-rg --analytics-query "dependencies | union requests | where timestamp > ago(10m) | project timestamp, name, duration, success | order by timestamp desc | take 20" --output table
```

**`[ ] MEASURE` — NFR-6, traces visible within 60 seconds.** Note the wall-clock gap between issuing
a request and the span appearing: _observed: ____ s · target: < 60 s_

**Limitation:** `apps/web` is **not** traced. The exporter seam is `apps/api`-only and instrumenting
Next is a separate decision.

---

## 5. Rollback

**`[ ] MEASURE` — this procedure has NOT been executed.** T-22 asks for a *tested* rollback path; the
honest status until someone runs §5.1 once is "procedure written, execution outstanding."

### 5.1 Roll the application back

Both container apps run in **single-revision mode**, and Container Apps retains prior revisions.
Rolling back is re-deploying the previous SHA.

1. Find the SHA currently deployed:

   ```powershell
   curl.exe -s https://<api-fqdn>/health
   ```

2. Find the previous good SHA — the commit before it on `main`.

3. Run the **Deploy** workflow via `workflow_dispatch` with `imageTag` set to that SHA. The images
   are already in GHCR, so this skips straight past the cached builds.

4. Confirm:

   ```powershell
   curl.exe -s https://<api-fqdn>/health
   ```

   Expected: the previous SHA.

Record the result:

| Step | Expected | Observed | Time |
|---|---|---|---|
| Note the current SHA | matches `main` | | |
| Dispatch with the previous SHA | workflow succeeds | | |
| `/health` reports the previous SHA | previous SHA | | |
| `/signin` still serves | 200 | | |
| Total rollback duration | < 5 min | | |

### 5.2 What rollback does NOT cover

**The database.** Migrations are forward-only: rolling an image back does not roll a migration back.
If a migration is the problem, the recovery is a new forward migration that reverses it, or a
point-in-time restore of the Postgres server — a far heavier operation with data loss between the
restore point and now.

Before deploying a destructive migration, take a manual backup and record how to restore it. Plan 5
owns the first real schema and inherits this.

---

## 6. Cost

The $200 credit expires around **2026-08-27**. After that every choice is measured against the free
grant alone.

```powershell
az consumption usage list --start-date 2026-07-01 --end-date 2026-08-31 --query "[].{name:instanceName, cost:pretaxCost}" --output table
```

Both apps run at `minReplicas: 0` (ADR-0009 D5), so at rest the dominant cost is the B1ms Postgres
server, which does **not** scale to zero.

---

## 7. Stated limitations

Not oversights. Each is a recorded decision with a trigger for revisiting.

| Limitation | Why, and what would change it |
|---|---|
| **Postgres is on a public endpoint** and holds student submission text, which is personal data. A firewall allowlist and TLS are real controls but weaker than a private endpoint | ADR-0009 D2, accepted on demo-scoped grounds; the same concern class as O-5. **The first thing to change if this ever holds real student data** |
| **There is no working sign-in.** Entra is deferred a fourth time, so no provider is registered and `/signin` says so explicitly | Deferred by decision. `bistecglobal.com` and `bisteccare.lk` are in fact ONE tenant, so a single-tenant app registration would work — see the design spec §2. That is a governance decision about a live corporate directory, not a technical blocker |
| **NFR-3 cannot be measured.** The auth-gated load test needs real tokens via the k6 service principal | Follows from the Entra deferral. Plan 11 inherits it |
| **NFR-1's p95 is only valid with the replica floor raised.** A scale-from-zero cold start is seconds | ADR-0009 D5. Plan 11 raises the API's `minReplicas` for the run and must not forget to — a run that forgets produces misleading numbers rather than an obvious error |
| **`apps/web` is untraced** | The exporter seam is `apps/api`-only |
| **Migrations run just after the apply**, leaving a brief window where new code can meet an old schema | Documented in `deploy.yml`. Revisit on the first non-additive migration or `minReplicas > 0` |
| **Rollback is application-only** | See §5.2 |
````

- [ ] **Step 2: Check every measurement placeholder is deliberate**

```powershell
Select-String -Path docs/deploy-runbook.md -Pattern "MEASURE" | ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" }
```

Expected: four `[ ] MEASURE` markers (NFR-5, NFR-6, rollback, and the rollback results table's context). These are the *only* permitted unfilled values in this repo's docs, because they cannot be filled without a live deployment — and each is labelled so nobody cites one as a result.

- [ ] **Step 3: Commit**

```bash
git add docs/deploy-runbook.md
git commit -m "docs: deploy runbook — bootstrap, deploy, observe, roll back

T-23. Covers provider registration, resource group, the OIDC deploy identity,
GitHub configuration, making the GHCR packages public, the first deploy, the
firewall allowlist, log and trace queries, rollback, cost, and the stated
limitations.

Every value that cannot be obtained without a live deployment is marked
'[ ] MEASURE' rather than guessed, so nobody can cite an unfilled measurement as
evidence. That includes NFR-5 and NFR-6, and it includes T-22: the rollback is a
written procedure whose honest status is 'execution outstanding' until someone
runs it once. The plan does not claim a tested rollback it has not tested.

3 calls out the failure that looks like something else: a wrong firewall
allowlist does not fail the deploy. The apply succeeds and /health succeeds
because it never touches the database, so only data reads fail — which reads as
an application bug rather than a network one.

5.2 states plainly that rollback does not cover the database, since migrations
are forward-only."
```

---

## Task 10: Documentation reconciliation

Three claims in `docs/manual-setup-steps.md` are **factually wrong**, not merely stale, and two of them were load-bearing for a design decision. Correcting them is the point of this task.

**Files:**
- Modify: `docs/manual-setup-steps.md`, `handoff.md`, `CLAUDE.md`, `docs/adr/0009-hosting-topology.md`

- [ ] **Step 1: Correct `manual-setup-steps.md` §1.1a's false premise**

Insert immediately below the `### 1.1a` heading:

```markdown
> **CORRECTED 2026-07-31, verified with `az`. The premise below is false.**
> `bistecglobal.com` and `bisteccare.lk` are **the same tenant**,
> `d5e769b0-fd19-45e4-a4a8-b73545450234` (*BISTEC Global*) — both are verified domains on it,
> alongside about twenty others. So the subscription and the users are in **one** directory, and a
> single-tenant app registration there would let real mentors and students sign in. Graph reads also
> work (four consecutive calls succeeded), and `allowedToCreateApps` is `true`, so no admin role is
> needed to create the registration.
>
> **A dedicated directory is therefore not technically necessary.** What remains is a *governance*
> question — `d5e769b0` is BISTEC's live corporate directory — and that is why Entra was deferred
> again rather than done. Ask the mentor before registering a user-facing SSO app there. See the
> Plan 4B design spec §2 for the evidence.
>
> Everything below is kept as the historical reasoning. Do not act on it without reading this note.
```

- [ ] **Step 2: Correct §1.2's "not installed" claim**

Replace the `### 1.2` heading and the two paragraphs that follow it with:

```markdown
### 1.2 Install the Azure CLI — ✅ DONE

Installed and working, version **2.88.0**, authenticated as `Damian@bisteccare.lk`. The **Bicep
CLI** is also installed, version 0.45.15, via `az bicep install` — which needs no elevation and no
authentication.

**Correction, 2026-07-31.** This section previously said the CLI was absent on the second machine
and could not be installed non-interactively. It is present and authenticated, and `az` reaches both
ARM and Microsoft Graph. The conditional-access note below described real failures at the time; they
did not recur across four consecutive Graph calls on 2026-07-31. Treat Graph as working but not
proven reliable — nothing in Plan 4B depends on it.
```

- [ ] **Step 3: Close §1.5**

Replace the `### 1.5` heading and its "Tell me which…" closing paragraph with:

```markdown
### 1.5 Container image visibility — ✅ DECIDED: **public**

**Decided 2026-07-31: the GHCR packages are public.** Container Apps pulls anonymously, so there is
no `GHCR_PAT`, no registry secret in Bicep, and nothing to rotate. The accepted cost is
world-readable images; they contain no secrets, because all configuration is injected at runtime, so
the exposure is the source code.

This fires ADR-0009's own "revisit when the packages are made public" trigger. The conclusion is **no
change**: D1's negative consequence — a long-lived `read:packages` credential — is simply retired,
and the ACR-for-managed-identity question is moot because no registry credential exists at all.

**One manual step remains:** after the first push creates them, set `irp-api`, `irp-web` and
`irp-migrate` to Public in the repository's Packages settings. Until then the pull fails
`UNAUTHORIZED`.
```

- [ ] **Step 4: Record the fired trigger in ADR-0009**

In `docs/adr/0009-hosting-topology.md`, under `## Revisit when`, replace the first bullet with:

```markdown
- ~~**The GHCR credential causes a deploy failure**, or the packages are made public~~ — **fired
  2026-07-31: the packages were made public.** Conclusion: **no change to this ADR.** D1's negative
  consequence (a long-lived `read:packages` PAT) is retired rather than mitigated, and the
  ACR-managed-identity alternative is moot, because with anonymous pulls no registry credential
  exists anywhere. Recorded in `docs/manual-setup-steps.md` §1.5 and the Plan 4B design spec §4.
```

- [ ] **Step 5: Add the infrastructure facts to `CLAUDE.md`**

Insert immediately before the `**Time handling.**` paragraph:

```markdown
**Infrastructure facts from Plan 4B:**

- **`az bicep lint` needs no Azure credentials** and does full semantic analysis, so the template is
  gated in CI before any subscription is ready. **`az deployment ... what-if` and `validate` DO call
  ARM** and cannot be gates — they are runbook procedures. Do not "upgrade" the gate to `what-if`.
- **Prefer `az bicep lint` over `az bicep build`** for the gate: `build` writes `infra/main.json`,
  which would be a fourth generated path to gitignore and guard for no benefit.
- **Every Bicep linter rule in `infra/bicepconfig.json` is `error`**, for the same reason
  `redocly.yaml` uses `recommended-strict`. A warning that does not fail the build is unenforced.
- **Never set `APP_VERSION` as a container-app runtime env var.** The Dockerfile bakes it as a build
  arg, and the `/health` assertion only proves the arg reached the image *because* no runtime copy
  exists. This was already fixed once, in 4A's CORRECTION 4.
- **`allowedClientIpAddresses` defaults to empty and creates no firewall rule when empty.** A
  forgotten value must fail closed. **A wrong allowlist is the dangerous case**: the apply succeeds,
  `/health` succeeds because it never touches the database, and only data reads fail — which reads as
  an application bug rather than a network one.
- **`AUTH_URL` for the web app is built from the environment's `defaultDomain`**, not the app's own
  ingress FQDN, which would be a self-reference. Container Apps FQDNs are
  `<app>.<environment default domain>`.
- **The subscription and the users are in ONE tenant.** `bistecglobal.com` and `bisteccare.lk` are
  both verified domains of `d5e769b0-fd19-45e4-a4a8-b73545450234`. Earlier docs treated them as two
  directories and built a decision on it. Verify tenant claims with `az rest` against
  `/v1.0/domains` before relying on them.
- **A deploy service principal needs no admin consent.** It authenticates to ARM, not Graph. Admin
  consent is only required for the user-facing SSO app.
```

- [ ] **Step 6: Update `handoff.md`**

In §2a, change the 4B row's status to `✅ **This plan**` and add a Plan 11 row note. In §3, replace
the "In flight" line with Plan 4B's completion state, and add:

```markdown
**Plan 4B shipped apply-ready, and that distinction matters.** `infra/main.bicep`, `deploy.yml` and
`docs/deploy-runbook.md` all exist and the Bicep gate is green in CI, but **nothing has been
applied**: the four resource providers are still `NotRegistered` and no Azure credential exists in
GitHub. So **Deliverable 3 is not complete until Damian works through the runbook's §1**, and NFR-5,
NFR-6 and the T-22 rollback are written procedures with unfilled `[ ] MEASURE` markers rather than
results. Nothing in this plan claims otherwise — do not report D3 as done on the strength of the
files existing.

**Three premises that earlier handoffs stated as fact are false**, and two were load-bearing:
the Azure CLI is installed and authenticated; Graph reads work; and `bistecglobal.com` and
`bisteccare.lk` are **one tenant**, not two. The last one falsifies ADR-0011's premise — a
single-tenant app registration would let real mentors and students sign in, satisfying FR-1 properly.
Entra was deferred a fourth time as a **governance** call about BISTEC's live corporate directory,
not a technical one. Plan 4B design spec §2 carries the evidence.
```

- [ ] **Step 7: Verify no live instruction contradicts the code**

```powershell
Select-String -Path CLAUDE.md,handoff.md,docs/manual-setup-steps.md -Pattern "GHCR_PAT|read:packages|az not installed|Azure CLI is NOT installed" | ForEach-Object { "$($_.Filename):$($_.LineNumber): $($_.Line.Trim())" }
```

Expected: only historical references inside correction notes. **Any live instruction to create a
`GHCR_PAT` is now wrong** — packages are public — and must be fixed.

- [ ] **Step 8: Run the full verification set**

```powershell
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm typecheck; Write-Output "typecheck: $LASTEXITCODE"
pnpm lint; Write-Output "lint: $LASTEXITCODE"
pnpm test; Write-Output "test: $LASTEXITCODE"
pnpm infra:lint; Write-Output "infra:lint: $LASTEXITCODE"
$env:AUTH_DEV_BYPASS = "false"; pnpm --filter @irp/web build; Write-Output "build: $LASTEXITCODE"; Remove-Item Env:\AUTH_DEV_BYPASS
```

Expected: all exit 0.

- [ ] **Step 9: Commit**

```bash
git add handoff.md CLAUDE.md docs/manual-setup-steps.md docs/adr/0009-hosting-topology.md
git commit -m "docs: reconcile the docs with Plan 4B, correcting three false premises

manual-setup-steps.md 1.1a and 1.2 were not stale but WRONG, and two of the
three errors were load-bearing for a design decision:

- bistecglobal.com and bisteccare.lk are the SAME tenant, d5e769b0. Both are
  verified domains on it. The docs treated them as two directories and built the
  dedicated-Entra-directory decision on that premise. A single-tenant app
  registration there would let real mentors and students sign in.
- Graph reads work; four consecutive calls succeeded. Recorded as working but
  not proven reliable, since the original failures were described as
  inconsistent within a session.
- The Azure CLI is installed and authenticated, not absent.

Entra therefore stays deferred as a GOVERNANCE call about BISTEC's live
corporate directory, not a technical blocker — which is a materially different
reason than the one previously recorded, and the distinction is why this
correction matters.

1.5 is closed: packages are public. That fires ADR-0009's own revisit trigger,
recorded there with the conclusion 'no change' — D1's negative consequence is
retired rather than mitigated, and the ACR alternative is moot because no
registry credential exists at all.

CLAUDE.md gains the infrastructure facts worth not rediscovering, including that
az bicep lint needs no credentials while what-if does, and that a WRONG firewall
allowlist is the dangerous case because the apply and /health both still succeed.

handoff.md states plainly that 4B shipped apply-ready and Deliverable 3 is NOT
complete until the runbook's bootstrap is done, so nobody reports D3 as done on
the strength of the files existing."
```

---

## Definition of done for the plan

- `pnpm typecheck`, `pnpm lint` (zero warnings), `pnpm test`, `pnpm infra:lint`, and
  `AUTH_DEV_BYPASS=false pnpm --filter @irp/web build` all clean
- The Playwright suite still passes (5 specs)
- CI green on all jobs: `verify` x3, `images`, `infra`, `real-token` skipped
- The Bicep gate has been **demonstrated red** and the diagnostic recorded
- `docs/deploy-runbook.md` is complete apart from its four labelled `[ ] MEASURE` values
- **Every claim about what has been tested is true.** Nothing asserts a working deployment, a
  measured NFR, or a tested rollback

## Self-review against the spec

| Spec section | Task |
|---|---|
| §4 resource graph | 2 (Log Analytics, App Insights, environment), 3 (Postgres), 4 (api), 5 (web), 6 (Job) |
| §5 firewall / egress risk | 1 (investigation), 3 (parameterised rules), 9 (runbook §3) |
| §6 deploy identity | 9 (runbook §1.3) |
| §7 pipeline | 8 |
| §8 observability | 4 (`secretRef`), 9 (runbook §4) |
| §9 third sign-in state | 7 |
| §10 gates | 2 (gate + demonstrated red) |
| §11 rollback | 9 (runbook §5) |
| §13 runbook contents | 9 |
| §14 doc reconciliation | 10 |
| §15 definition of done | Definition of done above |

**Consistency checks performed:** `databaseUrl` is defined in Task 3 and consumed in Tasks 4 and 6
under that exact name; `containerAppsEnvironment`, `appInsights`, `logAnalytics`, `postgres`,
`apiApp` and `webApp` are used consistently; `imageTag` and `containerRegistryBase` are declared in
Task 4 and reused in Tasks 5, 6 and 8; the image names `irp-api` / `irp-web` / `irp-migrate` match
between Tasks 4–6 and Task 8's push steps and the runbook's §1.5; `SignInPanel`'s three props match
between the tests in Task 7 Step 1 and the implementation in Step 3.
