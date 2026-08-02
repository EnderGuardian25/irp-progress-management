import type { UserRepo, UserRecord } from "../../src/db/user-repo.js";

export function fakeUserRepo(users: UserRecord[]): UserRepo {
  return {
    findByExternalId(externalId) {
      return Promise.resolve(users.find((u) => u.externalId === externalId) ?? null);
    },
    findById(id) {
      const u = users.find((user) => user.id === id);
      return Promise.resolve(u ? { ...u, deletedAt: null } : null);
    },
  };
}
