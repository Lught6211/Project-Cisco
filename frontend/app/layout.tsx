import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CISCO // Autonomous Intelligence", description: "Project Cisco control surface", applicationName: "CISCO", appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CISCO" } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
