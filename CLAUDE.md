# CLAUDE.md — IRP Progress Management System

Guidance for Claude Code working in this repository. These rules override default behaviour.

---

## What this is

A progress-tracking and evaluation system for the Bistec Hearts Academy **Industry Readiness Programme (IRP)**. Students submit a short text update each working day; mentors review, record attendance, and evaluate monthly against a fixed rubric with AI-produced scoring. Built as the Month 2 Internal Project Sprint deliverable of the IRP itself.

**Source of truth for requirements:** `docs/interview-and-prd.md`. Every functional requirement is numbered `FR-n` and every non-functional one `NFR-n` — reference those IDs in commits, PRs, stories, and ADRs. If a change maps to no FR, it does not belong in this repo.

**Supporting docs**
| File | What it's for |
|---|---|
| `docs/interview-and-prd.md` | Requirements, personas, non-goals, NFR targets, team contract, open points |
| `docs/stakeholder-interview.md` | Raw stakeholder answers — the primary record; consult when a requirement's intent is unclear |
| `docs/IRP_Progress_Management_System_Brief.pdf` | Original brief (v1.0 draft) |
| `docs/month-2-challenge-context.md` | Programme constraints: stack, deploy target, deliverables, load-test criteria. **A source record — do not edit it.** It is the evidence any deviation is measured against |
| `docs/design-system.md` | Visual system, verified colour tokens, typography, motion, copy voice, a11y floor |
| `docs/adr/` | Architecture decisions. Read before proposing an alternative that one already rejected |
| `docs/superpowers/specs/` and `plans/` | Per-slice design specs and their task-by-task implementation plans |
| `handoff.md` §2a | **The build order.** The Phase 1–7 list in §2b is traceability only, superseded as sequence |

---

## Stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| Frontend | Next.js **16**, TypeScript strict — see [ADR-0004](docs/adr/0004-nextjs-16-over-pinned-15.md); the brief pins 15, **mentor sign-off pending (O-12)** |
| API | Fastify + TypeScript |
| Database | PostgreSQL 16 via Prisma |
| Auth | Azure AD SSO, Bistec training tenant |
| Deploy | Azure Container Apps |
| IaC | Bicep, committed in `infra/` |
| CI/CD | GitHub Actions only |
| Observability | Azure Application Insights via `@opentelemetry/api` |
| Load testing | k6 |
| Package manager | pnpm workspaces |

The stack is a programme constraint, not a preference. Swapping any row needs an ADR **and** stakeholder escalation.

### Pinned versions

Verified against the registry on 2026-07-28. **The rule is *newest version the surrounding ecosystem actually supports*, not *newest version published*** — see [ADR-0005](docs/adr/0005-typescript-6-for-eslint-compatibility.md).

| Tool | Pinned | Newest | Why not newest |
|---|---|---|---|
| Node | 24.x | — | — |
| pnpm | 11.17.0 | — | — |
| TypeScript | **6.0.3** | 7.0.2 | typescript-eslint requires `<6.1.0`, and it *is* ESLint's TypeScript parser — TS 7 means no linting at all. ADR-0005 |
| ESLint | 10.8.0 | — | — |
| typescript-eslint | 8.65.0 | — | — |
| Vitest | 4.1.10 | — | — |
| Next.js | 16.2.12 | — | Brief pins 15; ADR-0004, sign-off pending (O-12) |
| Fastify | 5.10.0 | — | — |
| Prisma | 7.9.1 | — | — |

Before bumping anything, check the peer ranges of what depends on it. The TypeScript 7 case is the worked example of why.

---

## Repository layout

```
irp-progress-management/
├── spec/
│   └── openapi.yaml          hand-written, source of truth for the API
├── apps/
│   ├── web/                  Next.js 16
│   └── api/                  Fastify
├── packages/
│   ├── types/                GENERATED from openapi.yaml — never hand-edit
│   └── client/               GENERATED SDK — never hand-edit
├── infra/
│   └── main.bicep
├── tests/
│   └── load/                 k6 scripts
├── docs/
│   ├── interview-and-prd.md
│   ├── stakeholder-interview.md
│   ├── month-2-challenge-context.md
│   ├── design-system.md      visual system, tokens, copy voice
│   ├── adr/                  NNNN-title.md
│   └── superpowers/
│       ├── specs/            YYYY-MM-DD-<topic>-design.md
│       └── plans/            YYYY-MM-DD-<feature>.md
├── .github/workflows/
├── CLAUDE.md
└── handoff.md
```

---

## House rules

**Spec-first, always.** `spec/openapi.yaml` is hand-written and changes *before* any handler. Types and the client SDK are generated from it in CI. Never hand-edit `packages/types/` or `packages/client/` — if the shape is wrong, fix the spec and regenerate.

**API contract rules** (these are graded, and they are also just correct):
- Every endpoint defines `200`, `400`, `401`, and `500` responses. No exceptions.
- Every schema carries example values; every parameter carries a description.
- Request bodies are `additionalProperties: false`. Validate strictly, reject loudly.
- Errors use RFC 7807 Problem Details as the response body shape.
- `pnpm dlx @redocly/cli lint spec/openapi.yaml` must pass with **zero warnings**, not just zero errors.

**No hand-written fetch in the frontend.** `apps/web` imports only from `packages/client`. A raw `fetch()` to our own API is a bug.

**Time handling.** Store every timestamp in UTC. Evaluate every deadline, late flag, and cycle boundary in **Asia/Colombo (UTC+05:30)**. Never rely on the server's local timezone — the deploy region is not Sri Lanka. Cycles run the 10th → the 9th of the following month.

**Weekdays are required; weekends are optional extra work.** A weekday with no entry and no absence, past the grace window, is **Missed**. A weekend day can hold entries and they count as **Extra** — but a weekend is *never* missed, *never* late, and never appears in a compliance denominator. Any date arithmetic over *required* days must skip weekends; arithmetic over *recorded activity* must not.

**No deploys outside CI.** No shell scripts checked in, no portal clicks, no `az` commands run by hand for anything that should be Bicep.

**How work is executed.** Every slice runs the same loop: `brainstorming` → a spec in
`docs/superpowers/specs/` → `writing-plans` → a plan in `docs/superpowers/plans/` →
`subagent-driven-development` to execute it, one fresh subagent per task with an independent
reviewer after each. **One plan, one branch, one PR, merged before the next plan starts.**

When a subagent finds a defect in the plan's own code, fix the plan at source and commit that
correction alongside the code fix. A plan that has silently diverged from the codebase is
worse than no plan.

**Git discipline** (solo sprint — see the team contract in `docs/interview-and-prd.md` §4.3):
- No direct commits to `main`. One branch and one PR per plan.
- PR description names the FR(s) it implements.
- Conventional commits.
- Any decision with a plausible rejected alternative gets an ADR first, naming at least two rejected alternatives.

---

## Domain glossary

Read this before writing schema or naming anything.

| Term | Meaning |
|---|---|
| **Batch** | A cohort of students with its own start and end dates. Two run concurrently; calendars are independent. |
| **Cycle** | A monthly evaluation window, 10th → 9th, anchored to the batch's admission date, in Asia/Colombo. The unit of scoring. |
| **Entry** | One text submission by a student. Multiple entries per day are allowed. |
| **Daily report** | All of a student's entries for one date, rolled up. The reviewable unit. |
| **States** | `Submitted → In Review → Evaluated`. There is **no Rejected state** — do not add one. |
| **Required day** | A weekday. Carries a submission obligation and counts in compliance denominators. |
| **Optional day** | A Saturday or Sunday. May hold entries, carries no obligation, never counts in a denominator. |
| **Late** | An entry for a required day, submitted after that day ended but inside the grace window. Flagged, still accepted. Optional days are never late. |
| **Absent** | A **weekday** a student explicitly marked as absent with a reason. Distinct from a missed submission. Absence does not apply to weekends — there is nothing to be absent from. |
| **Missed** | A **weekday** with no entry and no absence record, past the grace window. Final. A weekend is never missed. |
| **Extra** | An entry on a Saturday or Sunday. Recorded, surfaced to the mentor, and fed to the AI summary as positive context. Never required, never penalised by its absence. |
| **Rubric** | Five fixed criteria, weights **20 / 25 / 25 / 10 / 20**. Not configurable at runtime — no admin UI for weights. |
| **Performance index** | The AI-produced weighted score for a cycle. The score of record; a mentor may override it. |
| **Override** | A mentor-set score that supersedes the AI's. Stores the new score, the original AI score, and the mentor's reason. |
| **Admin** | A mentor. Every mentor is an Admin; there is no super-admin tier. Admins share access across all batches in v1. |

---

## Hard boundaries — do not build these

Confirmed non-goals. If a task seems to require one of these, stop and re-read `docs/interview-and-prd.md` §3.3.

- File or attachment uploads — submissions are **text only**
- Task assignment or project management — the system records work, never assigns it
- Leave-request or approval workflow — absence is recorded, not requested
- Mobile app or responsive mobile layout — desktop only, min 1280px
- Configurable rubric weights
- Any student-visible score, rank, or leaderboard; any student-to-student visibility or messaging
- Cross-batch comparison or analytics
- Data migration or import — the system starts empty
- Admin date-correction / back-dating — wrong-date submission is prevented by construction instead
- A reject-and-resubmit review flow
- Editing the AI summary text
- Payroll, stipend, or HR integration

Deferred to v2: quarterly evaluation, automated emailing of the monthly report.

---

## NFR targets to build against

| Target | Value |
|---|---|
| API p95 | < 250 ms at 50 RPS sustained |
| Burst | 200 RPS for 30 s, zero 5xx |
| Auth-gated | 10 RPS for 5 min, zero token failures |
| Memory drift | < 50 MB over 30 min idle |
| Deploy pipeline | under 8 minutes |
| Trace visibility | in App Insights within 60 s of a request |
| OpenAPI lint | zero errors, zero warnings |

---

## Open points — ask, don't assume

Listed in full as `O-1`..`O-9` in `docs/interview-and-prd.md` §5. The ones that block code:

- **O-2** — whether the monthly report PDF is emailed in v1 or download-only. Currently assumed **download-only**.
- **O-3** — winner tie-break rule. Currently assumed: weighted score → submission compliance → earliest average submission time.
- **O-5** — AI provider is undecided, and student submissions are personal data. Needs an ADR and leadership escalation **before** any AI call is implemented. Do not wire a third-party model API without it.
- **O-6** — exact wording of the five rubric criteria, needed before the schema hardens.
- **O-7** — whether absence and lateness carry an automatic score penalty. Currently assumed **no** — context for the AI summary only.

When work depends on one of these, implement behind the stated assumption, mark it `// ASSUMPTION: O-n` in code, and log it. Do not silently pick a different answer.
