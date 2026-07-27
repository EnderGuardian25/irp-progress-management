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
| `docs/month-2-challenge-context.md` | Programme constraints: stack, deploy target, deliverables, load-test criteria |

---

## Stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15, TypeScript strict |
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

---

## Repository layout

```
irp-progress-management/
├── spec/
│   └── openapi.yaml          hand-written, source of truth for the API
├── apps/
│   ├── web/                  Next.js 15
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
│   ├── stories/              S-001-*.md, one per story
│   └── adr/                  NNNN-title.md
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

**Weekdays only.** There is no submission slot on Saturday or Sunday, and weekends are never counted as missed days. Any date arithmetic over submissions must skip weekends.

**No deploys outside CI.** No shell scripts checked in, no portal clicks, no `az` commands run by hand for anything that should be Bicep.

**Git discipline** (solo sprint — see the team contract in `docs/interview-and-prd.md` §4.3):
- No direct commits to `main`. One branch and one PR per story.
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
| **Daily report** | All of a student's entries for one weekday, rolled up. The reviewable unit. |
| **States** | `Submitted → In Review → Evaluated`. There is **no Rejected state** — do not add one. |
| **Late** | An entry for the immediately preceding weekday, submitted inside the one-day grace window. Flagged, still accepted. |
| **Absent** | A weekday a student explicitly marked as absent with a reason. Distinct from a missed submission. |
| **Missed** | A weekday with no entry and no absence record, past the grace window. Final. |
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
