import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandMark } from "@/components/app-frame/brand-mark";

/**
 * Vite resolves a static PNG import to a plain URL **string**, not the
 * `{src, width, height}` object a real bundler's static import produces — so
 * this suite exercises `next/image`'s string-`src` path, never the
 * static-import path. That is exactly why `next/image`'s production-only
 * `height` inference from a static import (see CLAUDE.md's hard-won-facts
 * list) is untestable here: `isStaticImport(src)` is false against a string,
 * the inference branch never runs, and every test below would fail if
 * `BrandMark` ever omitted `height` — which is by design, not a gap.
 */
describe("BrandMark", () => {
  it("renders the mark variant with an EMPTY alt, because adjacent text names the product", () => {
    const { container } = render(<BrandMark variant="mark" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // Empty alt, not a missing alt: decorative. A name here would make every
    // screen reader user hear the product twice on every single page.
    expect(img).toHaveAttribute("alt", "");
  });

  it("renders the lockup variant with a real accessible name", () => {
    render(<BrandMark variant="lockup" />);
    expect(screen.getByRole("img", { name: "Bistec Hearts Academy" })).toBeInTheDocument();
  });

  it("sits on the theme-invariant card token, never a themed surface", () => {
    const { container } = render(<BrandMark variant="mark" />);
    const card = container.firstElementChild as HTMLElement;
    // If this ever reads var(--surface) or var(--bg), the wordmark will vanish
    // in dark. That is the entire reason --brand-card exists.
    expect(card.style.background).toBe("var(--brand-card)");
  });

  it("gives the two variants different rendered widths", () => {
    const mark = render(<BrandMark variant="mark" />).container.querySelector("img");
    const lockup = render(<BrandMark variant="lockup" />).container.querySelector("img");
    expect(Number(mark?.getAttribute("width"))).toBeLessThan(
      Number(lockup?.getAttribute("width")),
    );
  });
});
