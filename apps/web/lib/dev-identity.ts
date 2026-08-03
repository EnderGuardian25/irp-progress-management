import "server-only";

import { SignJWT, calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";
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

// Generated once per PROCESS and cached on globalThis. Restarting apps/web
// invalidates outstanding sessions, which presents correctly as a 401 and a
// sign-out.
//
// The globalThis cache is load-bearing, not a micro-optimisation. A module
// constant is per module INSTANCE, and Next's dev server does not guarantee
// one instance per process: `/api/dev-jwks` and `/api/auth/[...nextauth]` are
// separate entry points, and a hot reload can leave them holding separate
// evaluations of this module. Each evaluation ran its own generateKeyPair, so
// the route that PUBLISHES the public key and the route that SIGNS tokens
// drifted onto different keypairs — and every sign-in then failed with
// JWKSNoMatchingKey, permanently, until the web server was restarted.
//
// It was viciously misleading to diagnose: it only appears after editing some
// unrelated file under apps/web, it hits every dev identity at once, it looks
// exactly like broken auth or a missing seed row, and restarting apps/api
// appears to fix it (it does not — that only clears a different, secondary
// staleness). Measured directly: the token carried kid 3V2IMvix… while
// /api/dev-jwks served AIklSHMs…, from one dev server.
//
// generateKeyPair is called with NO second argument — the key is permitted
// to leave the process in one direction only, as a public JWK below.
// WebCrypto then refuses to export keyPair.privateKey as a JWK under any
// circumstance — exportJWK(publicKey) still works, because a public RSA key
// needs no such permission. This is a platform-enforced guarantee, not a
// convention: even a future edit that mistakenly reaches for
// keyPair.privateKey in an export path cannot publish private material,
// because the runtime itself refuses. See test/dev-identity.test.ts's
// "refuses to export the private key at all" case. Caching the handle on
// globalThis does not weaken that: what is stored is a non-extractable
// CryptoKey handle, not key material, and this module is only ever evaluated
// when AUTH_DEV_BYPASS=true.
const devKeyCache = globalThis as typeof globalThis & {
  __irpDevKeyPair?: CryptoKeyPair;
};
devKeyCache.__irpDevKeyPair ??= await generateKeyPair("RS256");
const keyPair = devKeyCache.__irpDevKeyPair;

/** Test-only. Asserting the private key cannot be exported requires a handle to it. */
export const devKeyPairForTest = keyPair;

const publicJwk = await exportJWK(keyPair.publicKey);

/**
 * The RFC 7638 thumbprint of the public key, NOT a fixed string.
 *
 * The kid was hardcoded to "dev-key-1", which made key identity a lie: any
 * two keypairs claimed the same id. That mattered twice over. `apps/api`
 * verifies with `createRemoteJWKSet`, which only refetches a JWKS when it
 * meets a kid it does not already hold — so a matching-but-stale kid is a
 * cache hit, and the API kept verifying against a key that no longer existed.
 * It also hid the keypair split described above behind a signature error
 * instead of naming it.
 *
 * A thumbprint is a pure function of the key material, so a new key is
 * necessarily a new kid: the API reads it as unknown and refetches (subject
 * to jose's 30s cooldown) rather than trusting its cache. Do not replace this
 * with a constant. It is the honest-identity half of the fix; the globalThis
 * cache above is the half that stops two keys existing at all.
 */
const KID = await calculateJwkThumbprint(publicJwk, "sha256");

/**
 * Returns a Promise despite having nothing left to await: the JWK and its
 * thumbprint are now computed once at module load rather than per call, but
 * every caller (the route and the tests) awaits this, and awaiting a
 * non-thenable is its own lint error. Keeping the contract is cheaper than
 * churning the call sites for a shape that may need to be async again.
 */
export function devJwks(): Promise<{ keys: JWK[] }> {
  return Promise.resolve({ keys: [{ ...publicJwk, kid: KID, alg: "RS256", use: "sig" }] });
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