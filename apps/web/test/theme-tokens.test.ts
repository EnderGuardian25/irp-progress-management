// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES, THEME_COOKIE, parseTheme } from "@/lib/theme";

describe("parseTheme", () => {
  it("accepts exactly the three offered values", () => {
    expect(THEMES).toEqual(["light", "dark", "system"]);
    for (const theme of THEMES) {
      expect(parseTheme(theme)).toBe(theme);
    }
  });

  it("degrades anything else to system, so a malformed cookie cannot reach a DOM attribute", () => {
    for (const bad of [undefined, "", "purple", "DARK", "light ", "system;", "<script>"]) {
      expect(parseTheme(bad)).toBe("system");
    }
  });

  it("names the cookie once, so the layout and the action cannot disagree", () => {
    expect(THEME_COOKIE).toBe("irp-theme");
  });
});

/**
 * The dark token block appears TWICE in globals.css — once inside
 * `@media (prefers-color-scheme: dark)` for "follow the OS", once as
 * `:root[data-theme="dark"]` for an explicit choice. CSS cannot combine a media
 * query with a selector list and this project has no preprocessor, so the
 * duplication is inherent.
 *
 * It is also dangerous. design-system §3 states 35 pairs pass WCAG AA and "do
 * not substitute values": a copy that drifts breaks AUDITED contrast silently —
 * nothing renders visibly wrong, the numbers simply are no longer the ones that
 * were checked. This test is why the duplication is acceptable.
 */
describe("globals.css dark token blocks", () => {
  const css = readFileSync(
    path.join(import.meta.dirname, "..", "app", "globals.css"),
    "utf8",
  );

  function darkBlocks(source: string): string[] {
    const blocks = [...source.matchAll(/\/\* dark-tokens:start \*\/([\s\S]*?)\/\* dark-tokens:end \*\//g)];
    // Whitespace-normalised so indentation differences between the two nesting
    // depths (inside a media query vs at top level) are not treated as drift.
    return blocks.map((m) => m[1]!.replace(/\s+/g, " ").trim());
  }

  it("has exactly two marked dark blocks", () => {
    expect(darkBlocks(css)).toHaveLength(2);
  });

  it("keeps the two blocks byte-identical after whitespace normalisation", () => {
    const [mediaQuery, explicit] = darkBlocks(css);
    expect(explicit).toBe(mediaQuery);
  });

  it("actually carries the §3.3 tokens, so an empty pair cannot pass vacuously", () => {
    const [block] = darkBlocks(css);
    expect(block).toContain("--bg: #121212");
    expect(block).toContain("--st-missed: #ed7473");
    // 13 declarations in §3.3's dark table.
    expect(block!.match(/--[a-z-]+:/g)).toHaveLength(13);
  });
});
