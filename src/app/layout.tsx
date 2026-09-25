import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kaffe Note",
  description:
    "Notepad minimalista com persistência local duradoura (IndexedDB + localStorage).",
  applicationName: "Kaffe Note",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Kaffe Note",
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
