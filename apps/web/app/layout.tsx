import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

// next/font/google downloads at build time and self-hosts, so there is no
// runtime dependency on Google's CDN.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hearts Academy · IRP",
  description: "Industry Readiness Programme progress management",
};

export function PageShell({ children }: { children: ReactNode }) {
  // Desktop only, min 1280px (NFR-13). No mobile layout is provided or tested.
  return <div className="min-h-dvh min-w-[1280px]">{children}</div>;
}

/**
 * ASSUMPTION: O-14 — the theme switch maps to no FR and closes ADR-0002.
 *
 * Reading the cookie HERE, on the server, is the whole point: the attribute is
 * in the initial HTML, so there is no flash of the wrong theme and no blocking
 * inline script. See ADR-0021.
 *
 * Known cost, accepted: a cookie read makes the root layout dynamic, so
 * /_not-found and /not-registered are no longer prerendered (they show as `ƒ`
 * rather than `○` in `next build` output). Stamping a wrapper <div> instead
 * would keep them static — custom properties inherit — but <body>'s own canvas
 * sits outside that wrapper, so the page edges would keep the previous theme.
 *
 * "system" deliberately stamps NOTHING. An absent attribute is what lets
 * globals.css's `@media (prefers-color-scheme: dark)` rule apply, so following
 * the OS needs no value of its own.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${plexMono.variable}`}
      {...(theme !== "system" && { "data-theme": theme })}
    >
      <body>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
