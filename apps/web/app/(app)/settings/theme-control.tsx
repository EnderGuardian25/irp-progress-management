"use client";

import { useEffect, useState, useTransition } from "react";
import { THEMES, parseTheme, type Theme } from "@/lib/theme";
import { setTheme } from "./theme-actions";

/**
 * ASSUMPTION: O-14 — the theme switch maps to no FR and closes ADR-0002.
 *
 * A radio group, not a select: three mutually exclusive options that all fit on
 * screen, so every choice is visible without opening anything, and the platform
 * supplies arrow-key navigation and the focus ring §12 requires. §9 bans
 * reinvented form controls.
 *
 * The attribute is written to the live document BEFORE the action is awaited.
 * That is deliberate: the cookie is for the next request, and waiting for a
 * server round trip to repaint would make the switch feel broken. The server
 * and the DOM converge because both derive from the same three values.
 */
const LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "Follow system",
};

const HINT: Record<Theme, string> = {
  light: "Always light, whatever this device is set to.",
  dark: "Always dark, whatever this device is set to.",
  system: "Match whatever this device is set to. The default.",
};

export function ThemeControl({ current }: { current: Theme }) {
  const [selected, setSelected] = useState<Theme>(current);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Re-seed from the LIVE DOM after mount, on top of the `current` server prop
  // the initial render already used. This is NOT the same as trusting the
  // prop: on a browser back/forward navigation, Next's client router cache
  // can replay an older cached render of this whole tree — this component's
  // own `current` prop included — while `<html data-theme>` is a shared,
  // uncontrolled DOM node that the SAME stale replay independently rewrites.
  // The two are supposed to agree (both are ultimately sourced from the same
  // cookie on the same request) but a stale replay can desynchronise them, so
  // "what does the live attribute say right now" is the more trustworthy
  // source of truth than a prop this component cannot tell is fresh or stale.
  // See docs/interview-and-prd.md O-16 for the rendering-level defect this
  // does NOT fix (the page itself can still repaint in the pre-choice theme;
  // this only keeps the radio group honest about what is actually on screen).
  //
  // This MUST run in an effect, not during render: render must produce the
  // exact same output the server did or React logs a hydration mismatch, and
  // `document` does not exist during SSR at all. Seeding `useState` from
  // `current` keeps the first render identical on both sides; this effect
  // only adjusts the value AFTER hydration has already completed. Do not
  // "simplify" this into seeding `useState` from the DOM directly — that
  // would run during the client's first render, before hydration finishes,
  // and reintroduce the exact mismatch this comment warns against.
  //
  // Do not replace this with `revalidatePath` in theme-actions.ts. That would
  // force a server round trip and re-render on every switch, contradicting
  // ADR-0021's instant-repaint reasoning — a decision this fix must not
  // relitigate.
  useEffect(() => {
    setSelected(parseTheme(document.documentElement.dataset.theme));
  }, []);

  function choose(next: Theme): void {
    setSelected(next);
    setError(null);

    // "system" REMOVES the attribute rather than setting it: an absent
    // data-theme is what lets globals.css's prefers-color-scheme query apply.
    // Setting data-theme="system" would match no rule and pin the light base.
    if (next === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = next;
    }

    startTransition(async () => {
      const result = await setTheme(next);
      if (result !== null) {
        // The look already changed; say so rather than reverting under the
        // reader's cursor. The cookie simply did not persist, and the next
        // full load will show that.
        setError(`${result.error} This device will go back to ${LABEL[current]} on reload.`);
      }
    });
  }

  return (
    <fieldset className="flex flex-col gap-3 border-0 p-0">
      <legend className="sr-only">Theme</legend>
      {THEMES.map((theme) => (
        <label key={theme} className="flex cursor-pointer items-start gap-3">
          <input
            type="radio"
            name="theme"
            value={theme}
            checked={selected === theme}
            onChange={() => { choose(theme); }}
            aria-describedby={`theme-hint-${theme}`}
            className="mt-1"
          />
          <span>
            <span className="block text-sm" style={{ color: "var(--ink)" }}>
              {LABEL[theme]}
            </span>
            {/* aria-hidden keeps this out of the radio's accessible NAME (computed
                from the wrapping label's content) while aria-describedby still
                surfaces it as the accessible DESCRIPTION — a direct reference is
                not subject to the same hidden-content exclusion. */}
            <span
              id={`theme-hint-${theme}`}
              aria-hidden="true"
              className="block text-xs"
              style={{ color: "var(--ink-muted)" }}
            >
              {HINT[theme]}
            </span>
          </span>
        </label>
      ))}
      {error !== null && (
        <p role="alert" className="text-sm" style={{ color: "var(--st-missed)" }}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
