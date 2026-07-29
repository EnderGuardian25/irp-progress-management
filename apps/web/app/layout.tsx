import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${plexMono.variable}`}>
      <body>
        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}
