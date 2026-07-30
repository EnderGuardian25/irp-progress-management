export interface BootstrapDeps {
  /** Build the server, register shutdown handling, and listen. */
  start: () => Promise<void>;
  /** Release the database pool. Usually prisma.$disconnect(). */
  disconnect: () => Promise<void>;
  /** Log and exit non-zero. */
  fatal: (err: unknown) => void;
}

/**
 * Startup, with the failure path handled once.
 *
 * index.ts previously disconnected Prisma only inside the catch around
 * app.listen, so a buildServer rejection leaked the client. Low stakes because
 * the process exits either way, but it was a recorded Plan 4 obligation and it
 * is free to get right once the structure exists.
 *
 * A failing disconnect must not mask the original error, so it is swallowed.
 */
export async function bootstrap(deps: BootstrapDeps): Promise<void> {
  try {
    await deps.start();
  } catch (err) {
    try {
      await deps.disconnect();
    } catch {
      // Deliberately ignored — reporting the startup failure matters more.
    }
    deps.fatal(err);
  }
}
