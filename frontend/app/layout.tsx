import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CiscoAI // Autonomous Intelligence", description: "CiscoAI voice-first intelligence wall", applicationName: "CiscoAI", appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CiscoAI" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#03040b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
