import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lumitrader",
    short_name: "Lumitrader",
    description: "Plataforma de trading algorítmico inteligente com dashboard operacional.",
    start_url: "/",
    display: "standalone",
    background_color: "#06111e",
    theme_color: "#06111e",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
