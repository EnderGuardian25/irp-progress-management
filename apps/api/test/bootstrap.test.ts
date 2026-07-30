import { describe, expect, it } from "vitest";
import { bootstrap } from "../src/bootstrap.js";

describe("bootstrap", () => {
  it("does not disconnect when startup succeeds", async () => {
    const events: string[] = [];

    await bootstrap({
      start: async (): Promise<void> => {
        events.push("start");
        return Promise.resolve();
      },
      disconnect: async (): Promise<void> => {
        events.push("disconnect");
        return Promise.resolve();
      },
      fatal: (): void => {
        events.push("fatal");
      },
    });

    expect(events).toEqual(["start"]);
  });

  // The whole point of this module. index.ts used to disconnect only inside
  // the catch around app.listen, so a buildServer rejection leaked the client.
  it("disconnects Prisma and reports fatally when startup rejects", async () => {
    const events: string[] = [];
    const boom = new Error("buildServer rejected");
    let seen: unknown;

    await bootstrap({
      start: (): Promise<void> => Promise.reject(boom),
      disconnect: async (): Promise<void> => {
        events.push("disconnect");
        return Promise.resolve();
      },
      fatal: (err: unknown): void => {
        events.push("fatal");
        seen = err;
      },
    });

    expect(events).toEqual(["disconnect", "fatal"]);
    expect(seen).toBe(boom);
  });

  it("still reports fatally when the disconnect itself fails", async () => {
    const events: string[] = [];

    await bootstrap({
      start: (): Promise<void> => Promise.reject(new Error("boom")),
      disconnect: (): Promise<void> => Promise.reject(new Error("disconnect failed")),
      fatal: (): void => {
        events.push("fatal");
      },
    });

    expect(events).toEqual(["fatal"]);
  });
});
