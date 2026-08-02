"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { markAbsent, removeAbsence } from "./entry-actions";

/**
 * Mark/remove absence for one weekday target date, mirroring EntryComposer:
 * both actions are driven by useActionState so their `{ error } | null`
 * return actually reaches the student, in missed-red via role="alert".
 *
 * Review correction: an earlier version wired these through plain
 * server-component <form action={...}> closures that awaited the action and
 * discarded its result -- silently breaking the "surfaces the RFC 7807
 * detail" contract entry-actions.ts promises. Lifting the toggle into its
 * own client component is what makes useActionState available at all (it is
 * a React hook; student-today.tsx stays a server component).
 */
export function AbsenceToggle({
  date,
  absenceReason,
}: {
  date: string;
  absenceReason: string | null;
}) {
  const [markState, markAction, markPending] = useActionState(markAbsent, null);
  // removeAbsence takes only `date`; binding it here is what lets a single
  // useActionState-compatible action carry the fixed date alongside the
  // (state, formData) pair React supplies on every dispatch.
  const [removeState, removeAction, removePending] = useActionState(
    removeAbsence.bind(null, date),
    null,
  );

  if (absenceReason !== null) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p style={{ color: "var(--ink-muted)" }}>Marked absent — {absenceReason}</p>
          <form action={removeAction}>
            <Button type="submit" variant="quiet" loading={removePending}>Remove</Button>
          </form>
        </div>
        {removeState !== null && (
          <p role="alert" className="text-sm" style={{ color: "var(--st-missed)" }}>
            {removeState.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={markAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="date" value={date} />
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <SectionLabel>Mark absent</SectionLabel>
          <input
            name="reason"
            required
            // AbsenceCreate caps `reason` at 500 -- without this the API 400s
            // on a longer reason with no client-side signal at all.
            maxLength={500}
            placeholder="Reason"
            aria-label={`Absence reason for ${date}`}
            className="rounded-[var(--radius-control)] border px-3 py-2"
            style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
          />
        </label>
        <Button type="submit" variant="quiet" loading={markPending}>Mark absent</Button>
      </div>
      {markState !== null && (
        <p role="alert" className="text-sm" style={{ color: "var(--st-missed)" }}>
          {markState.error}
        </p>
      )}
    </form>
  );
}
