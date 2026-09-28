import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships a WASM build of Postgres; bundling it breaks the file lookups.
  serverExternalPackages: ["@electric-sql/pglite"],
  // The Astro site's lockfile sits one level up; this app is its own root.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
};

export default config;
