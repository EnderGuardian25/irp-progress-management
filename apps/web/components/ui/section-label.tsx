/** The uppercase 12px section/field label pattern the pages hand-roll today. */
import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
      {children}
    </div>
  );
}
