import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Meu Dia", template: "%s | Estudos" },
  description: "Plataforma pessoal de estudos para concursos — ciclo dinâmico, questões, flashcards e leis secas.",
  applicationName: "Estudos",
  appleWebApp: { capable: true, title: "Estudos", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f5" },
    { media: "(prefers-color-scheme: dark)", color: "#121826" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
