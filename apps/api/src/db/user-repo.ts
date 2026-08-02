import type { PrismaClient } from "../generated/prisma/client.js";

export interface UserRecord {
  id: string;
  externalId: string;
  email: string;
  displayName: string;
  // Mirrors the generated Prisma `Role` enum. Unlike the DayStatus duplication in
  // handoff.md §3, this one is compiler-checked: `role: u.role` below is assigned
  // against this interface, so a third Role member would fail typecheck, not drift.
  role: "ADMIN" | "STUDENT";
}

export interface UserRepo {
  findByExternalId(externalId: string): Promise<UserRecord | null>;
  // Unfiltered by deletedAt, unlike findByExternalId — includes archived
  // users. Callers decide whether an archived user is acceptable for their
  // purpose (e.g. reviews.ts still rejects a non-STUDENT role, but does not
  // reject an archived one; FR-5 hiding is a login-time concern, not this
  // lookup's).
  findById(id: string): Promise<(UserRecord & { deletedAt: Date | null }) | null>;
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

    async findById(id) {
      const u = await prisma.user.findUnique({ where: { id } });
      if (!u) return null;
      return {
        id: u.id,
        externalId: u.externalId,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        deletedAt: u.deletedAt,
      };
    },
  };
}
