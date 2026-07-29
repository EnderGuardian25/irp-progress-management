import Link from "next/link";

/**
 * The app frame's primary navigation. `navigation` landmark, 216px wide, on
 * `--surface` — docs/design-system.md §6. Desktop only (NFR-13); no
 * collapse/drawer treatment is provided in this task.
 *
 * `typedRoutes: true` (apps/web/next.config.ts) validates every `<Link
 * href>` against routes that actually exist. Task 9 added
 * `apps/web/app/(app)/page.tsx`, so "/" is now a real route and Today is a
 * real link. Roster, Review, Cycles and Students still have no page —
 * Roster and Students land in Plan 6, Review and Cycles in Plan 7 — so they
 * stay non-interactive items until the task that adds each one's page. Each
 * becomes a real `<Link href="...">` in that task — no `as Route` casts in
 * the meantime.
 */
const DESTINATIONS = [
  { label: "Today", href: "/" },
  { label: "Roster" },
  { label: "Review" },
  { label: "Cycles" },
  { label: "Students" },
] as const;

export function Sidebar({ reviewCount = 0 }: { reviewCount?: number }) {
  return (
    <nav
      aria-label="Primary"
      className="flex flex-col gap-1 border-r p-4"
      style={{ width: "216px", background: "var(--surface)", borderColor: "var(--line)" }}
    >
      {DESTINATIONS.map((d) => {
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
