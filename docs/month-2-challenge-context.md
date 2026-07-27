# Month 2 Challenge Context — Internal Project Sprint

Running reference document for the Bistec Hearts Academy — Industry Readiness Programme (IRP), **Foundation Track, Month 2**.

> **How a month is structured.** Each month of the IRP has three kinds of material:
> 1. **Four weekly videos** — short (12–14 min) slide videos, one per week, watched before the session.
> 2. **One SESSION** — the 4-hour facilitated session (agenda, workshops, key concepts, facilitator notes).
> 3. **One CHALLENGE** — the graded deliverables the team submits for the month.
>
> Month 2 = Weeks 5–8 videos + the *Internal Project Sprint* session + challenge.
> Month 1 = Weeks 1–4 videos + the *Spec-Driven Foundations* session + challenge (see `month-1-challenge-context.md`).

**Phase:** Internal Sprint · **Month:** 2 · **Challenge version:** 1.0 · **Last updated (source):** April 2026

> **Theme of the month:** move from solo spec-first work to a **team** BMAD cycle on a real assigned Bistec internal project — stakeholder interview → collaborative PRD/architecture → OpenAPI 3.0 design → multi-agent implementation → staging deploy → Demo Day #2. Teams of 2–3, individual + team grades.

---

## Part A — Weekly Videos (Weeks 5–8)

Video index page: `.../external-intership-program/weekly-videos/`

---

### Week 5 — Running a Stakeholder Interview

**Source:** https://process.bistecglobal.com/academy/external-intership-program/weekly-videos/week-05-stakeholder-interviews/
**Phase:** Internal Sprint · Month: 2 · Duration target: 12 min · Slides: 13

#### What the video does
Teaches the interview technique Bistec teams use to turn vague requests into specs. Trainee leaves able to run a 30-minute interview that produces a written problem statement, success criteria, and an out-of-scope list.

#### Core concepts
- **Open with context** — "walk me through the last time this came up"
- **Five whys** — pushing past the surface request to the actual driver
- **Success criteria in the stakeholder's words** — how they'll know it's done
- **Out-of-scope check** — what this should *not* do, asked explicitly
- **Decision owner** — who signs off, named on the transcript

#### Slide outline

| # | Slide | One-liner |
|---|-------|-----------|
| 01 | Title | Week 5 — Running a Stakeholder Interview |
| 02 | Month 2 overview | Team sprint, real Bistec project, 4 weeks |
| 03 | Why interviews matter | PMO horror story: a feature shipped against a misread |
| 04 | Opening the interview | Context before questions |
| 05 | The five whys ladder | Annotated example from a Bistec triage ticket |
| 06 | Capturing success | "Done" in their words, numeric where possible |
| 07 | The out-of-scope question | Why you always ask it last |
| 08 | Decision owner vs requestor | Who signs off ≠ who asked |
| 09 | Transcript format | Verbatim quotes with timestamps |
| 10 | From transcript to PRD | One-hour turnaround template |
| 11 | Common pitfalls | Leading questions, assumed solutions, silent nod |
| 12 | This week's deliverable | Interview record + draft PRD |
| 13 | Closing | Preview Week 6 (collaborative PRD) |

#### Deliverable tie-in
Feeds directly into Month 2 CHALLENGE Deliverable 1 (Interview + PRD). The verbatim transcript format shown in this video is the format graders expect.

#### Required viewing before session
- Bistec Interview Playbook — chapter "Opening and Closing"
- Sample anonymised Bistec interview recording (15 min)

---

### Week 6 — Collaborative PRD & Architecture

**Source:** https://process.bistecglobal.com/academy/external-intership-program/weekly-videos/week-06-collaborative-prd-architecture/
**Phase:** Internal Sprint · Month: 2 · Duration target: 13 min · Slides: 14

#### What the video does
Shows how a 2–3 person team co-authors a PRD and architecture doc without stepping on each other. Covers role split (spec lead, impl lead, review lead), conflict resolution, and how the Bistec Azure/Hetzner default shapes early decisions.

#### Core concepts
- **Role split in a small team** — spec lead, impl lead, review lead
- **Concurrent editing patterns** — section ownership, not line-by-line
- **Architecture doc essentials** — component diagram, data flow, ADRs
- **Bistec cloud defaults** — Azure Container Apps + Hetzner Postgres when hybrid
- **When the team disagrees** — ADR drafts, tiebreakers, tech lead escalation

#### Slide outline

| # | Slide | One-liner |
|---|-------|-----------|
| 01 | Title | Week 6 — Collaborative PRD & Architecture |
| 02 | Recap | Interviews from Week 5 |
| 03 | Three roles, not three workers | Spec / Impl / Review lead |
| 04 | Section ownership | Who writes what, who reviews what |
| 05 | Decision rights | RACI in one slide |
| 06 | The PRD team-edit rhythm | Draft → async comments → sync review |
| 07 | Architecture doc skeleton | Components, data flow, sequences |
| 08 | Bistec cloud defaults | Azure first, Hetzner when cost-justified |
| 09 | Writing an ADR as a team | Two rejected alternatives, at least |
| 10 | When disagreement stalls the team | Three moves |
| 11 | Escalation etiquette | When to pull in tech lead |
| 12 | What a "good enough" Day-3 draft looks like | Ship, don't polish |
| 13 | This week's deliverable | PRD + architecture + ADRs committed |
| 14 | Closing | Preview Week 7 (OpenAPI) |

#### Deliverable tie-in
Supports Month 2 CHALLENGE Deliverable 1. The "team contract" table at the end of the PRD template is written during this week; assignments cascade through weeks 7–8.

#### Required viewing before session
- Bistec cloud topology doc (Azure + Hetzner)
- "How we co-author at Bistec" — programme lead short (10 min)

---

### Week 7 — OpenAPI 3.0 Spec-First

**Source:** https://process.bistecglobal.com/academy/external-intership-program/weekly-videos/week-07-openapi-spec-first/
**Phase:** Internal Sprint · Month: 2 · Duration target: 14 min · Slides: 15

#### What the video does
Takes the architecture doc and turns it into a lint-clean OpenAPI 3.0 spec that drives both server and client code. Trainee leaves knowing the exact spec structure graders look for plus the Bistec house rules.

#### Core concepts
- **OpenAPI structure** — paths, components, parameters, responses, examples
- **Error contracts** — consistent 4xx/5xx shapes, RFC 7807 Problem Details
- **Schema strictness** — no `additionalProperties: true` on requests
- **Type generation** — single source of truth for client and server
- **Lint-clean with redocly CLI** — zero warnings, not just zero errors

#### Slide outline

| # | Slide | One-liner |
|---|-------|-----------|
| 01 | Title | Week 7 — OpenAPI 3.0 Spec-First |
| 02 | Recap | Architecture doc from Week 6 |
| 03 | Why spec-first for APIs | Types, contracts, tests, mocks, docs — one source |
| 04 | OpenAPI file anatomy | info, paths, components, security |
| 05 | Path and parameter patterns | Path vs query, description requirement |
| 06 | Schemas and examples | Every schema has an example |
| 07 | Response modelling | Success + 4xx + 5xx defined upfront |
| 08 | Problem Details (RFC 7807) | Error body shape Bistec uses |
| 09 | Strict request bodies | `additionalProperties: false` by default |
| 10 | Generating types | openapi-typescript, @hey-api/openapi-ts |
| 11 | Wiring Fastify handlers | Typed route from generated paths |
| 12 | Wiring the Next.js client | openapi-fetch with the generated schema |
| 13 | Linting with redocly CLI | Zero warnings target |
| 14 | This week's deliverable | Lint-clean spec + generated clients merged |
| 15 | Closing | Preview Week 8 (team sprint + reviews) |

#### Deliverable tie-in
Central to Month 2 CHALLENGE Deliverable 2 (OpenAPI 3.0 + generated types). The CI pipeline demonstrated in this video is the one graders expect to see on main.

#### Required viewing before session
- OpenAPI 3.0 intro — https://learning.openapis.org/
- Redocly CLI quickstart — https://redocly.com/docs/cli
- Bistec API design checklist (internal)

---

### Week 8 — Team Sprint & Code Review

**Source:** https://process.bistecglobal.com/academy/external-intership-program/weekly-videos/week-08-team-sprint-code-review/
**Phase:** Internal Sprint · Month: 2 · Duration target: 14 min · Slides: 15

#### What the video does
Final week of the internal sprint. Covers the mechanics of running a sprint where 2–3 trainees each drive a Claude Code session, coordinate through daily standups, and exchange PR reviews. Closes with Demo Day #2.

#### Core concepts
- **Multi-agent team orchestration** — one agent per story, context handoffs
- **Daily standup hygiene** — 60 seconds per person, blockers first
- **PR review craft** — Bistec rubric: architecture, correctness, tests, ergonomics, ops
- **Merge gates** — what blocks, what's a nit
- **Staging verification** — the 10-minute checklist before Demo Day

#### Slide outline

| # | Slide | One-liner |
|---|-------|-----------|
| 01 | Title | Week 8 — Team Sprint & Reviews |
| 02 | Where we are | Specs, architecture, spec, now implementation |
| 03 | Multi-agent team pattern | One agent per story, not per person |
| 04 | Context handoff artefact | Spec excerpt + AC + file list |
| 05 | The shared glossary | Pinned file every agent reads |
| 06 | Standup in 60 seconds | Blockers → asks → done-since-last |
| 07 | Async unblock threads | When standups are not enough |
| 08 | PR review rubric | Five layers, two severities |
| 09 | Writing a review that lands | Quote + rationale + suggestion |
| 10 | Taking a review well | Acknowledge, revise, thank |
| 11 | Merge gates vs nits | Bistec convention |
| 12 | Pre-Demo Day verification | 10-minute checklist |
| 13 | Demo Day #2 format | Stakeholder demo, architect critique |
| 14 | This week's deliverable | Shipped project to staging + retro notes |
| 15 | Closing | Preview Month 3 (LLM integration) |

#### Deliverable tie-in
Closes Month 2 CHALLENGE Deliverables 3 and 4 (staging deploy + retro/load report). The 10-minute verification checklist shown here is the same one the retro uses to prove readiness.

#### Required viewing before session
- Bistec PR Review Checklist v2
- k6 load test quickstart — https://grafana.com/docs/k6
- Sample cross-team retro (internal recording)

---

## Part B — Session (Internal Project Sprint)

**Source:** https://process.bistecglobal.com/academy/external-intership-program/training-plan/foundation-track/month-2-internal-project-sprint/SESSION/
**Duration:** 4 hours · **Track:** Industry Readiness Program — Foundation Track
**Focus:** Team BMAD cycle, stakeholder interviews, OpenAPI 3.0, agile sprint execution, multi-agent orchestration
**Session materials version:** 1.0 · Last updated: April 2026

### Learning Objectives
By the end of this session, participants will be able to:
- Run a stakeholder interview that yields a written problem statement and success criteria
- Collaboratively author a BMAD PRD and architecture doc in a team of 2–3
- Design a REST API using OpenAPI 3.0 with schemas, error contracts, and examples
- Orchestrate Claude Code across a team via story ownership and context handoffs
- Review peer pull requests using Bistec's PR checklist and leave actionable comments

### Session Agenda

**Hour 1 — Stakeholder Interview & Team Formation (60 min)**

| Time | Activity | Description |
|------|----------|-------------|
| 0:00–0:15 | Introduction | Sprint goals, team assignments (2–3), project assignments |
| 0:15–0:35 | Lecture | Interview techniques — open questions, five-whys, capturing "done looks like" |
| 0:35–0:50 | Case Study | Replay of a real Bistec interview transcript — what got missed and why |
| 0:50–1:00 | Q&A | How to push back on vague requests |

**Hour 2 — Collaborative Spec & API Design (60 min)**

| Time | Activity | Description |
|------|----------|-------------|
| 1:00–1:20 | Lecture | Multi-author PRD patterns. OpenAPI 3.0 essentials — schemas, parameters, errors |
| 1:20–1:40 | Workshop | Each team drafts PRD outline + OpenAPI skeleton for their assigned project |
| 1:40–1:55 | Discussion | Azure/Hetzner defaults — when to pick which |
| 1:55–2:00 | Break | |

**Hour 3 — Sprint Simulation (60 min)**

| Time | Activity | Description |
|------|----------|-------------|
| 2:00–2:10 | Setup | Team boards created, roles assigned (spec lead, impl lead, review lead) |
| 2:10–2:50 | Challenge | Run a compressed spec→story→scaffold cycle with multi-agent handoff |
| 2:50–3:00 | Checkpoint | Standup round-robin — 60s each on blockers and next task |

**Hour 4 — Review & Retrospective (60 min)**

| Time | Activity | Description |
|------|----------|-------------|
| 3:00–3:20 | PR Review Lab | Cross-team PR reviews using Bistec checklist |
| 3:20–3:45 | Presentations | Each team: interview insights, API design, staging deploy |
| 3:45–4:00 | Retro | Start/stop/continue, assign sprint tasks for next week |

### Key Concepts

**Stakeholder Interview Framework**
- Open with context — "Walk me through the last time this came up"
- Five Whys — push past the surface request
- Success criteria — "How will we know we're done?"
- Out-of-scope check — "What should this NOT do?"
- Decision owner — "Who signs off?"

**BMAD for Teams**

| Role | Primary Artefact | Secondary Duty |
|------|------------------|----------------|
| Spec Lead | PRD + stories | Owns stakeholder channel |
| Impl Lead | Architecture + scaffold | Orchestrates Claude Code sessions |
| Review Lead | ADRs + PR reviews | Ensures merge criteria |

**OpenAPI 3.0 House Rules**
- Every endpoint has 200, 400, 401, 500 responses defined
- Every schema has example values
- Every parameter has a description
- No `additionalProperties: true` on request bodies — validate strictly
- Generate client + server types from the spec — single source of truth

**Multi-Agent Orchestration Basics**
- One agent per story — context stays focused
- Handoff artefact — spec excerpt + acceptance criteria + file list
- Shared glossary — pinned file the whole team references
- Review before merge — human gate, always

### Pre-Session Requirements

**Technical Setup**
- Month 1 deliverables submitted and reviewed
- Access to the assigned Bistec internal project repo
- OpenAPI Generator CLI or Stainless SDK installed
- Team communication channel created
- Staging deploy target provisioned (Azure Container Apps or Hetzner)

**Pre-Reading**
- Bistec Internal Project Brief for your assigned team
- "Design-first APIs" — OpenAPI Initiative intro
- "Stakeholder Interview Playbook" — internal handbook chapter
- Bistec PR Review Checklist (v2)

### Resources
- **Required reading:** Bistec PMO interview template; OpenAPI 3.0 spec (paths, components, responses sections); Azure Container Apps quickstart; Bistec observability defaults (Application Insights)
- **Tools:** OpenAPI Generator (https://openapi-generator.tech); Stoplight Studio (https://stoplight.io/studio); Prisma (https://www.prisma.io/docs); Azure Container Apps CLI (`az containerapp`)
- **Reference:** Bistec internal project catalogue (read-only); sample retrospective templates; ADR library (search by tag)

### Assessment Preview
Participants are evaluated on: Stakeholder interview notes + derived PRD (25%) · OpenAPI 3.0 spec with complete schemas and examples (25%) · Shipped sprint increment deployed to staging (25%) · PR reviews given + retrospective contribution (25%).

### Facilitator Notes — Common Pitfalls
- Teams start coding before interviews are transcribed — enforce the spec gate
- One team member hogs Claude Code context — rotate story ownership hourly
- OpenAPI specs missing error responses — force 4xx/5xx definitions before merge
- Retrospective becomes a blame session — redirect to systems, not people

### Discussion Prompts
- "What changed between your PRD draft and the stakeholder's actual need?"
- "Where did multi-agent orchestration speed you up, and where did it add overhead?"
- "If Bistec rejected your API design at review, what would you fix first?"

---

## Part C — Challenge (Internal Project Sprint)

**Source:** https://process.bistecglobal.com/academy/external-intership-program/training-plan/foundation-track/month-2-internal-project-sprint/CHALLENGE/
**Time allocation:** 3 hours (during session) + 4 weeks offline sprint · **Difficulty:** Intermediate
**Challenge version:** 1.0 · Last updated: April 2026

Form a team of 2–3, take an assigned real Bistec internal need, and complete the full BMAD cycle: stakeholder interview → spec → architecture → OpenAPI design → multi-agent implementation → staging deploy → demo. Individual + team grades.

### Business Requirements

**Functional Requirements**
- Tool solves the documented stakeholder need (captured in interview transcript)
- REST API designed spec-first with OpenAPI 3.0, types generated for client and server
- Frontend consumes the typed client — no hand-written fetch logic
- Staging deploy reachable from a public URL behind Bistec auth
- GitHub Actions runs lint, typecheck, tests, and deploy to staging on merge to main

**Non-Functional Requirements**
- API p95 latency under 250ms under 50 RPS synthetic load
- OpenAPI spec validates with `@redocly/cli lint` — zero errors
- 100% of endpoints documented with examples and error responses
- Deploy pipeline completes under 8 minutes
- Azure App Insights captures traces for every request

**Technical Constraints**
- **Stack:** Next.js 15 (frontend), Fastify + TypeScript (API), PostgreSQL 16, Prisma
- **Deploy:** Azure Container Apps (preferred) or Hetzner (if PMO approves)
- **Auth:** Azure AD SSO via Bistec training tenant
- No manual deploys — everything through GitHub Actions
- Infrastructure as code: Bicep or Terraform, committed alongside app code

### Deliverables

| # | Deliverable | File | Points |
|---|-------------|------|--------|
| 1 | Stakeholder Interview + PRD | `{team-name}-month2-interview-and-prd.md` | 25 |
| 2 | OpenAPI 3.0 Design + Generated Types | Repository (`spec/openapi.yaml` + generated packages) | 25 |
| 3 | Staging Deploy + Observability Hookup | `{team-name}-month2-deploy-runbook.md` | 25 |
| 4 | Sprint Retrospective + Load Test Report | `{team-name}-month2-retro-and-load.md` | 25 |

**Passing score:** 75%

#### Deliverable 1 — Stakeholder Interview + PRD (25 pts)
Required sections: **1. Interview Record** (stakeholder name/role; date, duration, attendees; verbatim key quotes with timestamps; five-whys chain; success criteria in the stakeholder's words) · **2. Problem Statement** (derived problem, cost of inaction, success metric) · **3. PRD** (persona, goals, non-goals; FR-1..FR-n; NFRs with numeric targets; out-of-scope list) · **4. Team Contract** (role assignments, decision rights, communication cadence).

Evaluation criteria:
- Interview record contains verbatim quotes, not summaries (5 pts)
- Five-whys chain reaches a root cause, not a feature request (5 pts)
- Success metric is numeric and measurable (5 pts)
- Non-goals are specific (at least 3) (5 pts)
- Team contract names a decision owner per role (5 pts)

#### Deliverable 2 — OpenAPI 3.0 Design + Generated Types (25 pts)

Repository structure:

```
project/
├── spec/
│   └── openapi.yaml
├── apps/
│   ├── web/          (Next.js)
│   └── api/          (Fastify)
├── packages/
│   ├── types/        (generated from OpenAPI)
│   └── client/       (generated SDK)
├── infra/
│   └── main.bicep
├── .github/
│   └── workflows/
└── README.md
```

Required artefacts: `spec/openapi.yaml` (hand-written, source of truth) · `packages/types/` (openapi-typescript, CI-generated) · `packages/client/` (Stainless or openapi-fetch, CI-generated) · `apps/api/src/routes/` (scaffolded from spec, handlers attach to typed definitions).

Minimum functionality: spec lints clean with `@redocly/cli lint` · types regenerate on every CI run · frontend imports only from `@packages/client` · API rejects malformed requests with structured errors · every endpoint has happy-path and error-path examples.

Evaluation criteria:
- Spec has complete schemas for all resources (5 pts)
- Every endpoint documents 4xx errors (5 pts)
- Generated types consumed by both apps (5 pts)
- No hand-written fetch logic in the frontend (5 pts)
- Lint clean with zero warnings (5 pts)

#### Deliverable 3 — Staging Deploy + Observability Hookup (25 pts)
Runbook required content: **Infrastructure** (Bicep/Terraform modules, resource names, parameter files) · **Pipeline** (GitHub Actions workflow diagram, required secrets and their source) · **Auth** (Azure AD app registration, redirect URIs, role assignments) · **Observability** (App Insights workspace, traced routes, custom metrics) · **Rollback** (exact commands to roll back to previous revision).

Code requirements: Bicep or Terraform in `infra/` — no manual portal clicks · one GitHub Actions workflow for deploy — no shell scripts checked in · App Insights distributed tracing enabled via `@opentelemetry/api`.

Evaluation criteria:
- Infrastructure as code, no portal drift (5 pts)
- Deploy completes under 8 minutes (5 pts)
- Traces visible in App Insights within 60s of a request (5 pts)
- Rollback command tested and documented (5 pts)
- Staging URL reachable behind Azure AD auth (5 pts)

#### Deliverable 4 — Sprint Retrospective + Load Test Report (25 pts)

Required tests:

| Scenario | Tool | Target | Pass Criteria |
|----------|------|--------|---------------|
| Cold start | k6 | Sustained 50 RPS | p95 < 250ms |
| Burst | k6 | 200 RPS for 30s | no 5xx |
| Auth-gated | k6 | 10 RPS for 5 min | zero token failures |
| Idle memory | App Insights | 30 min watch | no memory drift > 50MB |

Report format: **Sprint Retrospective** (start/stop/continue, min 3 each; team velocity vs estimate; multi-agent coordination wins and failures) · **Results Summary** table (p95 @ 50 RPS, burst error rate, token failures, memory drift — target vs achieved) · **Bottlenecks** (slowest endpoint, why, fix plan) · **Follow-ups** (offline tasks for next sprint with owners).

Evaluation criteria:
- Retro is honest and specific (names incidents, not vibes) (5 pts)
- Load test script is reproducible and committed (5 pts)
- Bottleneck analysis cites traces / logs (5 pts)
- Follow-ups have owners and dates (5 pts)
- All four scenarios pass their criteria (5 pts)

### Submission Guidelines

File naming convention:
```
{team-name}-month2-interview-and-prd.md
{team-name}-month2-deploy-runbook.md
{team-name}-month2-retro-and-load.md
{team-name}-month2-{project}/  (zipped repository)
```

Submission checklist: Interview + PRD complete · OpenAPI spec + generated types merged to main · staging URL shared with programme lead · deploy runbook reviewed by a senior engineer · load report with passing scenarios · retrospective held with notes committed.

### Scoring Guide

| Grade | Score | Description |
|-------|-------|-------------|
| Exceptional | 90–100 | Stakeholder-ready tool, exemplary API design, observable under load |
| Proficient | 75–89 | Works end-to-end on staging, minor polish needed |
| Developing | 60–74 | Builds and deploys, gaps in spec or observability |
| Beginning | < 60 | Incomplete pipeline or broken staging |

### Hints and Tips

Generating types from OpenAPI:
```bash
pnpm dlx openapi-typescript spec/openapi.yaml -o packages/types/src/schema.ts
pnpm dlx @hey-api/openapi-ts -i spec/openapi.yaml -o packages/client/src --client fetch
```

Fastify route from typed spec:
```ts
import type { paths } from "@bistec/types";
type ListTickets = paths["/tickets"]["get"];

app.get<{ Reply: ListTickets["responses"]["200"]["content"]["application/json"] }>(
  "/tickets",
  async () => ({ items: await db.ticket.findMany() })
);
```

k6 smoke script:
```js
import http from "k6/http";
import { check } from "k6";
export const options = { vus: 50, duration: "1m" };
export default function () {
  const res = http.get(`${__ENV.BASE_URL}/tickets`);
  check(res, {
    "status is 200": (r) => r.status === 200,
    "p95 under 250ms": (r) => r.timings.duration < 250,
  });
}
```

App Insights bootstrap:
```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { AzureMonitorTraceExporter } from "@azure/monitor-opentelemetry-exporter";

new NodeSDK({
  traceExporter: new AzureMonitorTraceExporter({
    connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  }),
}).start();
```

### Offline Milestones (Before Month 3)
- [ ] Fix every P1/P2 issue from the stakeholder demo
- [ ] Add Dependabot + weekly security patch rotation
- [ ] Write a postmortem for your worst sprint day
- [ ] Convert one endpoint to use a typed SDK method only
- [ ] Add a Grafana/App Insights dashboard pinned in the repo README
- [ ] Pair-review two other teams' OpenAPI specs
