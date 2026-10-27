import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RankGPS · Explorar empresas",
  description:
    "Pesquise até 50 empresas no Google Maps e consulte categorias, sites, telefones, endereços e avaliações.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
