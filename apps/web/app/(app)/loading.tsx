/**
 * The (app) group's loading boundary. There was none, anywhere — every page is
 * an async Server Component issuing two or three API calls, so until they
 * resolved the frame rendered with an empty content area and no signal that
 * anything was coming.
 *
 * §9: "Skeletons for loading, never a centred spinner." One shared skeleton
 * rather than per-route ones: it stands in for the shape every page in this
 * group actually has — a title, a wide summary block, then a stack of panels —
 * and a skeleton that matched each route exactly would be a second copy of
 * that route's layout to keep in sync.
 *
 * `aria-busy` + a polite live region: a screen reader gets told the page is
 * loading rather than reading a wall of empty boxes. The bars themselves are
 * `aria-hidden` for the same reason.
 */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div aria-hidden="true">
        <div className="skeleton mb-6 h-8 w-48" />
        <div className="skeleton mb-6 h-32 w-full" />
        <div className="flex flex-col gap-4">
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
