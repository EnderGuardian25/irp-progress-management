# Stakeholder Interview — Question Plan

**Project:** IRP Progress Management System
**Source brief:** `IRP_Progress_Management_System_Brief.pdf` (v1.0 Draft)
**Purpose:** Reduce ambiguity before the team commits to a PRD. Answers feed directly into the PRD for the IRP Progress Management System.

---

## 1. Opening — Context First

1. Walk me through the last time you tried to evaluate a student's monthly progress. What did you actually do, step by step?
- Attendance is logged after each meeting. Speaking up at meetings and giving prior notification of events are also taken into account.
2. How do you track daily student activity today (spreadsheets, notes, memory, Teams messages)? Can we see an example?
- Notes and an Excel sheet, which are reviewed by seniors.
4. How much time per day/week do you currently spend on tracking and evaluation?
- 2 to 2.5 hours a day per group of 5 students.

## 2. Five-Whys Ladder (planned probes)

Start from the surface request — *"a system where students log progress and I review it"* — and push to the root driver:

1. Why do you need a system for this rather than continuing with the current approach?
- Continuous integration of the tracking process and better time management.
2. Why does that matter — what goes wrong when progress isn't visible in one place?
- Management would question the evaluations.
3. Why is fairness/transparency the concern — has an evaluation been disputed or a deserving student missed?
- Nothing has been questioned so far with the current approach — the root driver is the time cost and keeping progress visible in one place so management can trust the evaluations.

## 3. Success Criteria — In Their Words

1. Six months from now, how will you know this system worked? What would you show someone as proof?
- If seniors can understand the reports at a glance and hand the data over to newer people.
2. Can you give that as a number? (e.g. "evaluation report ready in X minutes instead of Y hours", "zero disputed reward decisions", "10/10 students submitting daily")
- 10/10 students submitting daily, with late submissions tracked. Evaluation time reduced from 2.5 hours a day to about 20 minutes.
4. What's the single most important screen or output? If we could only ship one thing this sprint, what must it be?
- The performance summary dashboard and the daily student submission count.
5. Who else looks at these reports (management, HR, sponsors)? What do *they* need from them?
- The Hearts Academy team; a summary report goes to the leadership team.

## 4. Clarifying the Brief

### 4.1 Roles & Access

1. Is there exactly **one admin/mentor** today? Could there be multiple mentors — e.g. one per batch — and if so, can Mentor A see or edit Batch B?
- Shared access for v1.
2. Who creates the admin account? Is there a "super admin" above the mentor?
- All mentors have admin accounts, and any admin can register other mentors and students when needed. No separate super admin.
3. When a student is **removed** from the program, what happens to their historical data — kept, hidden, or deleted?
- Kept but hidden, for future analysis.
4. The challenge constraints require **Azure AD SSO (Bistec training tenant)** — do all 10 students already have Bistec accounts? How is "admitting a student" expected to work (invite email, pre-created account)?
- All students will already have Bistec accounts.

### 4.2 Batches & Program Structure

5. The brief says "grow to many batches" — realistically how many batches and students in the next 12 months? (This sets our load/scale targets.)
- Two batches at any given time.
6. Do batches have start/end dates? Do the two current batches run on the same calendar?
- Each batch has its own start and end dates.
7. The student dashboard example says *"Month 2 of 6 completed"* — is the program always 6 months? Is that per batch or fixed?
- Always 6 months for v1.
8. Can a student ever move between batches?
- Students can move between batches, but their total time in the program stays 6 months.

### 4.3 Student Daily Update

9. What counts as a "day" — working days only, or weekends too? Any submission deadline (e.g. must be in by midnight)?
- Weekdays only; submissions must be in before midnight.
10. Can a student **backfill** a missed day, or edit yesterday's entry? For how long?
- Submissions are allowed up to 1 extra day; after that they are marked late.
11. One entry per day, or multiple entries throughout the day?
- Multiple entries during the day.
12. "Work submitted" — is this text, a link (GitHub/Teams), or actual **file uploads**? If files: what types and sizes?
- Text submissions only.
13. What happens on a day a student has nothing to report (leave, sick day)? Should the system track absence explicitly?
- Absence is tracked explicitly.

### 4.4 Review & Approval Workflow

14. Can the admin **reject** an item (not just approve), and can the student then fix and resubmit? What states does an entry go through?
- No reject step — entries go from "in review" to "evaluated".
15. Can the admin approve an item but tick "does NOT count" — and should the student see *why* it didn't count?
- No.
16. Approval granularity — per item (each meeting, each task) or per daily report as a whole?
- The mentor tracks attendance and tasks themselves; the student can also include them in their daily report.
17. Once approved, is an entry locked for the student? Can the admin change an approval decision later?
- Approval decisions won't change later — the evaluation stage covers any adjustments.
18. Notifications — is **in-app** enough, or do you expect email/Teams messages? How fast do students need to know?
- Teams and email notifications.


### 4.5 AI Summary & Evaluation

19. When should the AI summary be generated — automatically on submission, or on demand when you open a student?
- AI summary is generated at the end of each month, as a performance index against the rubric.
20. Is the AI's rubric evaluation **advisory** (you confirm/override it) or does it directly set the score?
- It sets the score completely; the mentor can override it if they disagree.
21. Can you edit the AI summary before it goes into a report?
- No editing — it goes straight into the report.

### 4.6 Scoring & Rubric

23. The rubric table is marked "a starting point" — are the five criteria and weights (20/25/25/10/20) confirmed, or do you want to adjust them now?
- Confirmed as fixed.
24. For criteria sourced from "Both" — how do mentor and student inputs combine? Is there an exact split (e.g. 70/30), or should we propose one?
- No split — the student submits and the mentor evaluates fully.
25. What scale do you score on day-to-day (1–5, 1–10, percentage)?
- Day-to-day scoring is unnecessary.
26. Should the rubric weights be **configurable** by the admin later, or fixed in the system?
- Fixed values in the system.
27. **Open point from the brief:** can students see their own scores? Their rank within the batch? Other students' names on any leaderboard?
- Students see a strengths-and-weaknesses summary (not scores or rank).

### 4.7 Reports & Rewards

28. The monthly cycle is "10th to the 10th" — which side does the 10th itself fall on? Which timezone? When does the *first* cycle start?
- A start date is set once students are admitted — e.g. 10th of August to 9th of September, with the next month starting on the 10th of September. Sri Lankan time zone.
29. If a student joins or leaves mid-cycle, how are they evaluated for that month?
- No evaluation for that month.
30. Is the monthly winner **computed by the system** from scores, or does the system recommend and you decide? Can you override, and how are ties broken?
- Computed by the system.
31. "The PDF must clearly state the reason" — is an AI-generated justification acceptable, or do you write it?
- An AI-generated justification is acceptable.
32. Who receives the PDF and how — download only, or emailed automatically? Any branding/template requirements?
- Downloadable, with an email sent as well.
33. For the quarterly evaluation — same rubric applied over 3 months of data, or different criteria? Which months make up the first quarter?
- Same rubric applied over the 3 months.

### 4.8 Data, Migration & Operations

34. Is there existing tracking data (spreadsheets, notes) that must be **migrated in**, or do we start fresh?
- Start fresh — no migration.
35. Does daily use happen on laptops only, or is **mobile** usage expected (e.g. logging from a phone)?
- Laptops only for v1.
36. How long must data be retained after a batch finishes?
- Kept forever; deletion is manual.
37. Who fixes bad data (e.g. student submitted to the wrong date) — is an admin edit/correction feature needed?
- The system blocks wrong-date submissions in the first place, so no correction feature is needed.

## 5. Out-of-Scope

1. What should this system explicitly **NOT** do?
- No file uploads (text submissions only), no task assignment or project management (it records what was done, it doesn't assign work), and no leave-request workflow (absence is tracked, not requested).
2. Confirmed as out of scope for v1:
   - Task *assignment* / project management — the system only records what was done
   - Leave/absence request workflow — absence is tracked explicitly, nothing more
   - Native mobile app — laptops only for v1
   - Payroll, stipends, or HR integration
   - Cross-batch comparison or analytics
   - Student-to-student visibility or messaging — students only see their own strengths-and-weaknesses summary
   - Configurable rubric weights — weights are fixed in the system
   - Data migration — starting fresh
3. Of everything in the brief, what could wait for a version 2 if the sprint gets tight? What is the absolute must-have core?
- Must-have core: daily student submissions (with late and absence tracking), the mentor review flow, and the performance summary dashboard with daily submission counts. Could wait for v2: quarterly evaluation and emailed report delivery.

## 6. Decision Owner & Sign-off

1. Who is the **decision owner** — who signs off on the PRD and the finished tool?
- The mentor (interviewed stakeholder) signs off on the PRD and the finished tool.
2. If we hit a decision you can't make (e.g. AI provider, data retention), who do we escalate to?
- Escalations go to the Hearts Academy team / leadership team.
3. How do you want to handle follow-up questions during the sprint — channel and expected response time?
- Via Teams.
4. When can we schedule the demo checkpoint / Demo Day #2 with you?
- To be scheduled.
