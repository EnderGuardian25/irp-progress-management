import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/ui/empty-state";

describe("Button", () => {
  it("renders the primary variant", () => {
    render(<Button variant="primary">Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn.className).toContain("btn-primary");
  });

  it("renders the quiet variant", () => {
    render(<Button variant="quiet">Cancel</Button>);
    const btn = screen.getByRole("button", { name: "Cancel" });
    expect(btn.className).toContain("btn-quiet");
  });

  it("renders the danger variant", () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("btn-danger");
  });

  it("disables the control when disabled is passed", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("renders the loading state as reduced-opacity text with aria-busy, never a spinner swap", () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Save");
  });
});

describe("StatusPill", () => {
  it.each([
    ["onTime", "●", "On time"],
    ["late", "◐", "Late"],
    ["absent", "○", "Absent"],
    ["missed", "✕", "Missed"],
    ["pending", "·", "Open"],
    ["extra", "+", "Extra"],
    ["none", "—", "—"],
    ["future", "—", "—"],
  ] as const)("renders glyph + label for status %s", (status, glyph, label) => {
    // getByText matches on full textContent (glyph + label concatenated), so
    // for none/future — where glyph and label are both the same "—" — a
    // substring query against either half would match two nodes. Query the
    // pill by its data-status attribute directly instead.
    const { container } = render(<StatusPill status={status} />);
    const pill = container.querySelector(`[data-status="${status}"]`);
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe(`${glyph}${label}`);
  });

  it("appends the In review suffix when reportStatus is InReview", () => {
    render(<StatusPill status="pending" reportStatus="InReview" />);
    expect(screen.getByText(/In review/)).toBeInTheDocument();
  });

  it("appends the Evaluated (locked) suffix when reportStatus is Evaluated", () => {
    render(<StatusPill status="onTime" reportStatus="Evaluated" />);
    expect(screen.getByText(/Evaluated \(locked\)/)).toBeInTheDocument();
  });

  it("appends no suffix when reportStatus is null", () => {
    render(<StatusPill status="onTime" />);
    expect(screen.queryByText(/In review/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Evaluated/)).not.toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="No entries yet" />);
    expect(screen.getByText("No entries yet")).toBeInTheDocument();
  });

  it("renders the hint when supplied and omits it otherwise", () => {
    const { rerender } = render(<EmptyState title="No entries yet" hint="Submit today's update." />);
    expect(screen.getByText("Submit today's update.")).toBeInTheDocument();
    rerender(<EmptyState title="No entries yet" />);
    expect(screen.queryByText("Submit today's update.")).not.toBeInTheDocument();
  });
});
