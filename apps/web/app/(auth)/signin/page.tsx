import { signIn } from "@/auth";
import { CycleRibbon, type RibbonDay } from "@/components/cycle-ribbon/cycle-ribbon";
import { isEntraConfigured } from "@/auth.config";
import { SignInPanel } from "./sign-in-panel";

// Rendered per request, NOT statically prerendered.
//
// Both bypassEnabled and entraConfigured are read from process.env, so the
// branch SignInPanel takes depends on the runtime environment. Next would
// otherwise prerender this page at BUILD time and bake one of the three states
// into signin.html — which was verified happening: /signin appeared in
// .next/prerender-manifest.json.
//
// The consequence was a trap rather than a cosmetic issue. The Plan 3 spec §7
// Entra cutover is documented as four config steps with NO code change, but
// with a baked page, setting the three AUTH_MICROSOFT_ENTRA_ID_* variables on
// the Container App would leave the "not configured" panel on screen until
// someone rebuilt the image. Do not remove this.
export const dynamic = "force-dynamic";

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
const entraConfigured = isEntraConfigured(process.env);

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

        <SignInPanel
          bypassEnabled={bypassEnabled}
          entraConfigured={entraConfigured}
          signInAction={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/" });
          }}
        />

        <p className="tabular mt-8 text-xs" style={{ color: "var(--ink-muted)", fontFamily: "var(--font-mono)" }}>
          Asia/Colombo &middot; UTC+05:30
        </p>
      </section>
    </div>
  );
}
