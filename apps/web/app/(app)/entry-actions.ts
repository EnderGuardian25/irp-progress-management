"use server";

import { revalidatePath } from "next/cache";
import { createEntry, createAbsence, deleteAbsence } from "@irp/client";
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
 * FormData.get() is typed `File | string | null` because a form CAN carry a
 * file field. None of these forms do -- every field here is a text input or
 * textarea -- but the type system does not know that, and `String(File)`
 * silently stringifies to "[object Object]" instead of throwing. Narrowing
 * explicitly is what @typescript-eslint/no-base-to-string is catching.
 */
function formString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

/**
 * Driven by useActionState in entry-composer.tsx (a client component), which
 * calls action(prevState, formData) itself. The two-argument reducer shape
 * is required here — useActionState will not work with a single-argument
 * action.
 */
export async function submitEntry(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const client = await apiClient();
  const { error } = await createEntry({
    client,
    body: {
      entryDate: formString(formData.get("entryDate")),
      body: formString(formData.get("body")),
    },
  });
  if (error !== undefined) return { error: problemMessage(error, "The entry was not accepted.") };
  revalidatePath("/");
  return null;
}

/**
 * A plain form action, not a useActionState reducer: student-today.tsx is a
 * server component -- the absence toggle needs no client-side pending/error
 * UI -- so this takes exactly the FormData a <form> passes it, wrapped by an
 * inline "use server" action at the call site (its own return value must be
 * void|Promise<void>, which this function's `{ error } | null` is not).
 *
 * (Deliberately single-argument, matching this task's own "Produces"
 * interface summary. A two-argument reducer shape here -- mirroring
 * submitEntry -- would only work behind useActionState; called from a plain
 * form instead, the submitted FormData would land in the unused prevState
 * parameter and the real formData argument would be undefined at runtime.)
 */
export async function markAbsent(formData: FormData): Promise<{ error: string } | null> {
  const client = await apiClient();
  const { error } = await createAbsence({
    client,
    body: {
      date: formString(formData.get("date")),
      reason: formString(formData.get("reason")),
    },
  });
  if (error !== undefined) return { error: problemMessage(error, "The absence was not recorded.") };
  revalidatePath("/");
  return null;
}

/**
 * Called from student-today.tsx's inline "use server" form action, which
 * closes over the fixed `date` from the enclosing render and discards this
 * function's `{ error } | null` return, for the same void|Promise<void>
 * reason as markAbsent above.
 */
export async function removeAbsence(date: string): Promise<{ error: string } | null> {
  const client = await apiClient();
  const { error } = await deleteAbsence({ client, path: { date } });
  if (error !== undefined) return { error: problemMessage(error, "The absence was not removed.") };
  revalidatePath("/");
  return null;
}
