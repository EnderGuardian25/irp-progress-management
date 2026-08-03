# Onboarding — IRP Progress Management System

Everything needed to get this repo running from a completely fresh machine,
plus what you'll see once it's seeded, so you can demo it. This file will be
updated as the setup changes — treat it as living, not a one-time snapshot.

Written for **PowerShell on Windows** (the primary dev environment for this
project). Commands are otherwise plain and translate to bash/zsh with minor
syntax changes (`$env:VAR = "x"` → `export VAR=x`).

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24.x | |
| pnpm | 11.17.0 | via corepack, not a global install |
| Docker Desktop | any recent | for local Postgres |
| Git | any recent | |

```powershell
node -v
corepack enable
corepack use pnpm@11.17.0
docker version --format '{{.Server.Version}}'
```

The Azure CLI, Bicep, and an Entra tenant are **not** needed to run this
locally — the app has a dev auth bypass (ADR-0012) that lets it run, test,
and demo with zero Azure/Entra setup. Those are only for deploying to Azure.

---

## 2. Clone and install

```powershell
git clone <repo-url> irp-progress-management
Set-Location irp-progress-management
pnpm install
```

## 3. Generate the git-ignored packages

`packages/types` and `packages/client` are generated from `spec/openapi.yaml`
and are git-ignored — they don't exist in a fresh clone. Typecheck and build
fail without this step:

```powershell
pnpm generate
pnpm --filter @irp/client build
```

(`pnpm generate` alone leaves `packages/client/dist` stale — the extra build
step above is required, not optional; `next build` is the only thing that
actually catches a missing dist.)

## 4. Env files

Copy the examples and fill them in:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env.local
```

**`apps/api/.env`** — edit these two lines so the API validates the dev
bypass's tokens instead of expecting real Entra ID tokens:

```
JWKS_URI=http://localhost:3000/api/dev-jwks
JWT_ISSUER=http://localhost:3000/api/dev-jwks
```

Leave `DATABASE_URL` as the example's `127.0.0.1:5433` value (see §5 for why
5433, not 5432).

**`apps/web/.env.local`** — generate a real secret and leave Entra empty:

```powershell
# Anything 32+ random bytes works; openssl if you have it, otherwise:
$env:AUTH_SECRET = -join ((48..57)+(97..122) | Get-Random -Count 32 | % {[char]$_})
```

Paste that into `AUTH_SECRET=` in `.env.local`. Keep `AUTH_DEV_BYPASS=true`.
Leave all three `AUTH_MICROSOFT_ENTRA_ID_*` variables **empty** — a
placeholder value there breaks the dev bypass too (see the comment in the
file itself).

## 5. Start Postgres and migrate

```powershell
$env:IRP_DB_PORT = "5433"
docker compose -f apps/api/docker-compose.yml up -d
$env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
pnpm --filter @irp/api exec prisma migrate deploy
pnpm --filter @irp/api exec prisma generate
```

Why 5433 and not the default 5432: it's the repo-wide convention because
5432 is often already taken by some other local Postgres/container. Use
5433 everywhere on every machine so the connection string never has to
change. **CI still uses 5432** — don't "fix" the workflow to match.

Why `$env:DATABASE_URL` even though it's already in `apps/api/.env`: the
Prisma CLI does not read `.env` files (Prisma 7 dropped that; only `tsx
--env-file` in `pnpm dev` reads it). Set it in the shell for any direct
`prisma` command.

Why `127.0.0.1` and not `localhost`: on Windows, `localhost` can resolve to
`::1` (IPv6), and the Postgres container only publishes the IPv4 address.
`127.0.0.1` avoids a `P1001: Can't reach database server` that looks like a
broken database and isn't.

## 6. Seed demo data

```powershell
pnpm --filter @irp/api run db:seed
```

Idempotent — safe to re-run any time. **Re-run it after running the API's
own test suite** (`pnpm --filter @irp/api test`), because those tests
`TRUNCATE` the tables the seed populates.

## 7. Run the app

Two separate terminals (both are long-running dev servers):

```powershell
Set-Location apps/api; pnpm dev
```
```powershell
Set-Location apps/web; pnpm dev
```

Open **`http://localhost:3000`** — not `127.0.0.1`. Next.js canonicalises
loopback hostnames to the literal string `localhost`; hitting `127.0.0.1` in
the browser breaks HMR (page renders via SSR but never hydrates, so nothing
is clickable) and breaks the Auth.js sign-in redirect.

---

## 8. Signing in and what you'll see (demo data)

On `/signin` you'll see a **dev identity picker** (only present because
`AUTH_DEV_BYPASS=true` — it's replaced by a real Microsoft sign-in button
once Entra is wired up). Three choices:

| Picker option | Signs in as | Role |
|---|---|---|
| **Mentor (Admin)** | `dev-admin-1`, "Dev Mentor" | mentor — sees everything below |
| **Student** | `dev-student-1`, "Dev Student" | student — sees only their own data |
| **Unregistered user** | `dev-unknown-1` | has no User row; deliberately produces a 403 → `/not-registered`, proving the authorization boundary |

**Sign in as Mentor to see the full demo** — the student view only ever
shows one persona (Dev Student, fully compliant), so the interesting
variety (late, missed, absent, archived, etc.) is only visible from the
mentor's Roster / Review / Students / Cycles screens, which read every
batch's students, not just the signed-in identity.

### Seeded batches

| Batch | Started | Notes |
|---|---|---|
| **Batch Aurora** | 2 cycles before today | Older batch, further into its lifecycle |
| **Batch Basalt** | at the start of the current cycle | Newer batch, just getting going |

### Seeded students (10 total, plus 2 mentors)

All history is generated **relative to today's date** — the seed computes
every persona's late/missed/absent days backwards from "now", so re-seeding
on a different day shifts the exact dates but preserves each persona's
character. Nothing here is a fixed calendar date.

| Name | Batch | Persona (`kind`) | What it demonstrates |
|---|---|---|---|
| Dev Student | A | `compliant` | Every required day submitted on time — the clean baseline. Also the only student reachable via the student-side dev picker |
| Nuwan Perera | A | `late` | Roughly 1 in 3 submissions land inside the grace window, flagged Late |
| Sachini Silva | A | `missed` | Roughly 1 in 4 required days has no entry and no absence — flagged Missed |
| Kavindu Jayasuriya | A | `absent` | Roughly 1 in 5 required days is a recorded Absence with a reason |
| Tharindu Weerasinghe | A | `archived` | Stopped submitting 3 weeks after joining, then archived (soft-deleted) — proves archived students disappear from active Roster/Cycles views (FR-5) |
| Ishara Gunawardena | B | `compliant` | Clean baseline in the newer batch |
| Dilini Rathnayake | B | `weekend` | Submits an Extra entry every Saturday — shows the Roster's "+N extra" badge; weekends never count as required/missed |
| Ramesh Kumar | B | `joiner` | Enrolled a few days after Batch Basalt's cycle started — a mid-cycle joiner (FR-27) |
| Amaya Wickramasinghe | B | `transfer` | Started in Batch Aurora, transferred to Batch Basalt when it opened — cross-batch enrolment history |
| Chamodi Herath | B | `mixed` | A blend of on-time, late, missed, and absent days — the most "realistic" single persona; also the one used to demo the Roster → Review → Submitted → In Review → Evaluated → locked walk, and the archive/restore flow |

Older daily reports are pre-advanced through the review lifecycle so you
don't have to manually walk every day forward:
- Reports older than ~14 days: **Evaluated**
- Reports 7–14 days old: **In Review**
- Reports newer than 7 days: **Submitted** (untouched, for you to review live)

### Suggested demo flow

1. Sign in as **Mentor**.
2. **Roster** — see both batches, the per-student status for today, Dilini's
   "+N extra" weekend badge, and that Tharindu (archived) does not appear.
3. **Review** → pick Chamodi Herath (or any recent Submitted report) → walk
   it Submitted → In Review → Evaluated, then note it locks.
4. **Students** directory → show the archive flow, and that it's reversible
   (restore, FR-5).
5. **Today** dashboard → per-batch "N of M submitted" figures and the cycle
   ribbon.
6. **Cycles** view → every active Aurora/Basalt student, confirm no score is
   shown (scoring/evaluation is blocked on open point O-5 — AI provider not
   yet chosen).
7. Sign out, sign back in as **Student** → `/my-month` → own pills only, no
   rank, no peer names, no score (FR-29/FR-30).
8. Sign in as **Unregistered user** → confirm the 403 → `/not-registered`.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `P1001: Can't reach database server` despite a healthy container | `localhost` resolved to `::1` | Use `127.0.0.1` in every connection string |
| `PrismaConfigEnvError` on `migrate`/`generate` | Prisma CLI doesn't read `.env` | `$env:DATABASE_URL = "..."` in the current shell first |
| Page renders but nothing is clickable | Browser pointed at `127.0.0.1:3000` | Use `http://localhost:3000` |
| Sign-in redirect lands on the wrong origin / cookie missing | Same cause as above | Use `localhost`, not `127.0.0.1`, in the browser |
| `docker compose up` port conflict on 5432 | Another local Postgres/container already holds it | This repo standardizes on 5433 — make sure `$env:IRP_DB_PORT = "5433"` is set before `up` |
| `next build` succeeds locally with `AUTH_DEV_BYPASS=true` | The production guard is broken — should never happen | Investigate immediately, don't ignore |
| `pnpm --filter @irp/web build` fails locally | `.env.local` sets `AUTH_DEV_BYPASS=true`, and `next build` forces `NODE_ENV=production` | This is the guard working as intended. Run with `AUTH_DEV_BYPASS=false` explicitly for a local production build |
| Demo data missing/wrong after running tests | `apps/api`'s test suite truncates the seeded tables | Re-run `pnpm --filter @irp/api run db:seed` |
| A database/API command run through an AI coding agent's sandboxed shell fails to connect even though the container is healthy | Some sandboxed shells can't open TCP connections to localhost ports | Run database/dev-server commands in a real terminal, not a network-sandboxed one |

---

## 10. What this setup deliberately does not need

- No Azure account, Azure CLI, or Bicep — those are deploy-only.
- No Entra ID tenant or app registration — the dev bypass mints its own
  tokens; `apps/api` still validates them for real, it just trusts a
  different (local) issuer.
- No manually-inserted database rows — `pnpm --filter @irp/api run db:seed`
  is the only supported way to get demo data, and it's the same seed CI and
  the Playwright suite use.

**The dev bypass must never be used in production** — it throws at startup
if `AUTH_DEV_BYPASS=true` and `NODE_ENV=production` are set together, by
design. Don't work around that guard.
