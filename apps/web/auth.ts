import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import { authConfig } from "./auth.config";

// The guard (assertBypassNotInProduction) runs at auth.config.ts's module
// scope, not here. This module already imports auth.config.ts below, so
// that call has already executed by the time this line is reached — calling
// it again here would be redundant, not additional coverage. auth.config.ts
// is the one that must self-invoke, because middleware.ts imports it
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
const config: NextAuthConfig = {
  ...authConfig,
  providers: [...authConfig.providers, ...devProviders],
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
