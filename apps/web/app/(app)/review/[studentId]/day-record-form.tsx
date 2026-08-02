"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { saveDayRecord } from "./review-actions";

export interface DayRecordDefaults {
  attended: boolean;
  tasksCompleted: boolean;
  note: string | null;
}

/**
 * The mentor's own attendance/tasks record for one weekday (FR-19).
 *
 * `upsertDayRecord` fully replaces the stored record on every call (one
 * record per student-day) -- there is no merge. `listStudentDays`'s
 * DaySummary deliberately carries no DayRecord field (students must never
 * receive the mentor's own record), so the page fetches it separately via
 * `listDayRecords` and passes whatever it found for this date as `defaults`.
 * Reopening a recorded day and saving with unprefilled, unchecked boxes
 * would silently wipe attendance back to false/false -- the bug this
 * `defaults` prop exists to close off. `defaults` is undefined only when
 * nothing has been recorded for this date yet, in which case starting
 * blank is correct rather than a loss.
 *
 * `defaultChecked`/`defaultValue` (uncontrolled) rather than
 * `checked`/`value` -- this form's only state is what the mentor is
 * currently typing/toggling, seeded once from the server-fetched record.
 *
 * Never rendered for a weekend (the API 400s -- FR-19 "there is nothing to
 * attend") or an Evaluated day (FR-20 locks it) -- both gates live in
 * page.tsx, which decides whether to mount this component at all.
 */
export function DayRecordForm({
  studentId,
  date,
  defaults,
}: {
  studentId: string;
  date: string;
  defaults?: DayRecordDefaults;
}) {
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
          <input type="checkbox" name="attended" defaultChecked={defaults?.attended ?? false} />
          Attended
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--ink)" }}>
          <input
            type="checkbox"
            name="tasksCompleted"
            defaultChecked={defaults?.tasksCompleted ?? false}
          />
          Tasks completed
        </label>
      </div>
      <input
        name="note"
        // DayRecordUpsert caps `note` at 500 -- without this the API 400s on
        // a longer note with no client-side signal at all (same reasoning as
        // absence-toggle.tsx's reason field).
        maxLength={500}
        defaultValue={defaults?.note ?? ""}
        placeholder="Note (optional)"
        aria-label={`Mentor note for ${date}`}
        className="rounded-[var(--radius-control)] border px-3 py-2"
        style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
      />
      <p className="text-xs" style={{ color: "var(--ink-muted)" }}>
        Saving replaces the whole record for this day -- attendance, tasks, and note together.
      </p>
      {state !== null && "error" in state && (
        <p role="alert" className="text-sm" style={{ color: "var(--st-missed)" }}>
          {state.error ?? "Something went wrong."}
        </p>
      )}
      {state !== null && "ok" in state && (
        <p className="text-sm" style={{ color: "var(--st-ok)" }}>Record saved.</p>
      )}
      <div>
        <Button type="submit" variant="quiet" loading={pending}>
          Save record
        </Button>
      </div>
    </form>
  );
}
