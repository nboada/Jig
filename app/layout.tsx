import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Snippeta", template: "%s · Snippeta" },
  description: "Versioned code snippets your agents can reach over MCP.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
