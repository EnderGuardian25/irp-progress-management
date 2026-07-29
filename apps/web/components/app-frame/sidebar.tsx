import Link from "next/link";

/**
 * The app frame's primary navigation. `navigation` landmark, 216px wide, on
 * `--surface` — docs/design-system.md §6. Desktop only (NFR-13); no
 * collapse/drawer treatment is provided in this task.
 */
const DESTINATIONS = [
  { href: "/", label: "Today" },
  { href: "/roster", label: "Roster" },
  { href: "/review", label: "Review" },
  { href: "/cycles", label: "Cycles" },
  { href: "/students", label: "Students" },
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
        return (
          <Link
            key={d.href}
            href={d.href}
            className="rounded-[var(--radius-control)] px-3 py-2"
            style={{ color: "var(--ink)" }}
          >
            {d.label}
            {showCount && " "}
            {showCount && (
              <span className="tabular ml-2" style={{ color: "var(--ink-muted)" }}>
                {reviewCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
