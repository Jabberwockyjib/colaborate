import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@colaborate/core"],
  output: "standalone",
};

export default nextConfig;
