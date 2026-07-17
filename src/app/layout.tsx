import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClientBody from "./ClientBody";
import { Providers } from "@/components/Providers";
import localFont from "next/font/local";

// Selbst gehostete Variable-Fonts (aus dem Projekt geladen, kein Abruf von
// fonts.gstatic.com nötig). Ein woff2 deckt den gesamten Gewichtsbereich ab.
const sourceSans = localFont({
  src: "./fonts/source-sans-3-latin-wght-normal.woff2",
  variable: "--font-sans",
  weight: "200 900",
  display: "swap",
});
const openSans = localFont({
  src: "./fonts/open-sans-latin-wght-normal.woff2",
  variable: "--font-open",
  weight: "300 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rotary Club Wien-Donau – Finanzverwaltung",
  description: "Finanz- und Mitgliederverwaltung des Rotary Club Wien-Donau",
  applicationName: "RC Wien-Donau Finanz",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "RC Wien-Donau",
  },
  formatDetection: {
    telephone: true,
    email: true,
    address: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#17458F" },
    { media: "(prefers-color-scheme: dark)", color: "#0F2B5C" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de-AT" className={`${sourceSans.variable} ${openSans.variable}`}>
      <body suppressHydrationWarning className="antialiased">
        <Providers>
          <ClientBody>{children}</ClientBody>
        </Providers>
      </body>
    </html>
  );
}