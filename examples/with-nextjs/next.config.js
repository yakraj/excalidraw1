/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: "build",
  transpilePackages: [
    "@excalidraw/common",
    "@excalidraw/element",
    "@excalidraw/excalidraw",
    "@excalidraw/math",
    "@excalidraw/utils",
  ],
};

module.exports = nextConfig;
