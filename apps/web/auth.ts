import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import { authConfig } from "./auth.config";

// The guard (assertBypassNotInProduction) runs at auth.config.ts's module
// scope, not here. This module already imports auth.config.ts below, so
// that call has already executed by the time this line is reached — calling
// it again here would be redundant, not additional coverage. auth.config.ts
// is the one that must self-invoke, because proxy.ts imports it
// directly without going through this file.
const bypassEnabled = process.env.AUTH_DEV_BYPASS === "true";

// Guard two: the dev module is imported only under the flag, so it is never
// EVALUATED in production — its top-level generateKeyPair() call never runs.
// This is NOT bundle exclusion: a dynamic import with a literal specifier is
// statically analyzable, and Turbopack still emits it as a lazy chunk rather
// than removing it. The guard that actually enforces the block is
// auth.config.ts's assertBypassNotInProduction. Keep this as a dynamic
// import anyway — a static one would evaluate the module (and its top-level
// key generation) unconditionally at load time, bypass flag or not.
const devProviders: Provider[] = bypassEnabled
  ? [(await import("./lib/dev-identity")).devIdentityProvider()]
  : [];

// The callbacks live in auth.config.ts and are shared by both configs, so the
// invariant Task 7 tests is the same one production uses. Do not re-declare
// them here — a second copy is a second thing to keep in step.
const providers: Provider[] = [...authConfig.providers, ...devProviders];

// WARN, do not throw. authConfig omits the Entra provider when it is not
// configured (see isEntraConfigured — registering it with an empty issuer makes
// Auth.js throw InvalidEndpoints on EVERY auth request, which is how CI broke).
// Combined with the bypass being off, that leaves ZERO providers, and Auth.js's
// own failure for that is an opaque "problem with the server configuration" on
// first sign-in. This says what is actually wrong.
//
// It must NOT throw, though: `next build` prerenders /api/auth/[...nextauth],
// which evaluates this module, and a build legitimately has no secrets — they
// are supplied at runtime. An earlier version threw here and broke the build on
// all three CI legs with "Failed to collect page data". Module evaluation is the
// wrong place to enforce a runtime requirement.
if (providers.length === 0) {
  console.warn(
    "[auth] No auth providers are configured, so every sign-in will fail. " +
      "Set the three AUTH_MICROSOFT_ENTRA_ID_* variables, or AUTH_DEV_BYPASS=true " +
      "for local development. See apps/web/.env.example. " +
      "(Expected during `next build`, which has no secrets.)",
  );
}

const config: NextAuthConfig = { ...authConfig, providers };

export const { handlers, auth, signIn, signOut } = NextAuth(config);
