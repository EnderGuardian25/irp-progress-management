import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Topbar } from "@/components/app-frame/topbar";
import { Sidebar } from "@/components/app-frame/sidebar";

describe("Topbar", () => {
  it("shows the signed-in user's name", () => {
    render(<Topbar userName="Damian De Cruz" />);
    expect(screen.getByText("Damian De Cruz")).toBeInTheDocument();
  });

  it("shows the batch when supplied and omits it otherwise", () => {
    const { rerender } = render(<Topbar userName="A" batchName="Batch 12" />);
    expect(screen.getByText("Batch 12")).toBeInTheDocument();
    rerender(<Topbar userName="A" />);
    expect(screen.queryByText("Batch 12")).not.toBeInTheDocument();
  });

  it("is a banner landmark 56px tall", () => {
    render(<Topbar userName="A" />);
    expect(screen.getByRole("banner")).toHaveStyle({ height: "56px" });
  });
});

describe("Sidebar", () => {
  it("is a navigation landmark 216px wide", () => {
    render(<Sidebar />);
    expect(screen.getByRole("navigation")).toHaveStyle({ width: "216px" });
  });

  it("renders the primary destinations", () => {
    render(<Sidebar />);
    for (const item of ["Today", "Roster", "Review", "Cycles", "Students"]) {
      expect(screen.getByRole("link", { name: new RegExp(item) })).toBeInTheDocument();
    }
  });

  it("shows a review count badge only when there is something to review", () => {
    const { rerender } = render(<Sidebar reviewCount={3} />);
    expect(screen.getByRole("link", { name: /Review 3/ })).toBeInTheDocument();
    rerender(<Sidebar reviewCount={0} />);
    expect(screen.getByRole("link", { name: /^Review$/ })).toBeInTheDocument();
  });
});
