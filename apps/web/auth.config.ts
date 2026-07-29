import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraId from "next-auth/providers/microsoft-entra-id";

/**
 * The enforcing guard. A bypass reaching production is unauthenticated access
 * to student personal data, so this refuses to boot rather than degrading.
 *
 * Guard two, in lib/dev-identity.ts's docblock, is NOT bundle exclusion —
 * that module is imported dynamically with a literal specifier, which is
 * statically analyzable, so Turbopack still emits it as a lazy chunk rather
 * than removing it. What guard two actually guarantees is that the module is
 * never EVALUATED in production (its top-level key generation never runs),
 * because the dynamic import is gated on this same flag. This function is the
 * one that structurally enforces the block.
 *
 * Exact string comparison on AUTH_DEV_BYPASS is deliberate — "1", "TRUE" and
 * "yes" must NOT enable a bypass, so they must not trip the guard either.
 *
 * The NODE_ENV comparison is deliberately the OPPOSITE: case-insensitive, so
 * the guard fires MORE often, not less. A container that sets NODE_ENV to
 * "Production" (capitalized) must still trip this guard — an exact-match
 * comparison here would let a live bypass through on a technicality. The two
 * checks have opposite risk profiles: the flag that enables the bypass must
 * be matched exactly (narrow), and the check that blocks it must be matched
 * loosely (broad).
 */
// `| undefined` is explicit, not redundant with the optional `?` — the
// tsconfig sets exactOptionalPropertyTypes, under which an optional property
// accepts *omission* but not an explicitly-assigned `undefined` unless the
// property's type says so. The existing "unset AUTH_DEV_BYPASS" test case
// passes `undefined` as a value, so the type must allow that explicitly.
type BypassGuardEnv = Partial<Record<"NODE_ENV" | "AUTH_DEV_BYPASS", string | undefined>>;

export function assertBypassNotInProduction(env: BypassGuardEnv): void {
  if (env.AUTH_DEV_BYPASS === "true" && env.NODE_ENV?.toLowerCase() === "production") {
    throw new Error(
      "AUTH_DEV_BYPASS is set in a production build. Refusing to start. " +
        "This flag mints tokens with a local key and must never run in production.",
    );
  }
}

// proxy.ts imports auth.config.ts directly. Without this call living here, a
// request that only loads proxy.ts would boot clean with AUTH_DEV_BYPASS=true
// in production; only a page or route that also pulls in @/auth would trip the
// guard. Since Plan 4A (ADR-0013), proxy.ts runs on Node rather than the Edge,
// so process.env is plainly available — but this call must stay regardless:
// its purpose is per-entry-point coverage, not runtime compatibility.
assertBypassNotInProduction(process.env);

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

/**
 * Is the Entra provider actually configured?
 *
 * This has to be checked, and the provider omitted when it is not, because
 * registering MicrosoftEntraId with an empty `issuer` makes Auth.js throw
 * `InvalidEndpoints` on EVERY auth request — including requests targeting a
 * completely different provider. So an unconfigured Entra provider does not
 * merely fail to work: it takes the whole auth handler down with it, dev
 * bypass included.
 *
 * That is exactly how it failed on the first CI run after Plan 3 merged. It
 * passed locally only because `.env.example`'s placeholder
 * `AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0`
 * is NON-EMPTY, which satisfied the validation with a bogus value. CI has no
 * `.env.local`, so the issuer was "" and every sign-in returned
 * "There was a problem with the server configuration".
 *
 * The premise of the dev bypass is that it works with no Entra configuration
 * at all. This is what makes that true, and it mirrors how the dev provider is
 * itself conditional — neither provider is registered unless it can work.
 */
export function isEntraConfigured(env: Partial<Record<string, string>>): boolean {
  // Trimmed, so a variable left as whitespace in a .env file counts as unset
  // rather than as a configured-but-broken issuer.
  const present = (v: string | undefined): boolean => (v ?? "").trim() !== "";
  return (
    present(env.AUTH_MICROSOFT_ENTRA_ID_ID) &&
    present(env.AUTH_MICROSOFT_ENTRA_ID_SECRET) &&
    present(env.AUTH_MICROSOFT_ENTRA_ID_ISSUER)
  );
}

export const authConfig: NextAuthConfig = {
  providers: isEntraConfigured(process.env)
    ? [
        MicrosoftEntraId({
          // Non-null assertions are safe: isEntraConfigured just proved all
          // three are present and non-empty.
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
          issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!,
          authorization: {
            params: { scope: `openid profile email ${process.env.API_SCOPE ?? ""}`.trim() },
          },
        }),
      ]
    : [],
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
