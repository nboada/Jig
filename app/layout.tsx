import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import { connection } from "next/server";
import { Toaster } from "@/components/Toaster";
import { TooltipProvider } from "@/components/Tooltip";
import "./globals.css";

const sans = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-schibsted" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: "Jig", template: "%s · Jig" },
  description: "Versioned code snippets your agents can reach over MCP.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Jig", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#181818", maximumScale: 1, userScalable: false };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
