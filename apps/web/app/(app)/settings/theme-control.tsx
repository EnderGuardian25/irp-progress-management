"use client";

import { useState, useTransition } from "react";
import { THEMES, type Theme } from "@/lib/theme";
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
