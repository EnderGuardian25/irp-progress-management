/**
 * The compliance status vocabulary — docs/design-system.md §3.2, §12.
 * Status is never colour alone: every state renders a glyph AND a text
 * label, so colour-vision deficiency and colour-stripped contexts (print,
 * high-contrast mode) still read correctly.
 *
 * `extra` is deliberately rendered in `--ink-muted`, not a status colour —
 * §3.2's "Extra — distinguished by form, not colour": weekend work is not a
 * compliance state and gets no place in the four-colour ramp.
 */
const STATUS_RENDER = {
  onTime: { glyph: "●", label: "On time", color: "var(--st-ok)" },
  late: { glyph: "◐", label: "Late", color: "var(--st-late)" },
  absent: { glyph: "○", label: "Absent", color: "var(--st-absent)" },
  missed: { glyph: "✕", label: "Missed", color: "var(--st-missed)" },
  pending: { glyph: "·", label: "Open", color: "var(--ink-muted)" },
  extra: { glyph: "+", label: "Extra", color: "var(--ink-muted)" },
  none: { glyph: "—", label: "—", color: "var(--ink-muted)" },
  future: { glyph: "—", label: "—", color: "var(--ink-muted)" },
} as const;

export type PillStatus = keyof typeof STATUS_RENDER;
export type PillReportStatus = "Submitted" | "InReview" | "Evaluated" | null;

export function StatusPill({
  status,
  reportStatus = null,
}: {
  status: PillStatus;
  reportStatus?: PillReportStatus;
}) {
  const r = STATUS_RENDER[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
      style={{ color: r.color, borderColor: "var(--line)" }}
      data-status={status}
    >
      <span aria-hidden="true">{r.glyph}</span>
      {r.label}
      {reportStatus === "InReview" && (
        <span style={{ color: "var(--st-review)" }}>&middot; In review</span>
      )}
      {reportStatus === "Evaluated" && (
        <span style={{ color: "var(--ink)" }}>&middot; Evaluated (locked)</span>
      )}
    </span>
  );
}
