"use server";

import { revalidatePath } from "next/cache";
import { transitionDailyReport, upsertDayRecord } from "@irp/client";
import { apiClient } from "@/lib/api-client";

interface ProblemLike {
  detail?: string;
  title?: string;
}

function problemMessage(error: unknown, fallback: string): string {
  const p = error as ProblemLike | undefined;
  return p?.detail ?? p?.title ?? fallback;
}

/**
 * FormData.get() is typed `File | string | null` -- see entry-actions.ts's
 * formString for the full rationale. None of this page's fields are file
 * inputs, but the type system doesn't know that, and `String(File)` silently
 * stringifies to "[object Object]" instead of throwing --
 * @typescript-eslint/no-base-to-string is what catches a direct `String(...)`
 * on an unnarrowed FormDataEntryValue.
 */
function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Driven by TransitionControl (a client component, day-record-form.tsx's
 * sibling) via `transitionReport.bind(null, studentId, reportId, to)` -- the
 * same fixed-leading-args shape as entry-actions.ts's removeAbsence.
 * useActionState calls the bound function with (prevState, formData); this
 * function ignores both, since studentId/reportId/to are already fixed by
 * bind before it's ever handed to useActionState.
 *
 * The brief's original wiring bound this straight into a plain server-
 * component `<form action={...}>`, which awaits and discards this function's
 * `{ error } | null` return -- the exact discarded-error defect Task 12's
 * review rejected for markAbsent/removeAbsence. Lifting the button into its
 * own client component (transition-control.tsx) driven by useActionState is
 * what lets a 409/404/500 actually reach the mentor.
 */
export async function transitionReport(
  studentId: string,
  reportId: string,
  to: "InReview" | "Evaluated",
): Promise<{ error: string } | null> {
  const client = await apiClient();
  const { error } = await transitionDailyReport({
    client,
    path: { id: reportId },
    body: { to },
  });
  if (error !== undefined) return { error: problemMessage(error, "The transition was rejected.") };
  revalidatePath(`/review/${studentId}`);
  return null;
}

/**
 * Driven by DayRecordForm (a client component) via plain useActionState --
 * this already has the (prevState, formData) reducer shape useActionState
 * requires, same as submitEntry/markAbsent in entry-actions.ts.
 */
export async function saveDayRecord(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const client = await apiClient();
  const studentId = formString(formData.get("studentId"));
  const date = formString(formData.get("date"));
  const note = formString(formData.get("note")).trim();
  const { error } = await upsertDayRecord({
    client,
    path: { id: studentId, date },
    body: {
      attended: formData.get("attended") === "on",
      tasksCompleted: formData.get("tasksCompleted") === "on",
      ...(note === "" ? {} : { note }),
    },
  });
  if (error !== undefined) return { error: problemMessage(error, "The record was not saved.") };
  revalidatePath(`/review/${studentId}`);
  return null;
}
