import type { Metadata } from "next";
import { JetBrains_Mono, Space_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono"
});

const display = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "Chakshu Jain - Software Engineer & Data Scientist",
  description:
    "Software Engineer & Data Scientist at ASU. Building AI automation systems that actually ship.",
  metadataBase: new URL("https://chakshu.dev")
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${mono.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}
