import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aula Global — Plataforma Educativa Adaptativa",
  description:
    "Plataforma educativa que adapta el contenido en tiempo real para niños con TDAH y TEA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
