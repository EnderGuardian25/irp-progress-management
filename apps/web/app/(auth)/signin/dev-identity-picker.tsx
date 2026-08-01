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
          // Colours as utilities, not inline style — an inline borderColor
          // outranks hover:border-* and silently kills the hover state.
          className="cursor-pointer rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-left text-ink transition duration-150 ease-out-quart hover:border-primary hover:bg-primary-weak active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0"
        >
          {identity.label}
        </button>
      ))}
    </div>
  );
}
