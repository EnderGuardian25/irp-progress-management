// The single source of truth for "is there a database for this run".
//
// A DB-less run is a developer convenience, never an acceptable CI result: a skipped suite
// exits 0, so a Postgres service that failed to start would report green while running zero
// database tests. Fail loudly in CI instead. Every database suite must import dbUrl from
// here rather than reading process.env directly, so the guard cannot be forgotten.
export const dbUrl = process.env.DATABASE_URL;

if (process.env.CI && !dbUrl) {
  throw new Error("DATABASE_URL is required in CI — the database suite must not be skipped");
}
