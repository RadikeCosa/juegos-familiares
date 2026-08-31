import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Juegos Familiares",
    short_name: "Juegos",
    description: "Juegos sencillos para jugar en familia.",
    id: "/",
    scope: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#F7FAFF",
    theme_color: "#2563EB",
    lang: "es-AR",
    categories: ["games", "entertainment"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
