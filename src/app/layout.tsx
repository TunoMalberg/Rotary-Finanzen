import type { Metadata, Viewport } from "next";
import "./globals.css";
import ClientBody from "./ClientBody";
import { Providers } from "@/components/Providers";
import { Source_Sans_3, Open_Sans } from "next/font/google";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});
const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open",
  weight: ["400", "500", "600", "700"],
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