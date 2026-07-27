# Manual Setup Steps — things only you can do

Everything in this file requires a human: an account, a card, a consent click, or a decision
that is not mine to make. Everything *not* in this file is automated or will be.

Ordered by **when it blocks something**, not by difficulty. The first section is the one that
matters — start it now, because it gates two whole plans and takes real elapsed time.

---

## 1. Blocks Plan 3 and Plan 4 — start today

### 1.1 Create an Azure free account

Roughly 15 minutes, but identity verification can take longer.

1. Go to <https://azure.microsoft.com/free>
2. Sign up. **A payment card is required for identity verification even though nothing is charged** — the free grant covers this project entirely.
3. Confirm you land on a subscription named something like *Azure subscription 1*.

What the free account gives this project:

| Resource | Free allowance | Enough? |
|---|---|---|
| Container Apps | Recurring monthly grant | Yes, for two small apps |
| PostgreSQL Flexible Server B1ms | 750 h/month for 12 months, 32 GB storage | Yes — 750 h is continuous |
| Application Insights | Free ingestion tier | Yes at this traffic |
| Entra ID | Free tier | Yes |

Plus $200 credit for 30 days as headroom if load testing needs a bigger tier briefly.

> **Why your own account and not Bistec's.** Bistec tenant access was never provisioned, and
> 50 of the 75 remaining graded points sit behind having something deployed. This unblocks
> today. Ask the mentor for Bistec tenant access anyway — see §3 — but nothing waits on it.

### 1.2 Install the Azure CLI

Not currently installed. Needed for the Entra bootstrap and for deploys.

```powershell
winget install Microsoft.AzureCLI
```

Then, in a terminal, run `az login` yourself — it opens a browser and I cannot do it for you.
In this session you can run it inline by typing `! az login`.

### 1.3 Grant admin consent for the Entra app registrations

The app registrations themselves are created by a committed bootstrap script, not by hand.
But **granting admin consent requires a human click in the portal** — that is a deliberate
Microsoft safeguard and cannot be scripted away.

I will tell you exactly which app and which permissions when Plan 3 reaches that point.

### 1.4 Add GitHub Actions secrets

Repository → Settings → Secrets and variables → Actions. I will give you the exact values
when Plan 4 generates them; the names will be:

- `AZURE_CREDENTIALS` — service principal JSON for the deploy workflow
- `AZURE_SUBSCRIPTION_ID`
- `POSTGRES_ADMIN_PASSWORD`
- `APPLICATIONINSIGHTS_CONNECTION_STRING`

**Never paste any of these into the chat.** Put them straight into GitHub. If one is ever
exposed, rotate it rather than hoping.

---

## 2. Blocks Plan 11 (load testing)

### 2.1 Install k6

```powershell
winget install k6.k6
```

Not needed until the load-test plan, but it is a one-line install and easy to forget.

---

## 3. Mentor escalations — send as one batched Teams message

Your team contract (PRD §4.4) says ambiguities go to the mentor batched, with a one-working-day
response window. Six items are outstanding. **Three of them changed requirements and need
sign-off; three are older and block later work.**

### Needs sign-off — I have already built on a stated assumption

| # | Question | What I assumed | What it affects |
|---|---|---|---|
| **O-11** | Weekends now count as optional **Extra** work — weekdays required, weekends never missed, never late, never in a compliance denominator. Extra feeds the AI summary as positive context but carries no automatic score bonus. Confirm? | As described | Already in the date engine, `CLAUDE.md`, the PRD and ADR-0003. **Changes FR-12 and adds FR-33, which §4.2 reserves to you as decision owner** |
| **O-10** | FR-13 grants a late entry "one further day"; FR-15 permits targeting "the immediately preceding weekday". **These conflict on Monday** — under FR-13 Friday's grace closes Saturday night, under FR-15 Friday is still Monday's preceding weekday. Which is right? | FR-15 reading: grace runs to the end of the next *weekday*, so Friday stays open until Monday 23:59:59 | The date engine. Marked `// ASSUMPTION: O-10` in code |
| **O-12** | The brief pins Next.js 15; current release is 16. Approve 16? | Next.js 16, per ADR-0004 | Nothing yet. Must resolve **before Plan 3**. Reversal is free until then |

### Older, still blocking

| # | Question | Blocks |
|---|---|---|
| **O-5** | Which AI provider, and is student data leaving the tenant approved? Submissions are personal data. Needs escalation to Hearts Academy / leadership, not just the mentor | **Plan 9 entirely** (FR-22 – FR-27) |
| **O-6** | The exact wording of the five rubric criteria. Weights are confirmed at 20/25/25/10/20 | The evaluation schema and the evaluation screen |
| **O-9** | Demo Day #2 date | Scheduling only |

Also worth asking, since it costs nothing: **can Bistec grant training-tenant access?** If yes,
FR-1 becomes fully satisfied by an issuer swap. If no, we stay on a personal Entra tenant and
note it.

---

## 4. One small thing I need from you

**The Bistec brand colour** — a hex value, or even "the blue in the logo". `--primary` is
currently a placeholder indigo.

It is a one-token swap, but any replacement must avoid hue 20–70° (reserved for `missed` and
`late`) and 140–170° (reserved for `ok`), or it will collide with the status vocabulary.

---

## 5. At the very end — submission

From the challenge brief's submission checklist. None of this is code.

- [ ] **Share the staging URL with the programme lead**
- [ ] **Have the deploy runbook reviewed by a senior engineer** — explicitly required, and it is a human review, not a check I can run
- [ ] Rename the four deliverable files to `{team-name}-month2-*` per the naming convention
- [ ] Zip the repository as `{team-name}-month2-irp-progress-management`
- [ ] Hold the retrospective and commit the notes — it must name real incidents, not vibes
- [ ] Fill in O-1: the interview date, duration and stakeholder name, still `_TODO_` in PRD §1.1
- [ ] Copy the final PRD back to the onboarding repo's `weekly-challenges/month-2/` if the submission copy must match

### Deliverable files expected

| # | File | Status |
|---|---|---|
| 1 | `{team}-month2-interview-and-prd.md` | Drafted, needs the O-1 fields |
| 2 | Repository — spec + generated types | Plan 2 |
| 3 | `{team}-month2-deploy-runbook.md` | Plan 4 |
| 4 | `{team}-month2-retro-and-load.md` | Plan 11 |

---

## 6. What you do *not* need to do

Listed so you do not waste time on it:

- **No portal clicks for infrastructure.** Everything except Entra admin consent comes from `infra/main.bicep`.
- **No manual deploys.** GitHub Actions handles it on merge to `main`.
- **No manual app registration.** A committed, re-runnable script creates it; you only consent.
- **No database setup.** Bicep provisions Postgres; migrations run from CI.
- **No local `.env` juggling for CI.** Secrets live in GitHub.
