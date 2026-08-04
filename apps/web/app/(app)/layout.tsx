import type { ReactNode } from "react";
import { signOut } from "@/auth";
import { Topbar } from "@/components/app-frame/topbar";
import { Sidebar } from "@/components/app-frame/sidebar";
import { SignOutIcon } from "@/components/ui/icons";
import { getCurrentUserOrRedirect } from "@/lib/api-client";

// The (app) route group carries the app frame; (auth) does not. That split
// is a directory boundary, not runtime logic — filing a page here frames it,
// filing it under (auth) leaves it bare. Route groups do not affect URLs.
//
// This layout deliberately does NOT guard. Next.js layouts are cached across
// navigations and its own docs warn against relying on them for
// authorization — see proxy.ts and, authoritatively, apps/api.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserOrRedirect();

  return (
    // The frame is exactly one viewport tall and does not scroll; the content
    // column does. `h-[100dvh]` rather than `minHeight`, because a min-height
    // lets the whole document grow and take the topbar and sidebar with it.
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <Topbar userName={user.displayName} />
      {/*
        `min-h-0` is load-bearing and easy to drop. A flex item defaults to
        `min-height: auto`, which refuses to shrink below its content — so
        without it this row grows to fit the whole page and `overflow-y-auto`
        on <main> never has anything to clip.
      */}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          role={user.role}
          signOutSlot={
            /* Built HERE, in a Server Component, so the inline "use server"
               action stays valid — the sidebar is a client component and
               cannot import `@/auth`. */
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              {/* Styled as a nav row, not a Button, so the bottom group reads
                  as two peers. Still a form submit, so it is a real action
                  rather than a link. */}
              <button type="submit" className="nav-item w-full">
                <SignOutIcon />
                Sign out
              </button>
            </form>
          }
        />
        {/*
          NFR-13 sets a 1280px floor, not a ceiling, and nothing capped the
          content width — so on a wide monitor the composer textarea and the
          summary prose ran the full bleed. §4's "prose caps at 70ch, tables
          may run to full width" splits the difference: the cap here is
          generous enough that a table still gets its width, and prose blocks
          carry their own 70ch limit on top of it.
        */}
        {/* The one scroll container on the page. `min-w-0` lets a wide table
            clip and scroll here instead of pushing the frame sideways. */}
        <main
          className="min-w-0 flex-1 overflow-auto p-8"
          style={{ background: "var(--bg)" }}
        >
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
