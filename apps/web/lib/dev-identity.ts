import "server-only";

import { SignJWT, exportJWK, generateKeyPair } from "jose";
import type { JWK } from "jose";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
// Only subpaths of next-auth (./providers, ./providers/credentials) are
// otherwise imported here. TypeScript's module augmentation below needs the
// bare "next-auth" specifier registered as a resolved module in this file, or
// it fails with TS2664 even though `declare module "next-auth"` resolves the
// package fine on its own — an empty type-only import is enough to satisfy it.
import type {} from "next-auth";
import { DEV_IDENTITIES, DEV_ISSUER, type DevIdentity } from "@/lib/dev-identities";

/**
 * The dev bypass. It swaps the token ISSUER; it does NOT skip authentication.
 *
 * A real RS256 JWT is minted with a local key, and the matching public key is
 * published at /api/dev-jwks. apps/api validates it through createRemoteJWKSet
 * with its real jose code path — the exact production mechanism — so dev
 * exercises remote JWKS retrieval every day rather than only in CI.
 *
 * This module is imported ONLY when AUTH_DEV_BYPASS=true (see auth.ts), so it
 * is never EVALUATED in production — the top-level generateKeyPair() call
 * below never runs when the flag is off. It is NOT excluded from the
 * production bundle: a dynamic import with a literal specifier is statically
 * analyzable, so Turbopack still emits it as a lazy chunk. The guard that
 * actually enforces the block is auth.config.ts's
 * assertBypassNotInProduction, which refuses to boot if the flag is set with
 * NODE_ENV=production (case-insensitively).
 *
 * `import "server-only"` above makes any accidental import from a Client
 * Component (e.g. reaching for mintDevToken instead of the data-only
 * lib/dev-identities.ts) a build-time error rather than a runtime leak.
 */

declare module "next-auth" {
  interface User {
    /**
     * Set only by the dev identity provider. A Credentials sign-in produces no
     * account.access_token, so the minted token travels on the user object to
     * the jwt callback. Declared here, where it is invented, so producer and
     * consumer typecheck against one declaration.
     */
    devAccessToken?: string;
  }
}

const KID = "dev-key-1";

// Generated once per process and held here. Restarting apps/web invalidates
// outstanding sessions, which presents correctly as a 401 and a sign-out.
//
// generateKeyPair is called with NO second argument — the key is permitted
// to leave the process in one direction only, as a public JWK below.
// WebCrypto then refuses to export keyPair.privateKey as a JWK under any
// circumstance — exportJWK(publicKey) still works, because a public RSA key
// needs no such permission. This is a platform-enforced guarantee, not a
// convention: even a future edit that mistakenly reaches for
// keyPair.privateKey in an export path cannot publish private material,
// because the runtime itself refuses. See test/dev-identity.test.ts's
// "refuses to export the private key at all" case.
const keyPair = await generateKeyPair("RS256");

/** Test-only. Asserting the private key cannot be exported requires a handle to it. */
export const devKeyPairForTest = keyPair;

export async function devJwks(): Promise<{ keys: JWK[] }> {
  const jwk = await exportJWK(keyPair.publicKey);
  return { keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] };
}

export async function mintDevToken(identity: DevIdentity, audience: string): Promise<string> {
  return new SignJWT({ oid: identity.oid, email: identity.email, name: identity.name })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuedAt()
    .setIssuer(DEV_ISSUER)
    .setAudience(audience)
    .setExpirationTime("8h")
    .sign(keyPair.privateKey);
}

export function devIdentityProvider(): Provider {
  return Credentials({
    id: "dev-identity",
    name: "Development identity",
    credentials: { identityId: { label: "Identity", type: "text" } },
    authorize: async (credentials) => {
      const identityId = credentials.identityId;
      if (typeof identityId !== "string") return null;

      const identity = DEV_IDENTITIES.find((i) => i.id === identityId);
      if (identity === undefined) return null;

      const audience = process.env.API_SCOPE_AUDIENCE ?? "api://irp-progress-management";

      // Handed to the jwt callback as `user.devAccessToken`, because a
      // Credentials sign-in produces no account.access_token.
      return {
        id: identity.oid,
        email: identity.email,
        name: identity.name,
        devAccessToken: await mintDevToken(identity, audience),
      };
    },
  });
}
