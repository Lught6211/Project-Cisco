import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CiscoAI // Autonomous Intelligence", description: "CiscoAI local intelligence control surface", applicationName: "CiscoAI", appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CiscoAI" } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
