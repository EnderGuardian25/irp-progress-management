// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RibbonKey } from "@/components/cycle-ribbon/ribbon-key";
import { MARK_COLOR } from "@/components/cycle-ribbon/cycle-ribbon";
import { batchDayMark } from "@/lib/ribbon";

/**
 * The key's only job is to agree with the ribbon. A legend that has drifted
 * from what is on screen is worse than no legend, so these tests pin the two
 * together rather than pinning the copy.
 */
describe("RibbonKey", () => {
  it("names every mark batchDayMark can produce", () => {
    render(<RibbonKey />);

    // Derived from the mark producer itself, not a hand-listed set: a new mark
    // added to batchDayMark fails here instead of silently going undocumented.
    const producible = new Set(
      [
        { enrolled: 0, submitted: 0, late: 0, absent: 0, missed: 0, pending: 0 },
        { enrolled: 10, submitted: 10, late: 0, absent: 0, missed: 0, pending: 0 },
        { enrolled: 10, submitted: 5, late: 0, absent: 0, missed: 0, pending: 5 },
        { enrolled: 10, submitted: 10, late: 2, absent: 0, missed: 0, pending: 0 },
        { enrolled: 10, submitted: 9, late: 0, absent: 1, missed: 0, pending: 0 },
        { enrolled: 10, submitted: 9, late: 0, absent: 0, missed: 1, pending: 0 },
      ].map((d) => batchDayMark(d).mark),
    );
    expect(producible).toEqual(new Set(["future", "ok", "partial", "late", "absent", "missed"]));

    const NAME_FOR_MARK: Record<string, string> = {
      ok: "On time",
      partial: "Partly in",
      late: "Late",
      absent: "Absent",
      missed: "Missed",
      future: "Not yet reached",
    };
    for (const mark of producible) {
      expect(screen.getByText(NAME_FOR_MARK[mark]!)).toBeInTheDocument();
    }
  });

  it("draws its swatches with the ribbon's own MARK_COLOR values", () => {
    const { container } = render(<RibbonKey />);
    const backgrounds = [...container.querySelectorAll<HTMLElement>("span[style*='background']")]
      .map((el) => el.style.background)
      .filter((b) => b !== "");

    // Every status colour the ribbon can paint must appear in the key. Reading
    // MARK_COLOR rather than the literal tokens is the point: retokenising the
    // ribbon must not leave the key describing a colour that is gone.
    for (const color of new Set(Object.values(MARK_COLOR))) {
      expect(backgrounds).toContain(color);
    }
    // Extra is --ink-muted, never a status colour (§3.2, and the rejected teal).
    expect(backgrounds).toContain("var(--ink-muted)");
    expect(new Set(Object.values(MARK_COLOR))).not.toContain("var(--ink-muted)");
  });

  it("states the precedence order, which is the reason it exists", () => {
    render(<RibbonKey />);
    // The aggregation rule, not the colour list, is what stops a mentor reading
    // one red bar as a batch-wide failure.
    expect(screen.getByText(/worst outcome wins/i)).toBeInTheDocument();
    expect(
      screen.getByText(/missed, then late, then absent, then partly in, then on time/i),
    ).toBeInTheDocument();
  });

  it("is collapsed by default, so §8.1's above-the-fold budget stays with the figures", () => {
    render(<RibbonKey />);
    const details = screen.getByTestId("ribbon-key");
    expect(details.tagName).toBe("DETAILS");
    expect(details).not.toHaveAttribute("open");
  });

  it("keeps colour off the critical path — every swatch is aria-hidden and every mark has a text name", () => {
    // §12's floor: "Status is never colour alone. Glyph plus text label,
    // always." A swatch that is not hidden would be announced as an unlabelled
    // element beside the name it duplicates.
    const { container } = render(<RibbonKey />);
    const swatchWrappers = container.querySelectorAll("dl span[aria-hidden='true']");
    expect(swatchWrappers.length).toBe(container.querySelectorAll("dl dt").length);
  });
});
