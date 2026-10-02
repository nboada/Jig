import type { NextConfig } from "next";

const config: NextConfig = {
    serverExternalPackages: ["@electric-sql/pglite"],
    outputFileTracingRoot: import.meta.dirname,
    devIndicators: false,
    experimental: {
        staleTimes: { dynamic: 30 },
        dynamicOnHover: true,
        serverActions: {
            bodySizeLimit: "5mb",
        },
    },
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
            {
                source: "/sw.js",
                headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
            },
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
        resolveAlias: {
            prettier: { browser: "prettier/standalone" },
            fs: { browser: "./lib/empty-module.ts" },
            path: { browser: "./lib/empty-module.ts" },
        },
    },
};

export default config;
