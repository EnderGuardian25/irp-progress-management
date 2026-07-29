import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import { assertBypassNotInProduction, authConfig } from "./auth.config";

assertBypassNotInProduction(process.env);

const bypassEnabled = process.env.AUTH_DEV_BYPASS === "true";

// Guard two, structural: the dev module is imported only under the flag, so a
// production bundle does not contain it and a leaked env var has nothing to
// enable. Keep this as a dynamic import — a static one would bundle it always.
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
