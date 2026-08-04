"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

/**
 * The app frame's primary navigation. `navigation` landmark, 216px wide, on
 * `--surface` — docs/design-system.md §6. Desktop only (NFR-13); no
 * collapse/drawer treatment is provided in this task.
 *
 * `typedRoutes: true` (apps/web/next.config.ts) validates every `<Link
 * href>` against routes that actually exist. Every destination on both
 * lists is now a real link: Task 9 added `apps/web/app/(app)/page.tsx`
 * ("/", Today); Task 13 added `.../roster/page.tsx` (Roster); Task 14 added
 * `.../review/page.tsx` (Review, mentor list only); Task 15 added
 * `.../students/page.tsx` (Students); Task 7 added `.../cycles/page.tsx`
 * (Cycles); Task 8 added `.../my-month/page.tsx`, so "My month" joined the
 * others last. Each destination became a real `<Link href="...">` in the
 * task that added its page — no `as Route` cast was needed in the meantime.
 *
 * The current destination is marked with `aria-current="page"` and the
 * `--primary-weak` active-nav fill §3.1 reserves for it. This is a client
 * component solely because that needs `usePathname`; nothing else here is
 * interactive.
 *
 * Navigation is role-gated, not just link-gated: a Student never sees
 * mentor-only destinations (Roster, Review, Cycles, Students) at all, rather
 * than seeing them disabled. Students get their own two-item list.
 *
 * The label-only rendering branch below is kept even with no destination
 * currently using it: it is what lets a future destination be added to
 * either list before its page exists, without an `as Route` cast.
 *
 * `Destination` is a real union, not inferred from the array literals: once
 * every entry on both lists carries an `href`, inference alone would narrow
 * `"href" in d ? ... : ...`'s else branch to `never` and the label-only
 * rendering path would fail to typecheck even though it must stay reachable
 * for a future label-only entry.
 */
interface LinkedDestination {
  readonly label: string;
  readonly href: Route;
}
interface LabelOnlyDestination {
  readonly label: string;
}
type Destination = LinkedDestination | LabelOnlyDestination;

const MENTOR_DESTINATIONS: readonly Destination[] = [
  { label: "Today", href: "/" },
  { label: "Roster", href: "/roster" },
  { label: "Review", href: "/review" },
  { label: "Cycles", href: "/cycles" },
  { label: "Students", href: "/students" },
];

const STUDENT_DESTINATIONS: readonly Destination[] = [
  { label: "Today", href: "/" },
  { label: "My month", href: "/my-month" },
];

/**
 * Settings is NOT appended to either role list. Those render in document order
 * inside a `flex flex-col`, so an appended entry would sit directly under the
 * last primary destination rather than at the bottom of the column.
 *
 * It is also on BOTH roles' frames: the theme is a personal preference, and the
 * page gates its mentor-only sections itself (settings/page.tsx). A Student
 * following this link gets a page with one section, not a redirect.
 */
const SETTINGS_DESTINATION: LinkedDestination = { label: "Settings", href: "/settings" };

/**
 * "/" must match exactly — every other path also starts with it, so a prefix
 * test would light up Today on every screen in the app. The prefix test is
 * what the rest need: /review/<studentId> has to keep Review marked, since
 * that page has no nav entry of its own.
 */
function isActive(pathname: string, href: Route): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  role,
  reviewCount = 0,
}: {
  role: "Admin" | "Student";
  reviewCount?: number;
}) {
  const destinations = role === "Admin" ? MENTOR_DESTINATIONS : STUDENT_DESTINATIONS;
  // usePathname is why this is a client component. The alternative — threading
  // the path down from the server layout — is not available: a layout does not
  // re-render on navigation within its own segment, so the prop would go stale
  // exactly when the highlight needs to move.
  const pathname = usePathname();

  return (
    // shrink-0 so the fixed 216px column is never squeezed by a wide table in
    // the content area; overflow-y-auto so the nav itself scrolls rather than
    // overflowing the frame if the list ever outgrows a short viewport.
    <nav
      aria-label="Primary"
      className="flex shrink-0 flex-col gap-1 overflow-y-auto border-r p-4"
      style={{ width: "216px", background: "var(--surface)", borderColor: "var(--line)" }}
    >
      {destinations.map((d) => {
        const showCount = d.label === "Review" && reviewCount > 0;
        const badge = showCount && (
          <span className="tabular ml-2" style={{ color: "var(--ink-muted)" }}>
            {reviewCount}
          </span>
        );

        if ("href" in d) {
          const active = isActive(pathname, d.href);
          return (
            <Link
              key={d.label}
              href={d.href}
              // aria-current is the non-visual half of the same signal: §12
              // does not let colour alone carry meaning, and "which page am I
              // on" is meaning.
              aria-current={active ? "page" : undefined}
              className="nav-item"
              data-active={active || undefined}
            >
              {d.label}
              {showCount && " "}
              {badge}
            </Link>
          );
        }

        return (
          <span key={d.label} aria-disabled="true" className="nav-item">
            {d.label}
            {showCount && " "}
            {badge}
          </span>
        );
      })}
      {/* mt-auto is what pins this to the bottom — a margin guess would drift
          as the primary list grows. The divider separates "where you work"
          from "how it looks". */}
      <div
        className="mt-auto border-t pt-1"
        style={{ borderColor: "var(--line)" }}
      >
        <Link
          href={SETTINGS_DESTINATION.href}
          aria-current={isActive(pathname, SETTINGS_DESTINATION.href) ? "page" : undefined}
          className="nav-item"
          data-active={isActive(pathname, SETTINGS_DESTINATION.href) || undefined}
        >
          {SETTINGS_DESTINATION.label}
        </Link>
      </div>
    </nav>
  );
}
