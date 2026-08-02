import { listMyDays, type Role } from "@irp/client";
import { graceDeadlineFor, isWeekday, submissionWindow } from "@irp/core";
import { apiClient } from "@/lib/api-client";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";
import { EntryComposer } from "./entry-composer";
import { AbsenceToggle } from "./absence-toggle";
import { formatCivilDateLabel, formatWeekdayName } from "./format-civil-date";

// §11's deadline copy ("You can still submit for {date} until …") is always
// evaluated in Asia/Colombo, never the deploy region's local zone.
const DEADLINE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const ENTRY_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Colombo",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export async function StudentToday({ displayName, role }: { displayName: string; role: Role }) {
  const client = await apiClient();
  const openWindow = submissionWindow(new Date());
  const oldest = openWindow.targetDates[openWindow.targetDates.length - 1];
  const newest = openWindow.targetDates[0];

  // listMyDays() defaults to the current evaluation cycle. The window's
  // oldest target can fall in the PREVIOUS cycle -- e.g. today is Monday the
  // 10th (a cycle boundary), so the previous weekday is Friday the 7th --
  // and the default range would silently drop that day's entries. An
  // explicit range spanning the whole submission window avoids it.
  //
  // Two full object literals rather than a single one with `query:
  // maybeUndefined` -- exactOptionalPropertyTypes forbids assigning
  // `undefined` to an optional property that isn't itself typed `| undefined`.
  const query = oldest !== undefined && newest !== undefined ? { from: oldest, to: newest } : undefined;
  const { data, error } = await listMyDays(query !== undefined ? { client, query } : { client });

  const byDate = new Map((data ?? []).map((day) => [day.date, day]));
  // submissionWindow() always includes today as the most recent target
  // (index 0, since targetDates is most-recent-first) -- see its own
  // "Today is always submittable" invariant.
  const today = openWindow.targetDates[0];

  return (
    <div>
      <PageTitle>Today</PageTitle>
      {/*
        Playwright's sign-in chain (e2e/signin.spec.ts) asserts
        data-testid="user-name" AND data-testid="user-role" on every role
        after sign-in. The mentor branch of (app)/page.tsx renders its own
        signed-in card carrying both; these are the Student equivalents.
        Visually hidden -- this page's job is the composer, not a repeat of
        what the Topbar already shows.
      */}
      <span className="sr-only" data-testid="user-name">{displayName}</span>
      <span className="sr-only" data-testid="user-role">{role}</span>

      <div className="mb-8">
        <EntryComposer targetDates={openWindow.targetDates} />
      </div>

      {error !== undefined && (
        <p role="alert" className="mb-4 text-sm" style={{ color: "var(--st-missed)" }}>
          Could not load your recent days. Try again shortly.
        </p>
      )}

      <SectionLabel>Recent days</SectionLabel>
      <div className="mt-2 flex flex-col gap-4">
        {openWindow.targetDates.map((date) => {
          const day = byDate.get(date);
          const entries = day?.entries ?? [];
          const absenceReason = day?.absenceReason ?? null;
          const weekday = isWeekday(date);
          const noRecord = entries.length === 0 && absenceReason === null;
          const isToday = date === today;
          // Review correction: the deadline is PER TARGET, not the window-
          // level graceClosesAt -- that value is the OLDEST target's
          // deadline (the one closing soonest) and understates every newer
          // panel's actual window.
          const deadline = graceDeadlineFor(date);

          return (
            <Panel key={date}>
              <div className="mb-3 flex items-center justify-between">
                <SectionLabel>{formatCivilDateLabel(date)}</SectionLabel>
                {day !== undefined && day.status !== "none" && (
                  <StatusPill status={day.status} reportStatus={day.reportStatus} />
                )}
              </div>

              {noRecord && (
                <EmptyState
                  title={isToday ? "No entry for today yet." : `No entry for ${formatWeekdayName(date)} yet.`}
                  hint={`You can still submit for ${formatWeekdayName(date)} until ${DEADLINE_FORMAT.format(deadline)}.`}
                />
              )}

              {entries.map((entry) => (
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

              {weekday && (noRecord || absenceReason !== null) && (
                <AbsenceToggle date={date} absenceReason={absenceReason} />
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
