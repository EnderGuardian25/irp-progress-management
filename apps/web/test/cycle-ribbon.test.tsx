import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CycleRibbon, type RibbonDay } from "@/components/cycle-ribbon/cycle-ribbon";

const days: RibbonDay[] = [
  { date: "2026-07-10", mark: "ok" },
  { date: "2026-07-13", mark: "late" },
  { date: "2026-07-14", mark: "absent" },
  { date: "2026-07-15", mark: "missed" },
  { date: "2026-07-16", mark: "partial", fill: 0.6 },
  { date: "2026-07-17", mark: "today" },
  { date: "2026-07-20", mark: "future" },
];

describe("CycleRibbon", () => {
  it("renders one slot per required day", () => {
    render(<CycleRibbon days={days} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });

  it("labels every day with its mark for assistive tech", () => {
    render(<CycleRibbon days={days} />);
    for (const d of days) {
      expect(screen.getByLabelText(`${d.date}: ${d.mark}`)).toBeInTheDocument();
    }
  });

  it("renders no weekend slot when nobody worked the weekend", () => {
    render(<CycleRibbon days={days} />);
    expect(screen.queryByLabelText(/extra/i)).not.toBeInTheDocument();
  });

  it("renders a half-width extra slot only where a weekend was worked", () => {
    render(<CycleRibbon days={days} extraAfter={["2026-07-10"]} />);
    const extras = screen.getAllByLabelText(/extra work/i);
    expect(extras).toHaveLength(1);
    // FR-33: the slot sits between the Friday and the Monday it falls between,
    // so immediately after the day it follows.
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAccessibleName(/extra work/i);
  });

  it("does not count an extra slot as a required day", () => {
    render(<CycleRibbon days={days} extraAfter={["2026-07-10"]} />);
    // 7 required + 1 extra = 8 slots, but only 7 are required days.
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByTestId("required-day-count")).toHaveTextContent("7");
  });

  it("renders the label and caption when supplied", () => {
    render(<CycleRibbon days={days} label="Cycle 2 · 10 Jul – 9 Aug" caption="8 of 10 submitted today" />);
    expect(screen.getByText("Cycle 2 · 10 Jul – 9 Aug")).toBeInTheDocument();
    expect(screen.getByText("8 of 10 submitted today")).toBeInTheDocument();
  });

  it("applies a proportional fill for a partial day", () => {
    render(<CycleRibbon days={[{ date: "2026-07-16", mark: "partial", fill: 0.6 }]} />);
    const bar = screen.getByLabelText("2026-07-16: partial").firstElementChild;
    expect(bar).toHaveStyle({ height: "60%" });
  });
});
