import fp from "fastify-plugin";
import { jwtVerify, type JWTVerifyGetKey } from "jose";
import type { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError, ForbiddenError } from "../errors.js";
import type { UserRecord, UserRepo } from "../db/user-repo.js";

export interface AuthOptions {
  getKey: JWTVerifyGetKey;
  issuer: string;
  audience: string;
  userRepo: UserRepo;
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: UserRecord | null;
  }
}

export const authPlugin = fp<AuthOptions>(
  (app, opts) => {
    app.decorateRequest("user", null);

    app.decorate("authenticate", async (req: FastifyRequest) => {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        throw new UnauthorizedError("No bearer token was supplied.");
      }
      const token = header.slice("Bearer ".length);

      let oid: unknown;
      try {
        const { payload } = await jwtVerify(token, opts.getKey, {
          issuer: opts.issuer,
          audience: opts.audience,
          // Entra signs with RS256. Stating it means the accepted set is a
          // decision in the code rather than whatever jose defaults to —
          // the control you want written down before Plan 3 points this at a
          // real tenant, not one inferred from jose rejecting `alg: none`.
          algorithms: ["RS256"],
          // Zero tolerance is the default, so ordinary skew between Entra's
          // clock and the container's produces spurious 401s on freshly
          // issued tokens.
          clockTolerance: "60s",
        });
        oid = payload.oid;
      } catch {
        // Malformed, bad signature, wrong issuer/audience, or expired.
        throw new UnauthorizedError("The bearer token is invalid or has expired.");
      }

      if (typeof oid !== "string" || oid.length === 0) {
        throw new UnauthorizedError("The token is missing the oid claim.");
      }

      const user = await opts.userRepo.findByExternalId(oid);
      if (!user) throw new ForbiddenError(); // spec §7: valid token, no record → 403
      req.user = user;
    });
  },
  { name: "auth", dependencies: ["problem-details"] },
);
