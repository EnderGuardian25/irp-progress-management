// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies }));

const set = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  cookies.mockResolvedValue({ set });
});

async function setTheme(value: string) {
  const mod = await import("@/app/(app)/settings/theme-actions");
  return mod.setTheme(value);
}

describe("setTheme", () => {
  it("writes each offered value", async () => {
    for (const theme of ["light", "dark", "system"]) {
      set.mockClear();
      expect(await setTheme(theme)).toBeNull();
      expect(set).toHaveBeenCalledTimes(1);
      expect(set.mock.calls[0]![0]).toMatchObject({ name: "irp-theme", value: theme });
    }
  });

  it("sets the attributes the cookie needs to survive and stay server-only", async () => {
    await setTheme("dark");
    expect(set.mock.calls[0]![0]).toMatchObject({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      // The one attribute whose value is CONDITIONAL rather than hard-coded —
      // theme-actions.ts derives it from `process.env.NODE_ENV === "production"`.
      // Without pinning it, a hard-coded `secure: true` (which silently drops the
      // cookie over plain HTTP in dev) or an inverted condition (which drops
      // `Secure` in production) would both pass every other assertion here.
      // Vitest runs with NODE_ENV=test, so the expected value is false.
      secure: false,
      maxAge: 60 * 60 * 24 * 365,
    });
  });

  it("rejects an unknown value and writes NOTHING", async () => {
    const result = await setTheme("purple");
    expect(result).not.toBeNull();
    expect(result?.error).toMatch(/theme/i);
    // The important half: a rejected value must not reach the cookie, because
    // the cookie's value is stamped straight into a DOM attribute.
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects a value that only looks close", async () => {
    for (const bad of ["DARK", "light ", "", "system;path=/"]) {
      set.mockClear();
      expect(await setTheme(bad)).not.toBeNull();
      expect(set).not.toHaveBeenCalled();
    }
  });
});
