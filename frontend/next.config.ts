import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep empty for now. Turbopack can resolve the package once it's installed as
  // a normal folder in node_modules (not an external symlink).
};

export default nextConfig;
