import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Paired deliberately: a high-contrast serif for headline moments against a
// neutral grotesque for dense data. One display face, one workhorse.
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Atlas — European universities & immigration",
  description:
    "An interactive map of European higher-education institutions with the tuition, visa and post-study work facts that actually decide where you can go.",
};

export const viewport: Viewport = {
  themeColor: "#0b0d14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrument.variable}`}>
      <body>{children}</body>
    </html>
  );
}
