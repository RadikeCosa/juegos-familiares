import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ServiceWorkerRegistration } from "./service-worker-registration";
import "./globals.css";

const sora = localFont({
  src: "./fonts/sora-latin.woff2",
  weight: "600",
  variable: "--font-display"
});

const sourceSans = localFont({
  src: "./fonts/source-sans-3-latin.woff2",
  weight: "400 600",
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
      <body className={`${sora.variable} ${sourceSans.variable}`}>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
