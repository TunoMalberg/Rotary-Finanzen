import type { Metadata } from "next";
import "./globals.css";
import ClientBody from "./ClientBody";
import { Providers } from "@/components/Providers";
import { Source_Sans_3, Open_Sans } from "next/font/google";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});
const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Rotary Club Wien-Donau – Finanzverwaltung",
  description: "Finanz- und Mitgliederverwaltung des Rotary Club Wien-Donau",
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
