import { ImageResponse } from "next/og";
import { AppIcon } from "./app-icon";

// Favicon plus the two sizes the web manifest needs (served at /icon/<id>).
export function generateImageMetadata() {
  return [
    { id: "32", size: { width: 32, height: 32 }, contentType: "image/png" },
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const px = Number(await id);
  return new ImageResponse(<AppIcon size={px} rounded={px < 100 ? 0.2 : 0} />, { width: px, height: px });
}
