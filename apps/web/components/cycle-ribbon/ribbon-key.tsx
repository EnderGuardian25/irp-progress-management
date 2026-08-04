import { Fragment } from "react";
import { MARK_COLOR } from "@/components/cycle-ribbon/cycle-ribbon";

/**
 * The key to the mentor's cycle ribbon (docs/design-system.md §7, FR-28).
 *
 * §7 documents seven day-mark states and the batch-aggregation precedence, but
 * only in the design system — nothing said so on screen. The aggregation is the
 * part that actually needs saying: a mentor's bar is the WORST unresolved
 * outcome across the whole batch, so a single red bar means "at least one
 * student missed", not "everyone missed". Read as per-student, one bad day
 * looks like a collapsed batch.
 *
 * **Mentor-side only.** A student's ribbon uses the same colours for their OWN
 * status, where "at least one student" would be nonsense, so this copy is not
 * reusable there. If a student key is ever wanted it needs its own wording, not
 * a shared neutral phrasing that would be vague enough to explain neither.
 *
 * Collapsed by default, because §8.1 requires the ribbon and its figures above
 * the fold at 1280x800 and an always-open key spends that budget on something
 * a mentor reads once. `<details>` earns the keyboard path and the focus ring
 * from the platform rather than a hand-rolled disclosure (§9: "no reinvented
 * form controls").
 *
 * Rendered ONCE per page, below every batch section — not inside CycleRibbon,
 * which renders per batch and would repeat the key for each.
 */

/**
 * Geometry echoes the real slot: a fixed-height track with the bar sitting on
 * its baseline, `rounded-[2px]` as DaySlot uses.
 *
 * The track is 20px tall, not the 16px first tried. At 16px a 55% fill was
 * ~9px against a 16px full bar and `partial` was not distinguishable from `ok`
 * — nor was the `today` ring, whose 1.5px outline at 1px offset had no room to
 * clear the bar. A key whose swatches cannot be told apart is not a key. The
 * `px-[3px]` gives that outline its clearance without moving the bars.
 */
function Swatch({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="flex h-5 w-4 shrink-0 items-end justify-center px-[3px]">
      {children}
    </span>
  );
}

function Bar({ color, heightPct = 100 }: { color: string; heightPct?: number }) {
  return (
    <span
      className="block w-full rounded-[2px]"
      style={{ height: `${String(heightPct)}%`, background: color }}
    />
  );
}

interface KeyItem {
  swatch: React.ReactNode;
  name: string;
  /** What the mark means for a BATCH day. Carries the meaning, per §12 — the
   *  swatch is aria-hidden, so colour is never the only signal. */
  gloss: string;
}

// Order follows the ribbon's own precedence (missed first would put the
// alarming mark at the top of a reference list; §7 lists them best-to-worst
// and the precedence line below states the ranking explicitly instead).
const ITEMS: KeyItem[] = [
  {
    swatch: <Bar color={MARK_COLOR.ok} />,
    name: "On time",
    gloss: "every enrolled student submitted, none of them late",
  },
  {
    swatch: <Bar color={MARK_COLOR.partial} heightPct={55} />,
    name: "Partly in",
    gloss: "some submitted, the rest still inside the grace window — the bar's height is the share that is in",
  },
  {
    swatch: <Bar color={MARK_COLOR.late} />,
    name: "Late",
    gloss: "at least one entry arrived after its day closed, inside the grace window. Still counted",
  },
  {
    swatch: <Bar color={MARK_COLOR.absent} />,
    name: "Absent",
    gloss: "at least one student recorded an absence, with a reason. Carries no penalty",
  },
  {
    swatch: <Bar color={MARK_COLOR.missed} />,
    name: "Missed",
    gloss: "at least one weekday has no entry and no absence, past the grace window. Final",
  },
  {
    // The outline case: transparent fill, --line border. Matches DaySlot's
    // `border: 1px solid var(--line)` on mark === "future".
    swatch: (
      <span
        className="block h-full w-full rounded-[2px]"
        style={{ border: "1px solid var(--line)" }}
      />
    ),
    name: "Not yet reached",
    gloss: "nobody has reached this day",
  },
  {
    // Half-width, --ink-muted, + glyph above: §3.2's exact treatment. Extra is
    // distinguished by FORM, never by a sixth status colour — a teal tested at
    // 1.01:1 luminance against the ok green and was rejected.
    swatch: (
      <span className="relative flex h-full w-full items-end justify-center">
        <span
          className="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] leading-none"
          style={{ color: "var(--ink-muted)" }}
        >
          +
        </span>
        <span
          className="block w-1/2 rounded-[2px]"
          style={{ height: "60%", background: "var(--ink-muted)" }}
        />
      </span>
    ),
    name: "Extra",
    gloss: "weekend work. Never required, never missed, and never in a compliance total",
  },
  {
    // The ring is a decoration drawn OVER the day's real mark, so the swatch
    // shows it around a filled bar rather than as a mark of its own.
    swatch: (
      <span
        className="flex h-full w-full items-end"
        style={{ outline: "1.5px solid var(--primary)", outlineOffset: "1px", borderRadius: "2px" }}
      >
        <Bar color={MARK_COLOR.ok} />
      </span>
    ),
    name: "Today",
    gloss: "a ring over whichever mark the day actually has — an unsubmitted today still reads as unsubmitted",
  },
];

export function RibbonKey() {
  return (
    <details
      data-testid="ribbon-key"
      className="rounded-[var(--radius-panel)] border"
      style={{ background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <summary
        className="cursor-pointer px-6 py-3 text-sm"
        style={{ color: "var(--ink-muted)" }}
      >
        How to read this
      </summary>

      <div className="px-6 pb-6">
        {/*
          One column on a two-track grid, so every gloss starts at the same x
          and the list scans down. Two columns were tried: the glosses are long
          enough to wrap at 13px, which left ragged rows and a gap in the left
          column wherever the right one ran to two lines.

          dt/dd rather than a list of sentences — this is a term-to-meaning
          mapping and a screen reader should be able to walk it as one. The
          swatch lives INSIDE the dt so both are direct grid children and the
          tracks actually align; a wrapper div per item would break that.
        */}
        <dl className="grid grid-cols-[10rem_1fr] items-baseline gap-x-3 gap-y-2 text-[13px]">
          {ITEMS.map((item) => (
            <Fragment key={item.name}>
              <dt
                className="flex items-center gap-2 whitespace-nowrap font-semibold"
                style={{ color: "var(--ink)" }}
              >
                <Swatch>{item.swatch}</Swatch>
                {item.name}
              </dt>
              <dd style={{ color: "var(--ink-muted)" }}>{item.gloss}</dd>
            </Fragment>
          ))}
        </dl>

        {/*
          The reason this component exists. Without it a mentor reads each bar
          as a per-student mark and a single red day looks like a batch-wide
          failure. Precedence is fixed in lib/ribbon.ts's batchDayMark and
          specified in design-system §7; the order here must match both.
        */}
        <p className="mt-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>
          Each bar shows one day for the whole batch, and a day usually holds a mix. The{" "}
          <strong style={{ color: "var(--ink)" }}>worst outcome wins</strong>: missed, then late,
          then absent, then partly in, then on time. So a red day means at least one student
          missed it — not that everyone did.
        </p>
      </div>
    </details>
  );
}
