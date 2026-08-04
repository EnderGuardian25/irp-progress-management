import Image from "next/image";
import mark from "@/assets/hearts-academy-mark.png";
import lockup from "@/assets/hearts-academy-lockup.png";

/**
 * The Bistec Hearts Academy brand asset. ASSUMPTION: O-15 — the brand changes
 * map to no FR and were requested directly after a review of the running app.
 *
 * Two variants because the asset is a STACKED lockup (mark above a three-line
 * wordmark) and the topbar is 56px tall: the whole lockup fits there at ~40px,
 * at which the wordmark is illegible. So the frame gets the mark alone and the
 * auth pages, which have room, get the full lockup.
 *
 * The card is var(--brand-card) — the one deliberately theme-invariant token
 * (design-system §3). The wordmark is near-black green on a light field, so a
 * card that followed the theme would erase it in dark.
 *
 * Imported statically rather than served from public/: apps/web/public/ does
 * not exist and Dockerfile:231-232 records that a COPY of it fails the build,
 * whereas .next/static is already copied at :230. A static import lands in
 * .next/static and reaches the production image with no Dockerfile change.
 */
/**
 * `lockup.height` is 133, not the 140x134-implies-aspect-1.04478 you'd expect
 * from `width: 140` — READ THIS BEFORE "fixing" it back to 134.
 *
 * Next.js's dev-only image warning ("has either width or height modified,
 * but not the other") does not inspect CSS or the `style` prop at all — its
 * check, `apps/web/node_modules/next/dist/client/image-component.js` around
 * `heightModified`/`widthModified`, purely compares the live
 * `HTMLImageElement.height`/`.width` IDL properties (the actual rendered
 * size) against the `height`/`width` HTML ATTRIBUTES after load. Tailwind's
 * preflight applies `height: auto` to every `<img>` globally, and — because
 * this asset HAS a natural intrinsic size — the CSS auto-sizing algorithm
 * uses that natural ratio (256x244) over the attribute-derived one (140x134)
 * regardless of any `style` prop you add; **an explicit `style={{ height:
 * "auto" }}` on the `Image` was tried here and measured (via a real browser,
 * not reasoning) to change NOTHING — the preflight rule already forces the
 * exact same thing, so it is a pure no-op and was removed.** The only lever
 * that actually silences this specific check, without changing the visible
 * size, is making the declared attribute match what will actually render:
 * at `width: 140` against this asset's true 256x244 pixels, the rendered
 * height is `140 * 244 / 256 = 133.4375`, which the browser reports via the
 * `.height` IDL as `133` (rounded). Hence `height: 133` here, not 134.
 *
 * **This value is derived from `hearts-academy-lockup.png`'s CURRENT pixel
 * dimensions (256x244) and MUST be recomputed if that asset is ever
 * regenerated** — this is exactly the failure mode that produced the
 * original bug: Task 3's transparent-field trim changed the asset from the
 * 1080x1031-derived assumption to 256x244, and the declared `height: 134`
 * was never updated to match. If the asset changes again: read its new
 * pixel dimensions, then set `height = round(140 * naturalHeight /
 * naturalWidth)`.
 */
const VARIANTS = {
  mark: { src: mark, width: 32, height: 32, alt: "", padding: "4px", radius: "8px" },
  lockup: { src: lockup, width: 140, height: 133, alt: "Bistec Hearts Academy", padding: "16px", radius: "12px" },
} as const;

export function BrandMark({ variant }: { variant: "mark" | "lockup" }) {
  const v = VARIANTS[variant];

  return (
    <span
      className="inline-flex items-center justify-center"
      style={{ background: "var(--brand-card)", padding: v.padding, borderRadius: v.radius }}
    >
      <Image src={v.src} alt={v.alt} width={v.width} height={v.height} priority />
    </span>
  );
}
