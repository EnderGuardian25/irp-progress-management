/**
 * The form-field label — the same 12px uppercase tracked treatment
 * SectionLabel carries (docs/design-system.md §4), but as a real `<label>`
 * bound to a control. SectionLabel is a `<div>`: using it for a field label
 * loses the association, and using a bare `<label>` loses the typography.
 * Three pages hand-rolled this before Plan 7's audit; now nobody does.
 */
import type { LabelHTMLAttributes, ReactNode } from "react";

export function FieldLabel({
  children,
  ...rest
}: { children: ReactNode } & LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label {...rest} className="block text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
      {children}
    </label>
  );
}
