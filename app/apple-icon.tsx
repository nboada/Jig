import { ImageResponse } from "next/og";
import { AppIconArt } from "@/lib/app-icon";

// The home-screen icon for iOS and iPadOS. iOS rounds the corners itself, so the art is full-bleed.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIconArt size={180} maskable />, size);
}
