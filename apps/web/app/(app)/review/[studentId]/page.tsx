import { redirect } from "next/navigation";
import { listStudentDays, listUsers } from "@irp/client";
import { civilDate, isWeekday } from "@irp/core";
import { getCurrentUserOrRedirect, apiClient } from "@/lib/api-client";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCivilDateLabel } from "../../format-civil-date";
import { TransitionControl } from "./transition-control";
import { DayRecordForm } from "./day-record-form";

const ENTRY_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * One student x one cycle, day-by-day (FR-18/FR-19/FR-20). Admin-only,
 * matching roster/page.tsx's gate.
 *
 * Next 16 makes dynamic-route params a Promise -- `params` must be awaited
 * before `.studentId` is readable.
 */
export default async function StudentReviewPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await getCurrentUserOrRedirect();
  if (user.role !== "Admin") redirect("/");

  const { studentId } = await params;
  const client = await apiClient();

  // No per-id user-lookup endpoint exists -- GET /api/v1/users is the only
  // read this SDK offers for a display name, and the roster is capped at a
  // v1 handful of students, so fetching the whole Student list and finding
  // by id here is cheap and doesn't warrant a new endpoint.
  const [{ data: students, error: usersError }, { data: days, error: daysError }] = await Promise.all([
    listUsers({ client, query: { role: "Student" } }),
    listStudentDays({ client, path: { id: studentId } }),
  ]);

  // Task 13's listBatches lesson: destructuring only `data` off an SDK call
  // makes a 4xx/5xx (data undefined, error defined) indistinguishable from
  // "genuinely nothing to show". An unknown studentId 404s here rather than
  // crashing -- rendered the same Panel treatment as every other SDK error
  // on this page.
  if (daysError !== undefined) {
    return (
      <div>
        <PageTitle>Review</PageTitle>
        <Panel>
          <p role="alert" style={{ color: "var(--st-missed)" }}>
            {daysError.detail ?? daysError.title}
          </p>
        </Panel>
      </div>
    );
  }

  const student = students?.find((s) => s.id === studentId);
  const displayName = student?.displayName ?? studentId;

  return (
    <div>
      <PageTitle>Review — {displayName}</PageTitle>

      {usersError !== undefined && (
        <Panel>
          <p role="alert" style={{ color: "var(--st-missed)" }}>
            {usersError.detail ?? usersError.title}
          </p>
        </Panel>
      )}

      {(days === undefined || days.length === 0) && (
        <Panel>
          <EmptyState title="No days on record for this cycle yet." />
        </Panel>
      )}

      {days !== undefined && days.length > 0 && (
        <div className="flex flex-col gap-4">
          {/*
            R5: newest first. listStudentDays returns oldest-first (its own
            doc comment says so), so this is the one place that ordering is
            reversed for display -- everywhere else (student-today.tsx's
            targetDates) is already newest-first at the source.
          */}
          {[...days].reverse().map((day) => {
            const weekday = isWeekday(civilDate(day.date));
            // FR-20: an Evaluated day is locked -- no transition buttons, no
            // record form. A weekend never carries a record at all (the API
            // 400s -- "there is nothing to attend").
            const showForm = weekday && day.reportStatus !== "Evaluated";

            return (
              <Panel key={day.date}>
                <div className="mb-3 flex items-center justify-between">
                  <SectionLabel>{formatCivilDateLabel(day.date)}</SectionLabel>
                  {day.status !== "none" && (
                    <StatusPill status={day.status} reportStatus={day.reportStatus} />
                  )}
                </div>

                {day.entries.length === 0 && day.absenceReason === null && (
                  <p style={{ color: "var(--ink-muted)" }}>No entry recorded.</p>
                )}

                {day.entries.map((entry) => (
                  <div key={entry.id} className="mb-3 flex items-start justify-between gap-3">
                    <p style={{ color: "var(--ink)" }}>{entry.body}</p>
                    <div
                      className="flex shrink-0 items-center gap-2 text-sm"
                      style={{ color: "var(--ink-muted)" }}
                    >
                      <span>{ENTRY_TIME_FORMAT.format(new Date(entry.submittedAt))}</span>
                      <StatusPill status={entry.isLate ? "late" : entry.isExtra ? "extra" : "onTime"} />
                    </div>
                  </div>
                ))}

                {day.absenceReason !== null && (
                  <p style={{ color: "var(--ink-muted)" }}>Absent — {day.absenceReason}</p>
                )}

                {day.reportStatus === "Submitted" && day.reportId !== null && (
                  <TransitionControl
                    studentId={studentId}
                    reportId={day.reportId}
                    reportStatus="Submitted"
                  />
                )}
                {day.reportStatus === "InReview" && day.reportId !== null && (
                  <TransitionControl
                    studentId={studentId}
                    reportId={day.reportId}
                    reportStatus="InReview"
                  />
                )}

                {showForm && <DayRecordForm studentId={studentId} date={day.date} />}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
