import { ImageResponse } from "next/og";
import { AppIconArt } from "@/lib/app-icon";

const ICONS: Record<string, { size: number; maskable?: boolean; monochrome?: boolean }> = {
  "192.png": { size: 192 },
  "512.png": { size: 512 },
  "maskable-512.png": { size: 512, maskable: true },
  "monochrome-512.png": { size: 512, monochrome: true },
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }));
}

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const icon = ICONS[(await params).name];
  if (!icon) return new Response("Not found", { status: 404 });
  return new ImageResponse(<AppIconArt size={icon.size} maskable={icon.maskable} monochrome={icon.monochrome} />, { width: icon.size, height: icon.size });
}
