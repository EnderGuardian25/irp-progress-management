import { signOut } from "@/auth";

// Terminal state — never link to /signin. The session here is VALID (the
// user authenticated fine), it is just not registered on the programme, so
// proxy.ts's `authorized` check would see a valid session and bounce a
// /signin link straight back here: an infinite loop. Signing out first is
// the only way out, which is why the only control on this page is sign-out.
export default function NotRegisteredPage() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: "100dvh" }}>
      <div className="max-w-[52ch] px-8">
        <h1 className="mb-3 text-2xl font-bold" style={{ color: "var(--ink)" }}>
          Your account is not registered
        </h1>
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
          <button
            type="submit"
            className="cursor-pointer rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-ink transition duration-150 ease-out-quart hover:border-primary hover:bg-primary-weak active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
