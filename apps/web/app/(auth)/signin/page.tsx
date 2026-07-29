import { signIn } from "@/auth";
import { CycleRibbon, type RibbonDay } from "@/components/cycle-ribbon/cycle-ribbon";
import { DevIdentityPicker } from "./dev-identity-picker";

// Illustrative only. The ribbon is the real component (Plan 7 extends it with
// real data); these marks exist so the register idea lands before sign-in.
const ILLUSTRATION: RibbonDay[] = [
  { date: "2026-07-10", mark: "ok" },
  { date: "2026-07-13", mark: "ok" },
  { date: "2026-07-14", mark: "late" },
  { date: "2026-07-15", mark: "ok" },
  { date: "2026-07-16", mark: "absent" },
  { date: "2026-07-17", mark: "ok" },
  { date: "2026-07-20", mark: "partial", fill: 0.55 },
  { date: "2026-07-21", mark: "missed" },
  { date: "2026-07-22", mark: "ok" },
  { date: "2026-07-23", mark: "partial", fill: 0.4, isToday: true },
  { date: "2026-07-24", mark: "future" },
];

const bypassEnabled = process.env.AUTH_DEV_BYPASS === "true";

export default function SignInPage() {
  return (
    <div className="flex" style={{ minHeight: "100dvh" }}>
      <section
        className="flex flex-1 flex-col justify-center border-r px-16"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <CycleRibbon
          days={ILLUSTRATION}
          extraAfter={["2026-07-10"]}
          label="Cycle 2 · 10 Jul – 9 Aug"
        />
        <p className="mt-8 max-w-[42ch] text-base" style={{ color: "var(--ink-muted)" }}>
          A mark per working day. A page per month.
        </p>
      </section>

      <section className="flex flex-1 flex-col justify-center px-16">
        <span aria-hidden="true" className="mb-6 text-xl" style={{ color: "var(--primary)" }}>
          &#9670;
        </span>
        <h1 className="mb-2 text-2xl font-bold" style={{ color: "var(--ink)" }}>
          Hearts Academy
        </h1>
        <p className="mb-8 text-sm" style={{ color: "var(--ink-muted)" }}>
          Industry Readiness Programme
        </p>

        {bypassEnabled ? (
          <DevIdentityPicker />
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("microsoft-entra-id", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-[var(--radius-control)] px-4 py-2 font-semibold"
              style={{ background: "var(--primary)", color: "#ffffff" }}
            >
              Sign in with Microsoft
            </button>
          </form>
        )}

        <p className="tabular mt-8 text-xs" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
          Asia/Colombo &middot; UTC+05:30
        </p>
      </section>
    </div>
  );
}
