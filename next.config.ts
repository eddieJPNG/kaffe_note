import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the app is 100% client-side, no backend required.
  // Output goes to ./out and can be deployed to any static host
  // (Vercel, Netlify, nginx, GitHub Pages, etc.).
  output: "export",
  // No next/image usage; keep the pipeline minimal.
  images: { unoptimized: true },
  // Clean URLs for static hosting (index.html resolution).
  trailingSlash: true,
};

export default nextConfig;
