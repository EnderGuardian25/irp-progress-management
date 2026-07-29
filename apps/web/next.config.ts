import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server tree at .next/standalone, so the runtime
  // image carries only what the server actually needs. Image size is cold-start
  // time, and ADR-0009 D5 scales this app to zero at rest.
  output: "standalone",
  // MUST be the repository root. Next traces from the app directory by default,
  // which in a pnpm workspace misses @irp/client and the hoisted node_modules —
  // producing an image that builds fine and then fails at runtime on a missing
  // module.
  outputFileTracingRoot: path.join(import.meta.dirname, "..", ".."),
  // @irp/client is bundler-only: it ships runtime code as raw TypeScript with
  // noEmit, so Next must compile it. apps/api cannot load it at all.
  transpilePackages: ["@irp/client"],
  typedRoutes: true,
};

export default nextConfig;
