import type { Metadata, Viewport } from "next";
import { Sora, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-display"
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  applicationName: "Juegos Familiares",
  title: "Juegos Familiares",
  description: "Juegos sencillos para jugar en familia.",
  appleWebApp: {
    capable: true,
    title: "Juegos Familiares",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7FAFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1320" }
  ]
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${sora.variable} ${sourceSans.variable}`}>{children}</body>
    </html>
  );
}
