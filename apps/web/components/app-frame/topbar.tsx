import { BrandMark } from "./brand-mark";

/**
 * The app frame's topbar. Semantic `banner` landmark, 56px tall, on
 * `--surface` — docs/design-system.md §6. Desktop only (NFR-13); no mobile
 * treatment is provided.
 *
 * Still a Server Component (no "use client") — nothing here needs
 * client-side interactivity. Sign out moved to the sidebar (O-15): it is
 * built as a form in `app/(app)/layout.tsx`, the actual Server Component
 * that owns the inline `"use server"` action, and passed down as a slot. Do
 * not restore a sign-out control here.
 *
 * §6's frame sketches a `Batch 12 ▾` switcher in this bar. It is deliberately
 * absent: `User` (spec/openapi.yaml) carries no batch, a mentor holds several
 * so a single name would be wrong for them anyway, and batch selection is
 * already per-page via the Roster and Cycles chips. The `batchName` prop that
 * anticipated it was never passed by the layout — dead since it was written,
 * so it is gone rather than left as a slot nothing can fill. Recorded in
 * docs/design-system.md §13.
 */
export function Topbar({ userName }: { userName: string }) {
  return (
    // shrink-0: the app frame is a fixed-height flex column, so without it
    // this 56px bar is compressible once the content column is tall.
    <header
      role="banner"
      className="flex shrink-0 items-center justify-between border-b px-6"
      style={{ height: "56px", background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="flex items-center gap-2">
        <BrandMark variant="mark" />
        <span className="font-semibold" style={{ color: "var(--ink)" }}>
          Hearts Academy &middot; IRP
        </span>
      </div>

      <div className="flex items-center gap-6">
        <span style={{ color: "var(--ink)" }}>{userName}</span>
      </div>
    </header>
  );
}
