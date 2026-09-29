import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships a WASM build of Postgres; bundling it breaks the file lookups.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Pin the project root so a lockfile in a parent folder is never picked up instead.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
};

export default config;
