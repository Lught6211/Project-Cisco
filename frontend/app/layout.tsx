import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CISCO // Autonomous Intelligence", description: "Project Cisco control surface" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
