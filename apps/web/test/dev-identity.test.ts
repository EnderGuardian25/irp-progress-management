// @vitest-environment node
//
// jose's WebCrypto build encodes JWT payloads with the realm-local
// TextEncoder/Uint8Array. Vitest's jsdom environment runs tests inside a
// separate VM context with its own Uint8Array constructor, so an
// `instanceof Uint8Array` check inside jose's signer fails cross-realm
// ("payload must be an instance of Uint8Array") even though the value is a
// perfectly valid Uint8Array. This file does no DOM rendering, so running it
// under the plain Node environment sidesteps the realm mismatch entirely.
import { describe, expect, it } from "vitest";
import { createLocalJWKSet, jwtVerify } from "jose";
import {
  DEV_IDENTITIES,
  DEV_ISSUER,
  devJwks,
  mintDevToken,
} from "@/lib/dev-identity";

const AUD = "api://irp-progress-management";

describe("DEV_IDENTITIES", () => {
  it("offers a mentor, a student, and an unregistered identity", () => {
    expect(DEV_IDENTITIES).toHaveLength(3);
    expect(DEV_IDENTITIES.map((i) => i.oid)).toEqual([
      "dev-admin-1",
      "dev-student-1",
      "dev-unknown-1",
    ]);
  });

  it("carries no role — the User row is the only source of truth", () => {
    for (const identity of DEV_IDENTITIES) {
      expect(identity).not.toHaveProperty("role");
    }
  });
});

describe("mintDevToken", () => {
  it("mints a token the published JWKS verifies", async () => {
    const identity = DEV_IDENTITIES[0]!;
    const token = await mintDevToken(identity, AUD);
    const keySet = createLocalJWKSet(await devJwks());

    const { payload } = await jwtVerify(token, keySet, {
      issuer: DEV_ISSUER,
      audience: AUD,
      algorithms: ["RS256"],
    });

    expect(payload.oid).toBe("dev-admin-1");
  });

  it("sets the oid claim apps/api matches against User.externalId", async () => {
    for (const identity of DEV_IDENTITIES) {
      const token = await mintDevToken(identity, AUD);
      const keySet = createLocalJWKSet(await devJwks());
      const { payload } = await jwtVerify(token, keySet, {
        issuer: DEV_ISSUER,
        audience: AUD,
      });
      expect(payload.oid).toBe(identity.oid);
    }
  });

  it("is rejected when the audience does not match", async () => {
    const token = await mintDevToken(DEV_IDENTITIES[0]!, AUD);
    const keySet = createLocalJWKSet(await devJwks());
    await expect(
      jwtVerify(token, keySet, { issuer: DEV_ISSUER, audience: "api://wrong" }),
    ).rejects.toThrow();
  });
});

describe("devJwks", () => {
  it("publishes exactly one public RS256 signing key and no private material", async () => {
    const jwks = await devJwks();
    expect(jwks.keys).toHaveLength(1);
    const key = jwks.keys[0]!;
    expect(key.alg).toBe("RS256");
    expect(key.use).toBe("sig");
    expect(key.kid).toBeTypeOf("string");
    // A private RSA key would carry these. Publishing one would let anyone
    // mint tokens our own API trusts.
    for (const priv of ["d", "p", "q", "dp", "dq", "qi"]) {
      expect(key).not.toHaveProperty(priv);
    }
  });
});
