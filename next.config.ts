import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite ships a WASM build of Postgres; bundling it breaks the file lookups.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Pin the project root so a lockfile in a parent folder is never picked up instead.
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    // Reuse pages visited in the last 30s when navigating back to them. Saves and deletes clear
    // this at once (the server actions revalidate), so only changes from elsewhere wait.
    // Experimental ("not recommended for production" in the docs): recheck on each Next upgrade.
    staleTimes: { dynamic: 30 },
    // Hovering a link loads its whole page in the background, so the click usually finds it ready.
    // Undocumented (only in next's config types, with Link's unstable_dynamicOnHover): recheck on
    // each Next upgrade; the documented stand-in is Link's prefetch={hovered ? null : false}.
    dynamicOnHover: true,
    serverActions: {
      // A snippet can hold 20 files of 200,000 characters (lib/validation.ts); the default is 1 MB.
      bodySizeLimit: "5mb",
    },
  },
  // Sent with every response. The Content-Security-Policy comes from proxy.ts, with a nonce.
  async headers() {
    const everywhere = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    ];
    return [
      { source: "/:path*", headers: everywhere },
      // A shared item can hold secrets: never keep a copy of it anywhere, or send its link on.
      {
        source: "/s/:token*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
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
