import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Topbar } from "@/components/app-frame/topbar";
import { Sidebar } from "@/components/app-frame/sidebar";

// Topbar now imports signOut from @/auth for its sign-out form. Real
// next-auth (pulled in transitively via @/auth) needs `next/server`, which
// isn't resolvable under Vitest's environment — mock the app's thin wrapper,
// same as signin.test.tsx does for NotRegisteredPage. The inline `"use
// server"` action is asserted by presence, never invoked.
vi.mock("@/auth", () => ({
  signOut: vi.fn(),
}));

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

  it("offers a sign-out control", () => {
    render(<Topbar userName="A" />);
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});

describe("Sidebar", () => {
  it("is a navigation landmark 216px wide", () => {
    render(<Sidebar />);
    expect(screen.getByRole("navigation")).toHaveStyle({ width: "216px" });
  });

  it("renders Today as a real link now that / has a page", () => {
    // Task 9 added apps/web/app/(app)/page.tsx, so "/" is a route typedRoutes
    // accepts. Today is a link; it carries no aria-disabled.
    render(<Sidebar />);
    const today = screen.getByRole("link", { name: /Today/ });
    expect(today).toHaveAttribute("href", "/");
    expect(today).not.toHaveAttribute("aria-disabled");
  });

  it("renders the remaining four destinations as non-interactive items — none has a page yet", () => {
    // Roster and Students land in Plan 6, Review and Cycles in Plan 7.
    // typedRoutes rejects a Link to any of the four, so they stay
    // non-interactive until their own task lands.
    render(<Sidebar />);
    for (const item of ["Roster", "Review", "Cycles", "Students"]) {
      expect(screen.queryByRole("link", { name: new RegExp(item) })).not.toBeInTheDocument();
      const el = screen.getByText(new RegExp(item));
      expect(el).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("shows a review count on the (non-link) Review item only when there is something to review", () => {
    // getByText matches on each node's own direct text ("Review"), not the
    // nested badge span's "3" — so read the full textContent to confirm the
    // rendered name is "Review 3" with a space, not "Review3" run together.
    // That spacing requirement is the same one a link's accessible name
    // would need; it still applies now that the item is a plain span.
    const { rerender } = render(<Sidebar reviewCount={3} />);
    const withCount = screen.getByText(/^Review$/);
    expect(withCount).toHaveAttribute("aria-disabled", "true");
    expect(withCount.textContent).toBe("Review 3");

    rerender(<Sidebar reviewCount={0} />);
    const withoutCount = screen.getByText(/^Review$/);
    expect(withoutCount).toHaveAttribute("aria-disabled", "true");
    expect(withoutCount.textContent).toBe("Review");
  });
});
