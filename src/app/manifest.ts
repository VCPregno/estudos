import type { MetadataRoute } from "next";

/** Torna o app instalável (Chrome/Edge no PC, "Adicionar à Tela de Início" no iPad e no celular). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Estudos",
    short_name: "Estudos",
    description: "Plataforma pessoal de estudos para concursos.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#121826",
    theme_color: "#121826",
    icons: [
      { src: "/icones/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icones/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
