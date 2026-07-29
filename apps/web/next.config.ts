import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @irp/client is bundler-only: it ships runtime code as raw TypeScript with
  // noEmit, so Next must compile it. apps/api cannot load it at all.
  transpilePackages: ["@irp/client"],
  typedRoutes: true,
};

export default nextConfig;
