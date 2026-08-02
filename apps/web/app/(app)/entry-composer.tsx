"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { submitEntry } from "./entry-actions";

export function EntryComposer({ targetDates }: { targetDates: string[] }) {
  const [state, action, pending] = useActionState(submitEntry, null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <SectionLabel>Submit an update</SectionLabel>
      <select
        name="entryDate"
        defaultValue={targetDates[targetDates.length - 1] ?? ""}
        aria-label="Entry date"
        className="rounded-[var(--radius-control)] border px-3 py-2"
        style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
      >
        {targetDates.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <textarea
        name="body"
        required
        maxLength={4000}
        rows={4}
        placeholder="What did you work on?"
        aria-label="Entry text"
        className="rounded-[var(--radius-control)] border px-3 py-2"
        style={{ borderColor: "var(--line)", background: "var(--surface)", color: "var(--ink)" }}
      />
      {state !== null && (
        <p role="alert" className="text-sm" style={{ color: "var(--st-missed)" }}>{state.error}</p>
      )}
      <div>
        <Button type="submit" loading={pending}>Submit update</Button>
      </div>
    </form>
  );
}
