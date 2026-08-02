"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { transitionReport } from "./review-actions";

const NEXT_STEP = {
  Submitted: { to: "InReview", label: "Start review" },
  InReview: { to: "Evaluated", label: "Mark evaluated" },
} satisfies Record<"Submitted" | "InReview", { to: "InReview" | "Evaluated"; label: string }>;

/**
 * FR-18's forward-only transition, one step per render: Submitted ->
 * InReview -> Evaluated. Never rendered for an Evaluated day -- the page
 * (page.tsx) only mounts this for "Submitted"/"InReview", and FR-20 locks
 * the day once Evaluated (no buttons, no record form).
 *
 * A client component driven by useActionState, mirroring absence-toggle.tsx:
 * `transitionReport.bind(null, studentId, reportId, to)` fixes the three
 * leading args, leaving the (prevState, formData) pair useActionState
 * supplies on every dispatch as the bound function's (ignored) remaining
 * parameters. Binding into a plain server-component <form action> instead
 * would await and discard the `{ error } | null` return -- see
 * review-actions.ts's comment on transitionReport for why that shape was
 * rejected.
 */
export function TransitionControl({
  studentId,
  reportId,
  reportStatus,
}: {
  studentId: string;
  reportId: string;
  reportStatus: "Submitted" | "InReview";
}) {
  const step = NEXT_STEP[reportStatus];
  const [state, action, pending] = useActionState(
    transitionReport.bind(null, studentId, reportId, step.to),
    null,
  );

  return (
    <form action={action} className="mt-3 flex items-center gap-2">
      <Button type="submit" variant="quiet" loading={pending}>
        {step.label}
      </Button>
      {state !== null && (
        <p role="alert" className="text-sm" style={{ color: "var(--st-missed)" }}>
          {state.error ?? "Something went wrong."}
        </p>
      )}
    </form>
  );
}
