import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getMetadataBase, SITE_CONFIG } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "Ponside — Coming Soon",
  description: "Ponside is coming soon.",
  applicationName: SITE_CONFIG.PROJECT_NAME,
  openGraph: {
    title: "Ponside",
    description: "Coming soon.",
    type: "website",
    images: [
      {
        url: SITE_CONFIG.OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Ponside — Coming Soon",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ponside",
    description: "Coming soon.",
    images: [SITE_CONFIG.OG_IMAGE],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#17191A",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
