import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";

/**
 * The dev bypass. It swaps the token ISSUER; it does NOT skip authentication.
 *
 * A real RS256 JWT is minted with a local key, and the matching public key is
 * published at /api/dev-jwks. apps/api validates it through createRemoteJWKSet
 * with its real jose code path — the exact production mechanism — so dev
 * exercises remote JWKS retrieval every day rather than only in CI.
 *
 * This module is imported ONLY when AUTH_DEV_BYPASS=true (see auth.ts), so it
 * is absent from a production bundle. auth.config.ts additionally refuses to
 * boot if the flag is set with NODE_ENV=production.
 */

export interface DevIdentity {
  id: string;
  label: string;
  /** Becomes the token's `oid`. apps/api matches it to User.externalId. */
  oid: string;
  email: string;
  name: string;
}

/**
 * No `role` field, deliberately. Role lives in the User row and reaches the web
 * app only via GET /api/v1/me — see spec §4.1a. Switching identity switches the
 * oid; the role follows from the database.
 *
 * dev-unknown-1 has NO User row on purpose. It must produce a 403 and land on
 * /not-registered, turning the spec's most load-bearing authorization rule into
 * something clickable rather than something only a test knows about.
 */
export const DEV_IDENTITIES: readonly DevIdentity[] = [
  { id: "mentor", label: "Mentor (Admin)", oid: "dev-admin-1", email: "mentor@dev.local", name: "Dev Mentor" },
  { id: "student", label: "Student", oid: "dev-student-1", email: "student@dev.local", name: "Dev Student" },
  { id: "unknown", label: "Unregistered user (expect 403)", oid: "dev-unknown-1", email: "nobody@dev.local", name: "Unregistered" },
];

export const DEV_ISSUER = "http://localhost:3000/api/dev-jwks";

const KID = "dev-key-1";

// Generated once per process and held here. Restarting apps/web invalidates
// outstanding sessions, which presents correctly as a 401 and a sign-out.
const keyPair = await generateKeyPair("RS256", { extractable: true });

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
