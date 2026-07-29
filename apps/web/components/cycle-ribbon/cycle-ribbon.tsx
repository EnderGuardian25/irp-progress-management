export type DayMark = "ok" | "partial" | "late" | "absent" | "missed" | "future" | "today";

export interface RibbonDay {
  /** ISO date, YYYY-MM-DD. A required day (weekday) only. */
  date: string;
  mark: DayMark;
  /** 0..1, used only when mark === "partial". */
  fill?: number;
}

export interface RibbonProps {
  /** Required days only. Weekends never appear here — see extraAfter. */
  days: RibbonDay[];
  /** Dates after which a weekend Extra slot is rendered (FR-33). */
  extraAfter?: string[];
  label?: string;
  caption?: string;
}

// docs/design-system.md §3.2 / §7: full (ok) · partial (proportional fill,
// same colour family as ok) · ochre notch (late) · slate (absent) ·
// red (missed) · ringed (today, drawn in the ok colour with a primary ring).
// "future" is excluded here and rendered as an outline instead — §7 "outline
// (not yet reached)".
const MARK_COLOR: Record<Exclude<DayMark, "future">, string> = {
  ok: "var(--st-ok)",
  partial: "var(--st-ok)",
  late: "var(--st-late)",
  absent: "var(--st-absent)",
  missed: "var(--st-missed)",
  today: "var(--st-ok)",
};

function DaySlot({ day }: { day: RibbonDay }) {
  const heightPct = day.mark === "partial" ? Math.round((day.fill ?? 0) * 100) : 100;
  const background = day.mark === "future" ? "transparent" : MARK_COLOR[day.mark];

  return (
    <li
      aria-label={`${day.date}: ${day.mark}`}
      className="relative flex h-11 w-2 items-end"
      style={
        day.mark === "today"
          ? { outline: "1.5px solid var(--primary)", outlineOffset: "1px", borderRadius: "2px" }
          : undefined
      }
    >
      <span
        className="block w-full rounded-[2px]"
        style={{
          height: `${String(heightPct)}%`,
          background,
          border: day.mark === "future" ? "1px solid var(--line)" : undefined,
        }}
      />
    </li>
  );
}

function ExtraSlot({ after }: { after: string }) {
  // Half-width, and distinguished by FORM not colour. A sixth status colour was
  // tried and rejected: a teal at hue 200 lands within 1.01:1 luminance of the
  // ok green, indistinguishable in a dense ribbon for a colour-vision-deficient
  // user. docs/design-system.md §3.2 specifies the exact treatment: "a
  // half-width slot in --ink-muted carrying a + glyph" — both the glyph and the
  // bar below use --ink-muted, never a status colour.
  return (
    <li aria-label={`Extra work after ${after}`} className="relative flex h-11 w-1 items-end">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] leading-none"
        style={{ color: "var(--ink-muted)" }}
      >
        +
      </span>
      <span
        className="block w-full rounded-[2px]"
        style={{ height: "60%", background: "var(--ink-muted)" }}
      />
    </li>
  );
}

/**
 * The signature element (docs/design-system.md §7, FR-28). One bar per REQUIRED
 * day; an Extra slot appears only where a weekend was actually worked (FR-33).
 *
 * Plan 3 builds day-mark rendering only. Plan 7 extends this with real data and
 * interaction — it does not replace it. There is only ever one ribbon.
 */
export function CycleRibbon({ days, extraAfter = [], label, caption }: RibbonProps) {
  const extras = new Set(extraAfter);

  return (
    <figure
      className="rounded-[var(--radius-panel)] border p-6"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      {label !== undefined && (
        <figcaption
          className="tabular mb-3 text-xs uppercase tracking-[0.08em]"
          style={{ color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}
        >
          {label}
        </figcaption>
      )}

      <ol className="flex items-end gap-[3px]">
        {days.flatMap((day) => {
          const slots = [<DaySlot key={day.date} day={day} />];
          if (extras.has(day.date)) {
            slots.push(<ExtraSlot key={`${day.date}-extra`} after={day.date} />);
          }
          return slots;
        })}
      </ol>

      {/* Extra days never enter a compliance denominator (FR-12). */}
      <span data-testid="required-day-count" className="sr-only">
        {days.length}
      </span>

      {caption !== undefined && (
        <p className="tabular mt-3 text-xs" style={{ color: "var(--ink-muted)" }}>
          {caption}
        </p>
      )}
    </figure>
  );
}
