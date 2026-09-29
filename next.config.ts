import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships a WASM build of Postgres; bundling it breaks the file lookups.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Pin the project root so a lockfile in a parent folder is never picked up instead.
  outputFileTracingRoot: import.meta.dirname,
  turbopack: {
    root: import.meta.dirname,
    // The PHP formatter's browser build names fs and path but only touches them under Node,
    // and the Liquid formatter's asks for prettier where the browser build is what it needs.
    resolveAlias: {
      prettier: { browser: "prettier/standalone" },
      fs: { browser: "./lib/empty-module.ts" },
      path: { browser: "./lib/empty-module.ts" },
    },
  },
};

export default config;
