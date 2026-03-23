import Script from "next/script";

import "@excalidraw/excalidraw/index.css";

import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sketch Cloud",
  description:
    "A cloud-backed, local-first collaborative sketching workspace powered by Excalidraw.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Script id="excalidraw-assets" strategy="beforeInteractive">
          {`window["EXCALIDRAW_ASSET_PATH"] = window.origin;`}
        </Script>
        {children}
      </body>
    </html>
  );
}
