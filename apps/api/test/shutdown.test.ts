import { describe, expect, it, vi } from "vitest";
import { createShutdownHandler, registerShutdown } from "../src/shutdown.js";

interface Harness {
  events: string[];
  exitCodes: number[];
  deps: Parameters<typeof createShutdownHandler>[0];
  resolveClose: () => void;
}

function harness(options: { closeHangs?: boolean; closeRejects?: boolean } = {}): Harness {
  const events: string[] = [];
  const exitCodes: number[] = [];
  let resolveClose = (): void => undefined;

  const deps = {
    close: async (): Promise<void> => {
      events.push("close:start");
      if (options.closeRejects === true) {
        throw new Error("close failed");
      }
      if (options.closeHangs === true) {
        await new Promise<void>((resolve) => {
          resolveClose = resolve;
        });
      }
      events.push("close:done");
    },
    disconnect: async (): Promise<void> => {
      events.push("disconnect");
      return Promise.resolve();
    },
    exit: (code: number): void => {
      exitCodes.push(code);
    },
    log: (event: string): void => {
      events.push(`log:${event}`);
    },
    timeoutMs: 10_000,
  };

  return {
    events,
    exitCodes,
    deps,
    resolveClose: () => {
      resolveClose();
    },
  };
}

describe("createShutdownHandler", () => {
  it("drains the server before disconnecting the database", async () => {
    const h = harness();
    createShutdownHandler(h.deps)("SIGTERM");
    await vi.waitFor(() => {
      expect(h.exitCodes).toEqual([0]);
    });

    // Disconnecting first would fail the very requests the drain protects.
    expect(h.events.indexOf("close:done")).toBeLessThan(h.events.indexOf("disconnect"));
  });

  it("ignores a second signal while a shutdown is already running", async () => {
    const h = harness({ closeHangs: true });
    const handler = createShutdownHandler(h.deps);

    handler("SIGTERM");
    handler("SIGTERM");
    handler("SIGINT");

    h.resolveClose();
    await vi.waitFor(() => {
      expect(h.exitCodes).toEqual([0]);
    });

    expect(h.events.filter((e) => e === "close:start")).toHaveLength(1);
  });

  it("force-exits non-zero when the drain overruns the timeout", async () => {
    vi.useFakeTimers();
    try {
      const h = harness({ closeHangs: true });
      createShutdownHandler({ ...h.deps, timeoutMs: 5_000 })("SIGTERM");

      await vi.advanceTimersByTimeAsync(5_001);

      // A SIGKILL from the orchestrator is a dropped request AND an
      // unexplained exit code. Exiting ourselves keeps it diagnosable.
      expect(h.exitCodes).toEqual([1]);
      expect(h.events).not.toContain("disconnect");
    } finally {
      vi.useRealTimers();
    }
  });

  it("exits non-zero when the drain throws", async () => {
    const h = harness({ closeRejects: true });
    createShutdownHandler(h.deps)("SIGTERM");
    await vi.waitFor(() => {
      expect(h.exitCodes).toEqual([1]);
    });
  });
});

describe("registerShutdown", () => {
  it("registers one handler per requested signal", () => {
    const h = harness();
    const registered: string[] = [];

    registerShutdown({
      ...h.deps,
      signals: ["SIGTERM", "SIGINT"],
      on: (signal: NodeJS.Signals): void => {
        registered.push(signal);
      },
    });

    expect(registered).toEqual(["SIGTERM", "SIGINT"]);
  });
});
