import type { PrismaClient } from "../../src/generated/prisma/client.js";

/**
 * A stub for suites that construct `buildServer` without a database
 * connection (auth/plumbing tests). `userRoutes` is the only consumer of the
 * raw Prisma client (its atomic student-registration transaction — see
 * routes/users.ts), and no `/api/v1/users` route is exercised in those
 * files, so `$transaction` throws if it is ever reached. Same pattern as
 * `unusedBatchRepo`.
 */
export function unusedPrisma(): PrismaClient {
  const unused = () => {
    throw new Error("unused: prisma was not expected to be called in this suite");
  };
  return { $transaction: unused } as unknown as PrismaClient;
}
