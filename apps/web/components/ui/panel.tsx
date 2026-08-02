/**
 * The surface card wrapper — docs/design-system.md §5. `sunk` selects the
 * denser roster-zone surface (`--surface-sunk`) instead of the default
 * `--surface`.
 */
import type { ReactNode } from "react";

export function Panel({ children, sunk = false }: { children: ReactNode; sunk?: boolean }) {
  return (
    <div
      className="rounded-[var(--radius-panel)] border p-6"
      style={{
        background: sunk ? "var(--surface-sunk)" : "var(--surface)",
        borderColor: "var(--line)",
      }}
    >
      {children}
    </div>
  );
}
