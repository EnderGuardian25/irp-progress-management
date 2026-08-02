/** The page-level h1 — docs/design-system.md §4: 24px, tracking -0.03em, text-wrap balance. */
import type { ReactNode } from "react";

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1
      className="mb-6 text-2xl font-bold"
      style={{ color: "var(--ink)", letterSpacing: "-0.03em", textWrap: "balance" }}
    >
      {children}
    </h1>
  );
}
