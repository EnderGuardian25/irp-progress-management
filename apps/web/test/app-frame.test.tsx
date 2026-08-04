import { beforeEach, describe, expect, it, vi } from "vitest";
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

// Sidebar became a Client Component to read usePathname — that is the only
// way it can know which destination is current, since a layout does not
// re-render on navigation within its own segment.
const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn(() => "/") }));
vi.mock("next/navigation", () => ({ usePathname }));

describe("Topbar", () => {
  it("shows the signed-in user's name", () => {
    render(<Topbar userName="Damian De Cruz" />);
    expect(screen.getByText("Damian De Cruz")).toBeInTheDocument();
  });

  // The `batchName` prop this once covered is gone: it was never passed by the
  // layout, `User` carries no batch, and §6's global batch switcher is served
  // instead by the per-page Roster/Cycles chips. Recorded in
  // docs/design-system.md §13.

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
  beforeEach(() => {
    usePathname.mockReturnValue("/");
  });

  it("marks the current destination with aria-current and the active-nav fill", () => {
    usePathname.mockReturnValue("/roster");
    render(<Sidebar role="Admin" />);

    expect(screen.getByRole("link", { name: /Roster/ })).toHaveAttribute("aria-current", "page");
    // §12: colour never carries meaning alone, so the state is also an
    // attribute assistive tech can read.
    expect(screen.getByRole("link", { name: /Cycles/ })).not.toHaveAttribute("aria-current");
  });

  it("keeps Review current on a per-student review page, which has no nav entry of its own", () => {
    usePathname.mockReturnValue("/review/abc-123");
    render(<Sidebar role="Admin" />);

    expect(screen.getByRole("link", { name: /^Review/ })).toHaveAttribute("aria-current", "page");
  });

  it("does not light up Today on every page just because every path starts with /", () => {
    // The bug a prefix test would introduce: "/" prefixes literally every
    // route, so Today would read as current on Roster, Review and the rest.
    usePathname.mockReturnValue("/cycles");
    render(<Sidebar role="Admin" />);

    expect(screen.getByRole("link", { name: /Today/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /Cycles/ })).toHaveAttribute("aria-current", "page");
  });

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

  it("mentor (Admin) role: Roster, Review, Cycles, and Students are all real links", () => {
    // Task 13 added apps/web/app/(app)/roster/page.tsx, Task 14 added
    // apps/web/app/(app)/review/page.tsx, Task 15 added
    // apps/web/app/(app)/students/page.tsx, and Task 7 added
    // apps/web/app/(app)/cycles/page.tsx, so all four are now real links.
    render(<Sidebar role="Admin" />);

    const roster = screen.getByRole("link", { name: /Roster/ });
    expect(roster).toHaveAttribute("href", "/roster");
    expect(roster).not.toHaveAttribute("aria-disabled");

    const review = screen.getByRole("link", { name: /^Review$/ });
    expect(review).toHaveAttribute("href", "/review");
    expect(review).not.toHaveAttribute("aria-disabled");

    const cycles = screen.getByRole("link", { name: /Cycles/ });
    expect(cycles).toHaveAttribute("href", "/cycles");
    expect(cycles).not.toHaveAttribute("aria-disabled");

    const students = screen.getByRole("link", { name: /Students/ });
    expect(students).toHaveAttribute("href", "/students");
    expect(students).not.toHaveAttribute("aria-disabled");
  });

  it("Student role: My month is a real link now that /my-month has a page, on the Student list", () => {
    // Task 8 added apps/web/app/(app)/my-month/page.tsx, so "/my-month" is a
    // route typedRoutes accepts. My month is a link; it carries no
    // aria-disabled.
    render(<Sidebar role="Student" />);

    const myMonth = screen.getByRole("link", { name: /My month/ });
    expect(myMonth).toHaveAttribute("href", "/my-month");
    expect(myMonth).not.toHaveAttribute("aria-disabled");
  });

  it("Student role: sees only Today and My month -- no mentor-only destinations at all", () => {
    // Role gating hides mentor destinations entirely rather than merely
    // disabling them -- a Student should find no trace of Roster, Review,
    // Cycles, or Students in the DOM, even though every one of those is now
    // a real link on the mentor list.
    render(<Sidebar role="Student" />);

    for (const item of ["Roster", "Review", "Cycles", "Students"]) {
      expect(screen.queryByText(new RegExp(item))).not.toBeInTheDocument();
    }
  });

  it("shows a review count on the Review link only when there is something to review", () => {
    // Task 14 turned Review into a real Link; the badge logic itself
    // (sidebar.tsx's showCount/badge) is unchanged and applies inside
    // whichever element wraps the label, link or span.
    //
    // Task 5 (Plan 7B) made `.nav-item` `display: flex` with `gap: 8px`
    // doing the label-to-badge spacing, and deleted the literal " " text
    // node that used to sit between them — so the rendered DOM has no space
    // between "Review" and the count. Asserting the exact string "Review 3"
    // would be asserting a layout detail, not the behaviour this test is
    // for, and would break again the next time the spacing mechanism
    // changes. A whitespace-tolerant match proves the same intent (the
    // count is present, and only when there is something to review)
    // without depending on how the gap is produced.
    //
    // Counter-intuitively, real-browser accessibility is not degraded by
    // the missing text node: flex items are blockified, and a real
    // browser's accessible-name computation inserts a separator between
    // the label and the badge, so a screen reader still announces them as
    // distinct segments. jsdom performs no layout, so dom-accessibility-api
    // has no such signal and concatenates the two bare as "Review3" — which
    // is exactly why this assertion must not encode jsdom's flattened view
    // of the DOM as if it were the real one.
    const { rerender } = render(<Sidebar role="Admin" reviewCount={3} />);
    const withCount = screen.getByRole("link", { name: /^Review/ });
    expect(withCount).not.toHaveAttribute("aria-disabled");
    expect(withCount.textContent).toMatch(/^Review\s*3$/);

    rerender(<Sidebar role="Admin" reviewCount={0} />);
    const withoutCount = screen.getByRole("link", { name: /^Review/ });
    expect(withoutCount).not.toHaveAttribute("aria-disabled");
    expect(withoutCount.textContent).toBe("Review");
  });
});
