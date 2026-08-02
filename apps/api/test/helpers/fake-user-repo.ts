import type { UserRepo, UserRecord } from "../../src/db/user-repo.js";

// `create`/`list`/`archive` back /api/v1/users and DELETE /api/v1/users/{id}
// (Tasks 9/10), which no suite using `fakeUserRepo` exercises — they throw if
// ever reached, same as `unusedBatchRepo`'s methods.
const unused = () => {
  throw new Error("unused: userRepo.create/list/archive was not expected to be called in this suite");
};

export function fakeUserRepo(users: UserRecord[]): UserRepo {
  return {
    findByExternalId(externalId) {
      return Promise.resolve(users.find((u) => u.externalId === externalId) ?? null);
    },
    findById(id) {
      const u = users.find((user) => user.id === id);
      return Promise.resolve(u ? { ...u, deletedAt: null } : null);
    },
    create: unused,
    list: unused,
    archive: unused,
  };
}
