// next/font/google's real implementation only exists as a compiler transform
// that Next's own build pipeline (webpack/Turbopack) applies at the import
// site; the package's raw `font/google/index.js` entry point is a 0-byte
// file outside that pipeline. Under Vitest (a plain Vite/Node environment)
// that import therefore resolves to nothing, regardless of network access —
// this is a bundler-integration gap, not a fonts-download failure. Next
// itself ships an equivalent stub for Jest (next/dist/build/jest/__mocks__/
// nextFontMock.js, wired in automatically by the `next/jest` preset); this
// mirrors that shape but with static named exports so Vite's dependency
// pre-bundler can see them (the original uses a Proxy, which only works
// under Jest's non-static CJS `require`).
//
// Wired in via vitest.config.ts's `resolve.alias`, so it only affects the
// Vitest module graph — `next build`/`next dev` resolve the real package.
interface MockFontOptions {
  variable?: string;
}

interface MockFontOutput {
  className: string;
  variable: string;
  style: { fontFamily: string };
}

function mockFont(name: string, options: MockFontOptions = {}): MockFontOutput {
  return {
    className: `mock-font-${name}`,
    variable: options.variable ?? `--mock-font-${name}`,
    style: { fontFamily: name },
  };
}

export function Plus_Jakarta_Sans(options: MockFontOptions = {}): MockFontOutput {
  return mockFont("plus-jakarta-sans", options);
}

export function IBM_Plex_Mono(options: MockFontOptions = {}): MockFontOutput {
  return mockFont("ibm-plex-mono", options);
}
