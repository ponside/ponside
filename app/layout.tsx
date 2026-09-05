import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getMetadataBase, SITE_CONFIG } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "Ponside",
  description: "Social trading and token discovery on Robinhood Chain.",
  applicationName: SITE_CONFIG.PROJECT_NAME,
  openGraph: {
    title: "Ponside",
    description: "Social trading and token discovery on Robinhood Chain.",
    type: "website",
    images: [
      {
        url: SITE_CONFIG.OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Ponside",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ponside",
    description: "Social trading and token discovery on Robinhood Chain.",
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0F1011",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
