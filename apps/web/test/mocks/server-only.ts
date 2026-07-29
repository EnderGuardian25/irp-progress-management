// The real `server-only` package throws unconditionally when its index.js
// runs — that IS the guard. Next's build resolves it through the
// `react-server` package-export condition instead, which points at an empty
// no-op module in a Server Component compilation. Vitest is a plain
// Vite/Node environment with no such condition wired in, so importing the
// real package here would fail every test that imports a server-only module,
// including from Node-environment test files that are legitimately
// server-side. This mirrors Next's own empty.js for the Vitest module graph
// only — `next build`/`next dev` still resolve the real package and its real
// throw. See test/mocks/next-font-google.ts for the matching pattern.
export {};
