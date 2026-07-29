import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet, type JWTVerifyGetKey } from "jose";

const ISS = "https://issuer.test/v2.0";
const AUD = "api://irp-test";
const KID = "test-key-1";

export const testIssuer = ISS;
export const testAudience = AUD;

const keys = await generateKeyPair("RS256");

export async function getLocalKeySet(): Promise<JWTVerifyGetKey> {
  const jwk = await exportJWK(keys.publicKey);
  return createLocalJWKSet({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] });
}

interface SignOpts { oid?: string; issuer?: string; audience?: string; expiresIn?: string; }

export async function signToken(opts: SignOpts = {}): Promise<string> {
  return new SignJWT({ oid: opts.oid ?? "oid-1" })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuedAt()
    .setIssuer(opts.issuer ?? ISS)
    .setAudience(opts.audience ?? AUD)
    .setExpirationTime(opts.expiresIn ?? "5m")
    .sign(keys.privateKey);
}

export async function signExpiredToken(oid = "oid-1"): Promise<string> {
  return new SignJWT({ oid })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
    .sign(keys.privateKey);
}
