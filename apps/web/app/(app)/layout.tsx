import type { ReactNode } from "react";
import { Topbar } from "@/components/app-frame/topbar";
import { Sidebar } from "@/components/app-frame/sidebar";
import { getCurrentUserOrRedirect } from "@/lib/api-client";

// The (app) route group carries the app frame; (auth) does not. That split
// is a directory boundary, not runtime logic — filing a page here frames it,
// filing it under (auth) leaves it bare. Route groups do not affect URLs.
//
// This layout deliberately does NOT guard. Next.js layouts are cached across
// navigations and its own docs warn against relying on them for
// authorization — see Task 9's middleware.ts and, authoritatively, apps/api.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserOrRedirect();

  return (
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>
      <Topbar userName={user.displayName} />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-8" style={{ background: "var(--bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
