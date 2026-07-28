import type { UserRepo, UserRecord } from "../../src/db/user-repo.js";

export function fakeUserRepo(users: UserRecord[]): UserRepo {
  return {
    findByExternalId(externalId) {
      return Promise.resolve(users.find((u) => u.externalId === externalId) ?? null);
    },
  };
}
