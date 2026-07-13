import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LAURUS — EP Plenary Companion",
  description: "Less paperwork. More wins.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
