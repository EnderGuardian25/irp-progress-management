import type { PrismaClient } from "../generated/prisma/client.js";

export interface UserRecord {
  id: string;
  externalId: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "STUDENT";
}

export interface UserRepo {
  findByExternalId(externalId: string): Promise<UserRecord | null>;
}

export function createUserRepo(prisma: PrismaClient): UserRepo {
  return {
    async findByExternalId(externalId) {
      const u = await prisma.user.findFirst({
        where: { externalId, deletedAt: null }, // FR-5: soft-deleted users are hidden
      });
      if (!u) return null;
      return {
        id: u.id,
        externalId: u.externalId,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
      };
    },
  };
}
