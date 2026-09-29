import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships a WASM build of Postgres; bundling it breaks the file lookups.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Pin the project root so a lockfile in a parent folder is never picked up instead.
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    // Reuse pages visited in the last 30s when navigating back to them. Saves and deletes clear
    // this at once (the server actions revalidate), so only changes from elsewhere wait.
    staleTimes: { dynamic: 30 },
    // Hovering a link loads its whole page in the background, so the click usually finds it ready.
    dynamicOnHover: true,
  },
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
