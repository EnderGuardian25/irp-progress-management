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
const VARIANTS = {
  mark: { src: mark, width: 32, height: 32, alt: "", padding: "4px", radius: "8px" },
  lockup: { src: lockup, width: 140, height: 134, alt: "Bistec Hearts Academy", padding: "16px", radius: "12px" },
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
