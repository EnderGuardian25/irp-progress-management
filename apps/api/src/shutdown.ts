export interface ShutdownDeps {
  /** Stop accepting connections and drain in-flight requests. Usually app.close(). */
  close: () => Promise<void>;
  /** Release the database pool. Usually prisma.$disconnect(). */
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  log: (event: string, err?: unknown) => void;
  timeoutMs: number;
}

export interface RegisterShutdownDeps extends ShutdownDeps {
  signals: NodeJS.Signals[];
  on: (signal: NodeJS.Signals, handler: () => void) => void;
}

/**
 * Container Apps sends SIGTERM on every scale-down and redeploy, and ADR-0009
 * D5 scales this service to zero at rest — so shutdown is routine, not rare.
 *
 * Order matters: close() first, so in-flight requests finish, and only then
 * disconnect(). Disconnecting first would fail exactly the requests the drain
 * exists to protect.
 *
 * The timeout is not belt-and-braces. The orchestrator's grace period is
 * finite; if we overrun it we are SIGKILLed, which is a dropped request AND an
 * unexplained exit code. Exiting ourselves keeps the failure diagnosable.
 */
export function createShutdownHandler(deps: ShutdownDeps): (signal: string) => void {
  let started = false;

  return (signal: string): void => {
    if (started) {
      deps.log(`shutdown already in progress, ignoring ${signal}`);
      return;
    }
    started = true;
    deps.log(`received ${signal}, draining`);

    const timer = setTimeout(() => {
      deps.log(`drain exceeded ${String(deps.timeoutMs)}ms, forcing exit`);
      deps.exit(1);
    }, deps.timeoutMs);
    // Never hold the event loop open on our own watchdog. Guarded because a
    // fake-timer implementation may not provide unref().
    if (typeof timer.unref === "function") {
      timer.unref();
    }

    void (async (): Promise<void> => {
      try {
        await deps.close();
        await deps.disconnect();
        clearTimeout(timer);
        deps.log("shutdown complete");
        deps.exit(0);
      } catch (err) {
        clearTimeout(timer);
        deps.log("shutdown failed", err);
        deps.exit(1);
      }
    })();
  };
}

export function registerShutdown(deps: RegisterShutdownDeps): void {
  const handler = createShutdownHandler(deps);
  for (const signal of deps.signals) {
    deps.on(signal, () => {
      handler(signal);
    });
  }
}
