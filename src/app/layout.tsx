import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumitrader",
  description: "Plataforma de trading algorítmico inteligente com foco em XAUUSD.",
  applicationName: "Lumitrader",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
