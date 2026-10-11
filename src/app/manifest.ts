import type { MetadataRoute } from "next";

// Lets the reader be installed to a phone's home screen and open full-screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Open Bible",
    short_name: "Bible",
    description: "A private Bible reader with notes, highlights and progress.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffdf8",
    theme_color: "#8a2b2b",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
