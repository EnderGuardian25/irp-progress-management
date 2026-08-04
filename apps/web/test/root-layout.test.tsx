// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// next/headers' cookies() is async in Next 16 and only resolves inside a request
// scope, so it is mocked. The value under test is what layout.tsx DOES with the
// cookie, not next/headers itself.
const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies }));

// next/font/google reaches the network at build time and returns a font object;
// a stub keeps this a unit test.
vi.mock("next/font/google", () => ({
  Plus_Jakarta_Sans: () => ({ variable: "--font-jakarta" }),
  IBM_Plex_Mono: () => ({ variable: "--font-plex-mono" }),
}));
vi.mock("../app/globals.css", () => ({}));

function mockCookie(value: string | undefined): void {
  cookies.mockResolvedValue({
    get: (name: string) => (name === "irp-theme" && value !== undefined ? { name, value } : undefined),
  });
}

async function renderLayout(): Promise<string> {
  const { default: RootLayout } = await import("@/app/layout");
  return renderToStaticMarkup(await RootLayout({ children: null }));
}

describe("RootLayout data-theme stamping", () => {
  it("stamps dark when the cookie says dark", async () => {
    mockCookie("dark");
    expect(await renderLayout()).toContain('data-theme="dark"');
  });

  it("stamps light when the cookie says light, so an OS in dark mode is overridden", async () => {
    mockCookie("light");
    expect(await renderLayout()).toContain('data-theme="light"');
  });

  it("omits the attribute entirely for system, leaving the media query in charge", async () => {
    mockCookie("system");
    expect(await renderLayout()).not.toContain("data-theme");
  });

  it("omits the attribute when there is no cookie at all — a first visit follows the OS", async () => {
    mockCookie(undefined);
    expect(await renderLayout()).not.toContain("data-theme");
  });

  it("omits the attribute for a tampered value rather than stamping it", async () => {
    mockCookie('dark" onload="alert(1)');
    const html = await renderLayout();
    expect(html).not.toContain("onload");
    expect(html).not.toContain("data-theme");
  });
});
