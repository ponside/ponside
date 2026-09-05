import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    qualities: [75, 95],
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com", pathname: "/profile_images/**" },
      { protocol: "https", hostname: "abs.twimg.com", pathname: "/sticky/default_profile_images/**" },
      { protocol: "https", hostname: "ethereum.org", pathname: "/_next/image/**" },
      { protocol: "https", hostname: "ethereum.org", pathname: "/images/assets/svgs/**" },
    ],
  },
};

export default nextConfig;
