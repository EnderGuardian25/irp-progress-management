import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // next/font/google's real export only exists via Next's own compiler
      // transform; see test/mocks/next-font-google.ts for the full reason.
      // This alias is Vitest-only — next build/dev resolve the real package.
      "next/font/google": fileURLToPath(
        new URL("./test/mocks/next-font-google.ts", import.meta.url),
      ),
      // server-only's real index.js throws unconditionally; Next resolves it
      // to a no-op via the react-server export condition, which Vitest does
      // not implement. See test/mocks/server-only.ts for the full reason.
      "server-only": fileURLToPath(
        new URL("./test/mocks/server-only.ts", import.meta.url),
      ),
      // next-auth's lib/env.js imports "next/server" with no extension — its
      // own source comment admits "Next.js does not yet correctly use the
      // package.json#exports field". next has no `exports` map for that
      // subpath, so under Node's own ESM resolver (which vitest uses for
      // node_modules it treats as external, unlike Next's webpack/Turbopack
      // bundler) an extensionless bare-specifier subpath is
      // ERR_MODULE_NOT_FOUND, not a resolvable file. Rewriting the specifier
      // to the exact filename sidesteps that resolver gap without touching
      // next itself. This alias is Vitest-only — next build/dev/start bundle
      // through Next's own resolution and need no such rewrite.
      "next/server": "next/server.js",
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    server: {
      deps: {
        // Forces Vite to transform next-auth (and therefore resolve its
        // "next/server" import through Vite's own resolver, which honors the
        // alias above) instead of treating it as an external dependency
        // handed to Node's native — and stricter — ESM resolver. Without
        // this, the alias above is defined but never consulted for this
        // package, and the extensionless "next/server" import fails exactly
        // as it does without the alias at all.
        inline: [/next-auth/],
      },
    },
  },
});
