import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

/**
 * The app frame's topbar. Semantic `banner` landmark, 56px tall, on
 * `--surface` — docs/design-system.md §6. Desktop only (NFR-13); no mobile
 * treatment is provided.
 *
 * Server Component (no "use client"), so the inline `"use server"` sign-out
 * action below is valid here without any extra wiring.
 */
export function Topbar({
  userName,
  batchName,
}: {
  userName: string;
  batchName?: string;
}) {
  return (
    <header
      role="banner"
      className="flex items-center justify-between border-b px-6"
      style={{ height: "56px", background: "var(--surface)", borderColor: "var(--line)" }}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true" style={{ color: "var(--primary)" }}>
          &#9670;
        </span>
        <span className="font-semibold" style={{ color: "var(--ink)" }}>
          Hearts Academy &middot; IRP
        </span>
      </div>

      <div className="flex items-center gap-6">
        {batchName !== undefined && (
          <span className="tabular" style={{ color: "var(--ink-muted)" }}>
            {batchName}
          </span>
        )}
        <span style={{ color: "var(--ink)" }}>{userName}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <Button type="submit" variant="quiet">Sign out</Button>
        </form>
      </div>
    </header>
  );
}
