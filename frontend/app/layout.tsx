import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CiscoAI // Autonomous Intelligence", description: "CiscoAI voice-first intelligence wall", applicationName: "CiscoAI", appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CiscoAI" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#03040b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=JetBrains+Mono:wght@400;500;700;800&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
