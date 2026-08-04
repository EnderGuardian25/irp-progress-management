/**
 * Dev/seed persona identity — the ONE list the database seed and the web
 * dev-identity picker both derive from, so they cannot drift (spec §6).
 * Data only: no secrets, no signing, importable from client code.
 *
 * Ships raw TS like @irp/client (bundler-only consumers: Next, tsx, Vitest).
 * NOT for apps/api runtime code — dev/test/seed only.
 */

export type PersonaKind =
  | "compliant"
  | "late"
  | "missed"
  | "absent"
  | "weekend"
  | "joiner"
  | "transfer"
  | "archived"
  | "mixed";

export interface SeedMentor {
  externalId: string;
  email: string;
  name: string;
}

export interface SeedStudent {
  externalId: string;
  email: string;
  name: string;
  batch: "A" | "B";
  kind: PersonaKind;
}

// Positional names, and the seed is the only thing that creates them. `A`/`B`
// remain the code-side keys — a batch's NAME is mentor-supplied at runtime and
// carries no ordering, so nothing may infer "first"/"second" from these
// strings. Prefer importing this constant over writing the literals: the
// 2026-08-04 rename from "Batch Aurora"/"Batch Basalt" had to touch the
// Playwright suite in five places precisely because they were hardcoded.
export const SEED_BATCH_NAMES = { A: "Batch 1", B: "Batch 2" } as const;

// dev-admin-1 / dev-student-1 keep their historical externalIds: the
// Playwright suite and CI's seeded users predate this package, and identity
// stability is what lets the seed REPLACE the old manual INSERT without a
// breaking rename.
export const SEED_MENTORS: readonly SeedMentor[] = [
  { externalId: "dev-admin-1", email: "mentor@dev.local", name: "Dev Mentor" },
  { externalId: "seed-mentor-2", email: "priya.mentor@dev.local", name: "Priya Fernando" },
];

export const SEED_STUDENTS: readonly SeedStudent[] = [
  { externalId: "dev-student-1", email: "student@dev.local", name: "Dev Student", batch: "A", kind: "compliant" },
  { externalId: "seed-student-a2", email: "nuwan@dev.local", name: "Nuwan Perera", batch: "A", kind: "late" },
  { externalId: "seed-student-a3", email: "sachini@dev.local", name: "Sachini Silva", batch: "A", kind: "missed" },
  { externalId: "seed-student-a4", email: "kavindu@dev.local", name: "Kavindu Jayasuriya", batch: "A", kind: "absent" },
  { externalId: "seed-student-a5", email: "tharindu@dev.local", name: "Tharindu Weerasinghe", batch: "A", kind: "archived" },
  { externalId: "seed-student-b1", email: "ishara@dev.local", name: "Ishara Gunawardena", batch: "B", kind: "compliant" },
  { externalId: "seed-student-b2", email: "dilini@dev.local", name: "Dilini Rathnayake", batch: "B", kind: "weekend" },
  { externalId: "seed-student-b3", email: "ramesh@dev.local", name: "Ramesh Kumar", batch: "B", kind: "joiner" },
  { externalId: "seed-student-b4", email: "amaya@dev.local", name: "Amaya Wickramasinghe", batch: "B", kind: "transfer" },
  { externalId: "seed-student-b5", email: "chamodi@dev.local", name: "Chamodi Herath", batch: "B", kind: "mixed" },
];

/** Every seeded User externalId — the seed's idempotent delete targets exactly these. */
export const SEED_EXTERNAL_IDS: readonly string[] = [
  ...SEED_MENTORS.map((m) => m.externalId),
  ...SEED_STUDENTS.map((s) => s.externalId),
];
