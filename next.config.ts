import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sleepercdn.com",
        pathname: "/landing/web2026/img/logos/**",
      },
    ],
  },
};

export default nextConfig;
