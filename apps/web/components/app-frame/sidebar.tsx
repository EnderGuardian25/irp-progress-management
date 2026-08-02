import Link from "next/link";

/**
 * The app frame's primary navigation. `navigation` landmark, 216px wide, on
 * `--surface` — docs/design-system.md §6. Desktop only (NFR-13); no
 * collapse/drawer treatment is provided in this task.
 *
 * `typedRoutes: true` (apps/web/next.config.ts) validates every `<Link
 * href>` against routes that actually exist. Task 9 added
 * `apps/web/app/(app)/page.tsx`, so "/" is a real route and Today is a real
 * link on both destination lists. Task 13 added `apps/web/app/(app)/roster/
 * page.tsx`, so Roster is now a real link; Task 14 added
 * `apps/web/app/(app)/review/page.tsx`, so Review is now a real link too —
 * but only on the mentor list. Cycles still has no page (Plan 7) and
 * Students keeps its href out until Task 15 even though its page doesn't
 * exist yet either. Each destination becomes a real `<Link href="...">` in
 * the task that adds its page — no `as Route` casts in the meantime.
 *
 * Navigation is role-gated, not just link-gated: a Student never sees
 * mentor-only destinations (Roster, Review, Cycles, Students) at all, rather
 * than seeing them disabled. Students get their own two-item list; "My
 * month" stays label-only until Plan 7.
 *
 * Task 15 added `apps/web/app/(app)/students/page.tsx`, so Students is now a
 * real link too. Cycles still has no page (Plan 7) and stays label-only.
 */
const MENTOR_DESTINATIONS = [
  { label: "Today", href: "/" },
  { label: "Roster", href: "/roster" },
  { label: "Review", href: "/review" },
  { label: "Cycles" },
  { label: "Students", href: "/students" },
] as const;

const STUDENT_DESTINATIONS = [
  { label: "Today", href: "/" },
  { label: "My month" },
] as const;

export function Sidebar({
  role,
  reviewCount = 0,
}: {
  role: "Admin" | "Student";
  reviewCount?: number;
}) {
  const destinations = role === "Admin" ? MENTOR_DESTINATIONS : STUDENT_DESTINATIONS;

  return (
    <nav
      aria-label="Primary"
      className="flex flex-col gap-1 border-r p-4"
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
          return (
            <Link
              key={d.label}
              href={d.href}
              className="rounded-[var(--radius-control)] px-3 py-2"
              style={{ color: "var(--ink-muted)" }}
            >
              {d.label}
              {showCount && " "}
              {badge}
            </Link>
          );
        }

        return (
          <span
            key={d.label}
            aria-disabled="true"
            className="rounded-[var(--radius-control)] px-3 py-2"
            style={{ color: "var(--ink-muted)" }}
          >
            {d.label}
            {showCount && " "}
            {badge}
          </span>
        );
      })}
    </nav>
  );
}
