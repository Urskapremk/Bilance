import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "::1", "0.0.0.0", "**.trycloudflare.com"],
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/bruto-bilanca": ["./public/sources/**", "./node_modules/pdfjs-dist/legacy/build/**"],
  },
};

export default nextConfig;
