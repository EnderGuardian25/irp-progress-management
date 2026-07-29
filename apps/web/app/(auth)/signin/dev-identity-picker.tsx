"use client";

import { signIn } from "next-auth/react";
import { DEV_IDENTITIES } from "@/lib/dev-identities";

// DEV_IDENTITIES comes from lib/dev-identities.ts, NOT lib/dev-identity.ts.
// The former is data-only (labels and opaque oids, no secrets); the latter
// carries `import "server-only"`, jose, and a top-level generateKeyPair call,
// so importing it here would try to run key generation in the browser and
// fail the build. See lib/dev-identities.ts's docblock for the full split.
export function DevIdentityPicker() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs" style={{ color: "var(--st-late)" }}>
        Development sign-in. Tokens are minted with a local key; Microsoft Entra is not contacted.
      </p>

      {DEV_IDENTITIES.map((identity) => (
        <button
          key={identity.id}
          type="button"
          onClick={() => void signIn("dev-identity", { identityId: identity.id, redirectTo: "/" })}
          className="rounded-[var(--radius-control)] border px-4 py-2 text-left"
          style={{ borderColor: "var(--line-strong)", color: "var(--ink)" }}
        >
          {identity.label}
        </button>
      ))}
    </div>
  );
}
