export const SITE_CONFIG = {
  PROJECT_NAME: "Ponside",
  SITE_URL: "SITE_URL_HERE",
  X_URL: "https://x.com/ponside",
  OG_IMAGE: "/og.png",
} as const;

export function getMetadataBase(): URL {
  if (SITE_CONFIG.SITE_URL.startsWith("http")) {
    return new URL(SITE_CONFIG.SITE_URL);
  }

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return new URL(vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000");
}
