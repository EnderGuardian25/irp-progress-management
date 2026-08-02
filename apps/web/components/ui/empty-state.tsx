/**
 * docs/design-system.md §11: empty states teach the interface and are
 * invitations, never "Nothing here" — callers supply that invitation copy
 * via `title`/`hint`, this component only supplies the layout.
 */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-8 text-center">
      <p style={{ color: "var(--ink)" }}>{title}</p>
      {hint !== undefined && (
        <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>{hint}</p>
      )}
    </div>
  );
}
