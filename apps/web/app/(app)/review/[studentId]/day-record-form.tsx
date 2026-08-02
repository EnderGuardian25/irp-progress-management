"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { saveDayRecord } from "./review-actions";

/**
 * The mentor's own attendance/tasks record for one weekday (FR-19).
 *
 * `listStudentDays`'s DaySummary carries no DayRecord field, so the page has
 * no prior record to pass in and this form always starts unchecked/empty
 * rather than pre-filled -- `upsertDayRecord` fully replaces the stored
 * record on every call (one record per student-day), so that "starts blank"
 * behaviour is surfaced via the hint text below rather than hidden from the
 * mentor.
 *
 * Never rendered for a weekend (the API 400s -- FR-19 "there is nothing to
 * attend") or an Evaluated day (FR-20 locks it) -- both gates live in
 * page.tsx, which decides whether to mount this component at all.
 */
export function DayRecordForm({ studentId, date }: { studentId: string; date: string }) {
  const [state, action, pending] = useActionState(saveDayRecord, null);

  return (
    <form
      action={action}
      className="mt-3 flex flex-col gap-2 border-t pt-3"
      style={{ borderColor: "var(--line)" }}
    >
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="date" value={date} />
      <SectionLabel>Attendance &amp; tasks</SectionLabel>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--ink)" }}>
          <input type="checkbox" name="attended" />
          Attended
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--ink)" }}>
          <input type="checkbox" name="tasksCompleted" />
          Tasks completed
        </label>
      </div>
      <input
        name="note"
        // DayRecordUpsert caps `note` at 500 -- without this the API 400s on
        // a longer note with no client-side signal at all (same reasoning as
        // absence-toggle.tsx's reason field).
        maxLength={500}
        placeholder="Note (optional)"
        aria-label={`Mentor note for ${date}`}
        className="rounded-[var(--radius-control)] border px-3 py-2"
        style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
      />
      <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
        Saved records overwrite on save.
      </p>
      {state !== null && (
        <p role="alert" className="text-sm" style={{ color: "var(--st-missed)" }}>
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" variant="quiet" loading={pending}>
          Save record
        </Button>
      </div>
    </form>
  );
}
