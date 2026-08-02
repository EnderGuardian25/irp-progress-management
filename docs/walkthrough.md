# Demo walkthrough

**What this is:** a persona-by-persona script for demonstrating the system — what to click, and
exactly what you should see. It doubles as the SC-3 legibility check: if a reader who has never
seen the system can follow this and understand what each screen is telling them, SC-3 holds.

**Written from the running app on 2026-08-03**, not from the code. Where the two disagreed, the
screen won — see "What surprised us" at the end, which is the part worth reading twice.

---

## Before you start

```bash
# 1. Postgres
docker compose -f apps/api/docker-compose.yml up -d          # IRP_DB_PORT=5433
export DATABASE_URL='postgresql://irp:irp@127.0.0.1:5433/irp?schema=public'
pnpm --filter @irp/api exec prisma migrate deploy

# 2. Fresh demo data — the API test suites TRUNCATE, so re-seed before every demo
pnpm --filter @irp/api db:seed

# 3. Both servers
pnpm --filter @irp/api dev      # :3001
pnpm --filter @irp/web dev      # :3000, needs AUTH_DEV_BYPASS=true
```

Open **`http://localhost:3000`** — `localhost`, never `127.0.0.1`. Next canonicalises loopback
hostnames, so driving the browser at `127.0.0.1` breaks hydration and the auth callback lands on
an origin without the session cookie. The page will render and the buttons will silently do
nothing. This has cost hours before.

**Every figure below will differ from yours.** The seed computes each persona's history backwards
from the moment you run it, so the dates, counts and percentages move with the calendar. What
should *not* differ is the shape — which persona shows late badges, which shows absences, which
batch is on which cycle.

---

## The cast

Ten students across two batches, plus two mentors. From `packages/fixtures/src/index.ts`, the one
list the seed and the dev sign-in picker both read.

| Name | Batch | What makes them worth showing |
|---|---|---|
| **Dev Student** | Aurora | Fully compliant. The clean case, and the only student you can sign in as. |
| **Nuwan Perera** | Aurora | Habitually late — submits inside the grace window, so he is flagged but still counted. |
| **Sachini Silva** | Aurora | Has genuinely missed weekdays. The only Aurora student whose compliance is below 100%. |
| **Kavindu Jayasuriya** | Aurora | Records absences with reasons. Read his compliance figure carefully — see O-7 below. |
| **Tharindu Weerasinghe** | Aurora | **Archived.** Must not appear on any active roster or cycle list (FR-5). |
| **Ishara Gunawardena** | Basalt | Compliant. |
| **Dilini Rathnayake** | Basalt | Works weekends. Her entries drive the `+N extra` figure and the ribbon's half-width Extra slots (FR-33). |
| **Ramesh Kumar** | Basalt | Joined mid-cycle. His pre-enrolment weekdays read `—`, not `missed` (FR-27). |
| **Amaya Wickramasinghe** | Basalt | Transferred Aurora → Basalt mid-programme (FR-8). |
| **Chamodi Herath** | Basalt | Mixed record — some late, some missed, some absent. |
| **Dev Mentor** · **Priya Fernando** | — | The two mentors. Sign in as Dev Mentor. |

---

## Mentor walkthrough

Sign in as **Mentor (Admin)**.

### 1. Today — the must-ship screen (FR-28, SC-4)

You land here. One block per batch, each with a cycle ribbon and the figures beneath it.

**What to point at:**

- **Batch Aurora reads `Cycle 3`. Batch Basalt reads `Cycle 1`. Both show the same calendar
  dates.** This is the whole of FR-6 and FR-9 in one glance: cycle *boundaries* are fixed calendar
  months (the 10th to the 9th) for everyone, but which cycle is a batch's *first* depends on when
  it was admitted. Aurora started two cycles earlier, so it is on its third. Nobody has to explain
  the rule; the two ribbons say it.
- **The ribbon is one bar per required day.** Weekends are absent by construction — the strip is
  five-a-week and grows a narrow `+` slot only where somebody actually worked a weekend. Look at
  Basalt's ribbon for those slots; Dilini put them there.
- **"N of M submitted", then late / absent / missed.** Every figure carries a word as well as a
  colour, so it reads correctly in greyscale and for a colour-blind viewer.
- **`+4 extra this cycle` on Basalt** is in muted grey, not a status colour. Weekend work is
  recorded and surfaced, but it is not a compliance state and never enters a denominator.

**If you are demoing in the morning, read this first.** See "What surprised us" #1 — the counts
will legitimately read `0 of 4 submitted`, and you need to be able to say why without hesitating.

### 2. Roster

`Roster` in the sidebar. One row per enrolled student for one date, with a batch picker and a date
picker.

- Four Aurora rows, not five — **Tharindu is archived and has left the active roster** (FR-5). His
  history is intact; he simply cannot be worked on.
- Switch to Basalt and look at Dilini's `+N extra` badge.

### 3. Review

`Review`, then pick a student. One student, one cycle, newest day first.

- The forward-only control: `Submitted → In Review → Evaluated`. There is no reject button
  anywhere, by design (FR-18).
- Mark a day `Evaluated` and it **locks** — the student can no longer submit or change an absence
  for it (FR-20). The lock is visible, not silent.
- The mentor's own attendance/tasks record sits alongside the student's entries and is independent
  of them: a mentor can record attendance for a day the student never submitted (FR-19).

### 4. Cycles

`Cycles`. Batch picker, cycle picker, one row per student.

- Aurora offers **Cycle 1, 2 and 3**; Basalt offers only Cycle 1. The picker only ever offers
  cycles that have actually started.
- **Sachini is the one Aurora student below 100%** — she has genuinely missed days.
- **Nuwan shows 5 late and still reads 100%.** Late work is late, not absent: it is flagged, and it
  counts.
- **Kavindu shows 4 absences and also reads 100%.** This is the open question O-7 made visible —
  see "What surprised us" #2. It is the single most useful thing on this screen to ask the mentor
  about.
- The **Evaluation** column reads *Awaiting evaluation* for everyone, and will until Plan 9. That
  is a designed state, not a loading failure.

### 5. Students

`Students`. Register a mentor or a student, create a batch, transfer a student, archive one.

- Registering a student takes a batch and a start date in the same step — there is no orphan state
  where a student exists but belongs nowhere.
- The archive view lists archived students read-only. Archiving revokes access without deleting
  identity or history.

---

## Student walkthrough

Sign out, then sign in as **Student** (Dev Student, Aurora, fully compliant).

### 6. Today

- The composer offers **only legal target dates** — today and the previous weekday. There is no
  date field to type a wrong date into; the rule is enforced by construction in the interface as
  well as at the API (FR-15).
- Submit an update. It appears immediately, flagged `On time`.
- The absence toggle sits alongside, with a reason field. Absence is *recorded*, never *requested* —
  there is no approval workflow anywhere (a confirmed non-goal).
- Try a day the mentor has marked `Evaluated`: it is locked and the composer will not offer it.

### 7. My month (FR-29, FR-30)

`My month` in the sidebar.

- **"Month 3 of 6"** — the programme clock, which runs from the student's *first* enrolment. A
  transfer does not reset it.
- The same ribbon, but showing this student's own marks rather than the batch's.
- The counts line, then **"Strengths and areas to develop"**, which reads *"No evaluation yet —
  your first summary appears after your cycle closes."* Designed copy. Every student sees it in
  this release.
- The day history, newest first, with each day's review state visible: `On time`, `On time · In
  review`, `On time · Evaluated (locked)`.

**Now say what is not here.** No score. No rank. No leaderboard. No other student's name, anywhere
on this surface. That is FR-30, and it is enforced at the API, not just hidden in the UI — the
endpoint this page calls takes no student identifier at all, so there is no parameter to tamper
with.

### 8. The negative checks — worth doing live

| Do this | You should see |
|---|---|
| As the student, look at the sidebar | Two items only: `Today`, `My month`. No mentor destination is offered. |
| As the student, type `/cycles` into the address bar | Redirected home. Not a 403 page — the API is the security boundary, this is just the wrong screen. |
| Sign in as **Unregistered user** | The terminal 403 page. Not a redirect loop. |
| Sign in as the archived persona | Treated as unregistered. Archival revokes access; it does not delete history. |

---

## What is deliberately absent

Say this plainly during the demo. An audience reads an intentional empty state as a defect unless
told otherwise.

| Not here | Why |
|---|---|
| Any AI summary or score | **O-5 is unresolved.** Student submissions are personal data, and no provider has been approved to process them. No AI call is wired at all — the evaluation schema exists, the calls do not. Plan 9. |
| Notifications on submission or state change | Plan 8. No stub, no fake outbox — nothing in this demo pretends to send anything. |
| Monthly winner and the downloadable PDF | Plan 10. |
| Load-test numbers | Plan 11. Nothing in this slice claims an NFR figure. |

Every empty state you see — the awaiting-evaluation column, the strengths-and-weaknesses panel — is
designed copy that shipped deliberately, not an unfinished screen.

---

## What surprised us

Four things found by running this walkthrough rather than reading the code. They are the reason the
walkthrough is written from the screen.

### 1. A morning demo shows `0 of N submitted`, and that is correct

The seed **never writes an instant later than the moment it runs**. Compliant personas submit at
around 17:00 Colombo, so if you seed and demo at 9am, today's entries do not exist yet: mentor
Today legitimately reads `0 of 4 submitted`, with zero late, zero absent and zero missed.

Nothing is broken. Those students are `pending` — the grace window is still open, and a day only
becomes `missed` once it closes. But `0 of 4` above an empty-looking ribbon is a poor opening
slide.

**Mitigation for a morning demo:** open on **Cycles** instead of Today, where the full month's
history is visible regardless of the hour, and come back to Today afterwards. Or seed the evening
before.

### 2. Kavindu has four absences and reads 100% compliance

This is not a bug — it is **assumption O-7 made visible on screen**, and it is the most important
thing on the Cycles page to raise with the mentor.

Compliance is `(on time + late + absent) / settled days`. Absence is *accounted for*: it was
recorded with a reason, and the PRD's stated assumption is that it carries no automatic penalty.
So a student can be absent four times and still show 100%.

If the mentor expects absence to reduce the figure, O-7 needs to be answered and one line changes
(`countCycle` in `apps/api/src/services/dashboard-service.ts`, marked `// ASSUMPTION: O-7`).
**Ask.** Do not let this ship unexamined just because it is documented.

### 3. "My month" opens with a run of empty future days

The day history covers the whole current cycle and is ordered newest-first, so on 3 August the
first six rows are 4–9 August: real rows, correctly showing `—`, and entirely empty. A student has
to scroll past a week of nothing to reach their own work.

Correct, but not good. Worth a decision before the demo: clip the list at today, or keep the full
cycle so the shape of the month is visible.

### 4. The two batches make FR-6/FR-9 self-explanatory

The best thing on the mentor dashboard was not planned as a feature: Aurora reading `Cycle 3` and
Basalt `Cycle 1` **over identical calendar dates** explains the cycle model faster than any
sentence. Lead with it.

---

## Known rough edges

Carried honestly rather than quietly fixed.

- **Weekend Extra is not batch-clipped.** A weekend entry made while a student was transferred away
  counts toward both batches' `extra` tallies when their cycle windows overlap. It never reaches a
  compliance denominator, so no score is affected, but it does reach the mentor's screen. Documented
  at the site in `countCycle`; pre-existing and systemic (the roster's own Extra count has the same
  shape), so it should be fixed in both places at once or not at all.
- **The day history has no heading or list semantics**, so a screen-reader user cannot navigate it
  by heading. Consistent with the other pages, but this is the primary content of My month.
- **"Month N of 6" is the quietest text on its own page** — it renders only as the ribbon's caption
  in muted 12px, despite being the figure FR-29 names explicitly.
