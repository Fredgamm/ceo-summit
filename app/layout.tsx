import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { SPLASH_DEVICES, splashMediaQuery } from "@/lib/apple-splash-screens";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CEO Summit — Le cercle des décideurs de l'Océan Indien",
    template: "%s · CEO Summit",
  },
  description:
    "CEO Summit est le cercle de référence des dirigeants de l'Océan Indien : événements premium, membership sélectif, Deal Room et intelligence business.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CEO Summit",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
    other: SPLASH_DEVICES.map((device) => ({
      rel: "apple-touch-startup-image",
      url: `/splash/${device.name}.png`,
      media: splashMediaQuery(device),
    })),
  },
};

export const viewport: Viewport = {
  themeColor: "#1A2B5F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-surface text-text">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-navy focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-card-lg"
        >
          Aller au contenu principal
        </a>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
