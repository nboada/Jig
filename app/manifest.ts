import type { MetadataRoute } from "next";

/** Makes Jig installable as an app (Chrome's "Install Jig", Add to Home Screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jig",
    short_name: "Jig",
    description: "Versioned code snippets your agents can reach over MCP.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#181818",
    theme_color: "#181818",
    icons: [
      { src: "/app-icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
