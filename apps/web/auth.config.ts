import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";

/**
 * Guard one of two. A bypass reaching production is unauthenticated access to
 * student personal data, so this refuses to boot rather than degrading.
 *
 * Guard two is structural: lib/dev-identity.ts is excluded from the production
 * bundle (see auth.ts), so even a leaked env var has nothing to enable.
 *
 * Exact string comparison is deliberate — "1", "TRUE" and "yes" must NOT enable
 * a bypass, so they must not trip the guard either.
 */
export function assertBypassNotInProduction(env: NodeJS.ProcessEnv): void {
  if (env.AUTH_DEV_BYPASS === "true" && env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_DEV_BYPASS is set in a production build. Refusing to start. " +
        "This flag mints tokens with a local key and must never run in production.",
    );
  }
}

/**
 * Goes into the ENCRYPTED, HTTP-ONLY cookie. Server-only.
 *
 * Exported separately so it is directly testable — see Task 7's token-leak
 * test. Keeping it inline in a config literal would leave the invariant
 * assertable only end-to-end.
 *
 * `user.devAccessToken` typechecks directly — no cast — because Task 6's
 * `lib/dev-identity.ts` carries a `declare module "next-auth" { interface
 * User { devAccessToken?: string } }` augmentation, colocated with the
 * provider that invents the field. `next-auth`'s own `User` type has no such
 * property and excess-property checking does not fire through the
 * `Awaitable<User | null>` union `authorize()` returns, so without that
 * augmentation a rename of the field in dev-identity.ts would break this
 * callback at runtime with zero compile error.
 */
export const jwtCallback: NonNullable<NextAuthConfig["callbacks"]>["jwt"] = ({
  token,
  account,
  user,
}) => {
  if (account?.access_token !== undefined) {
    token.accessToken = account.access_token;
  }
  // The dev provider returns its minted token on the user object, because a
  // Credentials sign-in produces no account.access_token.
  if (user?.devAccessToken !== undefined) {
    token.accessToken = user.devAccessToken;
  }
  return token;
};

/**
 * This return value is what auth() gives a Server Component AND what the
 * browser's GET /api/auth/session returns.
 *
 * The access token is deliberately ABSENT — exposing it here would hand the
 * browser a bearer credential and destroy the whole design (spec §4.1).
 *
 * `role` is absent too, on purpose: it would be a second source of truth
 * competing with the User row. The authoritative role comes from
 * GET /api/v1/me (spec §4.1a).
 *
 * It takes `token` and deliberately copies NOTHING off it. That is the
 * invariant Task 7 tests: given a token carrying accessToken and role, the
 * session must carry neither.
 */
export const sessionCallback: NonNullable<NextAuthConfig["callbacks"]>["session"] = ({
  session,
}) => session;

export const authConfig: NextAuthConfig = {
  providers: [
    MicrosoftEntraId({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "",
      authorization: {
        params: { scope: `openid profile email ${process.env.API_SCOPE ?? ""}`.trim() },
      },
    }),
  ],
  pages: { signIn: "/signin" },
  session: { strategy: "jwt" },
  callbacks: {
    // UX redirect only. NOT the security boundary — that is apps/api.
    authorized({ auth: session }) {
      return session?.user != null;
    },
    jwt: jwtCallback,
    session: sessionCallback,
  },
};
