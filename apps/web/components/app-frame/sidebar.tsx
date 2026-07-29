/**
 * The app frame's primary navigation. `navigation` landmark, 216px wide, on
 * `--surface` — docs/design-system.md §6. Desktop only (NFR-13); no
 * collapse/drawer treatment is provided in this task.
 *
 * `typedRoutes: true` (apps/web/next.config.ts) validates every `<Link
 * href>` against routes that actually exist, and none of these five do yet:
 * `apps/web/app/(app)/` currently holds only `layout.tsx`, no `page.tsx`, so
 * "/" itself has no page either — confirmed by the generated
 * `.next/types/routes.d.ts` (`PageRoutes: never`, `"/"` appears only under
 * `LayoutRoutes`, and `StaticRoutes` — the set `Link` accepts — is just
 * `/api/dev-jwks | /not-registered | /signin`). Linking to any of the five
 * fails `next build`, as it did before this comment existed. Rather than
 * disabling typedRoutes or stubbing empty pages, every destination renders
 * as a non-interactive item until its page lands: Today in this plan's own
 * Task 9 (`apps/web/app/(app)/page.tsx` + `middleware.ts`), Roster and
 * Students in Plan 6, Review and Cycles in Plan 7. Each becomes a real
 * `<Link href="...">` in the task that adds its page — no `as Route` casts
 * in the meantime.
 */
const DESTINATIONS = [
  { label: "Today" },
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
        return (
          <span
            key={d.label}
            aria-disabled="true"
            className="rounded-[var(--radius-control)] px-3 py-2"
            style={{ color: "var(--ink-muted)" }}
          >
            {d.label}
            {showCount && " "}
            {showCount && (
              <span className="tabular ml-2" style={{ color: "var(--ink-muted)" }}>
                {reviewCount}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
