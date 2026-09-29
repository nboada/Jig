import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
