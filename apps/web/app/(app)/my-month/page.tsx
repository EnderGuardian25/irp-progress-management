import { redirect } from "next/navigation";
import { getMyDashboard, listMyDays } from "@irp/client";
import { getCurrentUserOrRedirect, apiClient } from "@/lib/api-client";
import { CycleRibbon } from "@/components/cycle-ribbon/cycle-ribbon";
import { toStudentRibbonDays } from "@/lib/ribbon";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCivilDateLabel } from "../format-civil-date";

/** Required-day outcomes whose result is final -- FR-29's history list keeps
 * a day for this reason alone even when it carries no entry (e.g. Missed). */
const SETTLED_STATUSES = new Set(["onTime", "late", "absent", "missed"]);

/**
 * FR-29: the student's own month. FR-30 is structural here — this page calls
 * only /me endpoints, which take no student identifier, so there is no
 * parameter through which another student's data could arrive. It renders no
 * score, no rank and no peer.
 *
 * Two calls, deliberately: getMyDashboard gives the ribbon, the counts and
 * the programme position; listMyDays gives the entry bodies for the history
 * list below. The dashboard is an aggregate and does not carry entry text —
 * folding the two into one call would make the mentor's identical aggregate
 * path pay for prose no mentor screen renders.
 *
 * A mentor reaching this route is redirected home: it is not a security
 * boundary (the API is), just the wrong screen for them — a mentor holds no
 * enrolment and would see an empty month.
 */
export default async function MyMonthPage() {
  const user = await getCurrentUserOrRedirect();
  if (user.role !== "Student") redirect("/");

  const client = await apiClient();
  const [{ data: dashboard, error }, { data: dayRows, error: daysError }] = await Promise.all([
    getMyDashboard({ client }),
    listMyDays({ client }),
  ]);

  if (error !== undefined || dashboard === undefined) {
    return (
      <div>
        <PageTitle>My month</PageTitle>
        <Panel>
          <p role="alert" style={{ color: "var(--st-missed)" }}>
            {error?.detail ?? error?.title ?? "Your month could not be loaded."}
          </p>
        </Panel>
      </div>
    );
  }

  const {
    today,
    programmeMonths,
    firstEvaluatedCycleStart,
    cycle,
    days,
    extraAfter,
    summary,
    strengthsAndWeaknesses,
  } = dashboard;

  // Never "Month null of N" — a mid-cycle joiner has no seq until their first
  // evaluated cycle opens (FR-27), and a caller with no enrolment at all has
  // neither a seq nor a firstEvaluatedCycleStart.
  const heading =
    cycle.seq !== null
      ? `Month ${String(cycle.seq)} of ${String(programmeMonths)} · ${formatCivilDateLabel(cycle.startDate)} – ${formatCivilDateLabel(cycle.endDate)}`
      : firstEvaluatedCycleStart !== null
        ? `Your first evaluated month starts ${formatCivilDateLabel(firstEvaluatedCycleStart)}`
        : "You are not enrolled in a batch yet.";

  const complianceLabel =
    summary.complianceRate === null ? "— compliance" : `${String(Math.round(summary.complianceRate * 100))}% compliance`;

  // listMyDays defaults to the whole current cycle -- every calendar date,
  // including weekends and days that haven't arrived yet. Rendering one
  // unfiltered card per date meant the 10th of a month opened this page to
  // roughly 29 empty placeholders (a stray weekday with a "—" pill, or a
  // bare-dated weekend card) stacked above whatever real content existed
  // (Finding 4, Plan 7 whole-branch review). A day earns its card by
  // carrying something real: an entry, a recorded absence, or a settled
  // (final) status -- never merely by existing on the calendar. This is a
  // stricter test than "not future": a weekday still open within its grace
  // window with nothing submitted yet is dropped too, same as a quiet
  // weekend, because there is nothing to show for it either.
  //
  // Corollary: the empty-state branch below (orderedDays.length === 0) was
  // unreachable before this filter -- the array always held one row per
  // calendar date. It is now genuinely reachable for a student at the very
  // start of a cycle, before anything has settled.
  //
  // listMyDays returns oldest first; the history list reads newest first
  // (brief R5) — reverse a copy rather than mutating the response.
  const orderedDays = [...(dayRows ?? [])]
    .filter(
      (day) =>
        day.entries.length > 0 || day.absenceReason !== null || SETTLED_STATUSES.has(day.status),
    )
    .reverse();

  return (
    <div>
      <PageTitle>My month</PageTitle>

      <div className="mb-6">
        <CycleRibbon
          days={toStudentRibbonDays([...days], today)}
          extraAfter={[...extraAfter]}
          label={heading}
        />
      </div>

      <div className="mb-8 flex flex-wrap items-baseline gap-6 text-sm">
        <span className="tabular" style={{ color: "var(--st-ok)" }}>
          {summary.onTime} on time
        </span>
        <span className="tabular" style={{ color: "var(--st-late)" }}>
          {summary.late} late
        </span>
        <span className="tabular" style={{ color: "var(--st-absent)" }}>
          {summary.absent} absent
        </span>
        <span className="tabular" style={{ color: "var(--st-missed)" }}>
          {summary.missed} missed
        </span>
        {summary.extra > 0 && (
          <span className="tabular" style={{ color: "var(--ink-muted)" }}>
            +{summary.extra} extra
          </span>
        )}
        <span className="tabular" style={{ color: "var(--ink)" }}>
          {complianceLabel}
        </span>
      </div>

      <SectionLabel>Strengths and areas to develop</SectionLabel>
      <div className="mt-2 mb-8">
        <Panel>
          {strengthsAndWeaknesses === null ? (
            <EmptyState title="No evaluation yet — your first summary appears after your cycle closes." />
          ) : (
            <p style={{ color: "var(--ink)" }}>{strengthsAndWeaknesses}</p>
          )}
        </Panel>
      </div>

      <SectionLabel>Your days</SectionLabel>
      <div className="mt-2 flex flex-col gap-4">
        {daysError !== undefined ? (
          <Panel>
            <p role="alert" style={{ color: "var(--st-missed)" }}>
              {daysError.detail ?? daysError.title ?? "Your day history could not be loaded."}
            </p>
          </Panel>
        ) : orderedDays.length === 0 ? (
          <Panel>
            <EmptyState
              title="Nothing recorded this cycle yet."
              hint="Your entries appear here as you submit them."
            />
          </Panel>
        ) : (
          orderedDays.map((day) => (
            <Panel key={day.date}>
              <div className="mb-3 flex items-center justify-between">
                <SectionLabel>{formatCivilDateLabel(day.date)}</SectionLabel>
                {day.status !== "none" && (
                  <StatusPill status={day.status} reportStatus={day.reportStatus} />
                )}
              </div>

              {day.absenceReason !== null && (
                <p style={{ color: "var(--ink-muted)" }}>{day.absenceReason}</p>
              )}

              {day.entries.map((entry) => (
                <p key={entry.id} data-testid="day-entry-body" style={{ color: "var(--ink)" }}>
                  {entry.body}
                </p>
              ))}
            </Panel>
          ))
        )}
      </div>
    </div>
  );
}
