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
    render(<Sidebar role="Admin" />);
    expect(screen.getByRole("navigation")).toHaveStyle({ width: "216px" });
  });

  it("renders Today as a real link now that / has a page, on both role variants", () => {
    // Task 9 added apps/web/app/(app)/page.tsx, so "/" is a route typedRoutes
    // accepts. Today is a link; it carries no aria-disabled.
    for (const role of ["Admin", "Student"] as const) {
      const { unmount } = render(<Sidebar role={role} />);
      const today = screen.getByRole("link", { name: /Today/ });
      expect(today).toHaveAttribute("href", "/");
      expect(today).not.toHaveAttribute("aria-disabled");
      unmount();
    }
  });

  it("mentor (Admin) role: Roster is a real link; Review, Cycles, Students stay non-interactive", () => {
    // Task 13 added apps/web/app/(app)/roster/page.tsx, so Roster is now a
    // real link. Students lands in Task 15, Review in Task 14, Cycles in
    // Plan 7 -- typedRoutes rejects a Link to any of the three, so they stay
    // non-interactive until their own task lands.
    render(<Sidebar role="Admin" />);

    const roster = screen.getByRole("link", { name: /Roster/ });
    expect(roster).toHaveAttribute("href", "/roster");
    expect(roster).not.toHaveAttribute("aria-disabled");

    for (const item of ["Review", "Cycles", "Students"]) {
      expect(screen.queryByRole("link", { name: new RegExp(item) })).not.toBeInTheDocument();
      const el = screen.getByText(new RegExp(item));
      expect(el).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("Student role: sees only Today and My month -- no mentor-only destinations at all", () => {
    // Role gating hides mentor destinations entirely rather than merely
    // disabling them -- a Student should find no trace of Roster, Review,
    // Cycles, or Students in the DOM.
    render(<Sidebar role="Student" />);

    expect(screen.getByText("My month")).toHaveAttribute("aria-disabled", "true");
    for (const item of ["Roster", "Review", "Cycles", "Students"]) {
      expect(screen.queryByText(new RegExp(item))).not.toBeInTheDocument();
    }
  });

  it("shows a review count on the (non-link) Review item only when there is something to review", () => {
    // getByText matches on each node's own direct text ("Review"), not the
    // nested badge span's "3" — so read the full textContent to confirm the
    // rendered name is "Review 3" with a space, not "Review3" run together.
    // That spacing requirement is the same one a link's accessible name
    // would need; it still applies now that the item is a plain span.
    const { rerender } = render(<Sidebar role="Admin" reviewCount={3} />);
    const withCount = screen.getByText(/^Review$/);
    expect(withCount).toHaveAttribute("aria-disabled", "true");
    expect(withCount.textContent).toBe("Review 3");

    rerender(<Sidebar role="Admin" reviewCount={0} />);
    const withoutCount = screen.getByText(/^Review$/);
    expect(withoutCount).toHaveAttribute("aria-disabled", "true");
    expect(withoutCount.textContent).toBe("Review");
  });
});
