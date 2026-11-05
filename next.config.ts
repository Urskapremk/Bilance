import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "::1", "0.0.0.0", "**.trycloudflare.com"],
  serverExternalPackages: ["pdfjs-dist", "tesseract.js", "tesseract.js-core", "sharp"],
  outputFileTracingIncludes: {
    "/api/bruto-bilanca": ["./public/sources/**", "./node_modules/pdfjs-dist/legacy/build/**"],
    "/api/ajpes-obrazec": ["./node_modules/pdfjs-dist/legacy/build/**"],
    "/api/pdf": ["./src/lib/fonts/**"],
    "/api/obrazec-dh": ["./data/templates/dh/**"],
    "/api/obrazec-dh/vloga": ["./data/templates/dh/**", "./src/lib/fonts/**"],
    "/api/zavihek-045": ["./data/tessdata/**", "./node_modules/tesseract.js/**", "./node_modules/tesseract.js-core/**"],
    "/api/starost": ["./data/tessdata/**", "./node_modules/tesseract.js/**", "./node_modules/tesseract.js-core/**"],
    "/api/razkritja": ["./data/templates/dh/**"],
  },
};

export default nextConfig;
