import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

// Self-hosted at build time, so the installed app never asks Google for them.
const sans = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-schibsted" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: "Jig", template: "%s · Jig" },
  description: "Versioned code snippets your agents can reach over MCP.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Jig", statusBarStyle: "black-translucent" },
};

// The installed app's title bar and the browser's UI take the page's darkest colour.
export const viewport: Viewport = { themeColor: "#0c0d0f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
