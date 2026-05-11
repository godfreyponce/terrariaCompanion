import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "terraria.wiki.gg" },
      { protocol: "https", hostname: "*.wiki.gg" },
    ],
  },
};

export default nextConfig;
