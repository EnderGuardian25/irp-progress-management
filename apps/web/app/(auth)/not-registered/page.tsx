import { signOut } from "@/auth";
import { PageTitle } from "@/components/ui/page-title";
import { Button } from "@/components/ui/button";

// Terminal state — never link to /signin. The session here is VALID (the
// user authenticated fine), it is just not registered on the programme, so
// proxy.ts's `authorized` check would see a valid session and bounce a
// /signin link straight back here: an infinite loop. Signing out first is
// the only way out, which is why the only control on this page is sign-out.
export default function NotRegisteredPage() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: "100dvh" }}>
      <div className="max-w-[52ch] px-8">
        <PageTitle>Your account is not registered</PageTitle>
        <p className="mb-6 text-base" style={{ color: "var(--ink-muted)" }}>
          You signed in successfully, but no one has registered you on the programme yet.
          There is no self-registration — ask a mentor to add you, then sign in again.
        </p>

        {/* Deliberately sign-out, NOT a link to /signin. The session is valid,
            so /signin would redirect back here and loop forever. */}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <Button type="submit" variant="quiet">Sign out</Button>
        </form>
      </div>
    </div>
  );
}
