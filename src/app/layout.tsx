import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chakshu Jain — Software Engineer & Data Scientist",
  description: "Software Engineer & Data Scientist at ASU. Building AI automation systems that actually ship.",
  openGraph: {
    title: "Chakshu Jain",
    description: "Software Engineer & Data Scientist. Building AI automation systems that actually ship.",
    url: "https://chakshu.dev",
    type: "website",
    siteName: "chakshu.dev",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chakshu Jain",
    description: "Software Engineer & Data Scientist. Building AI automation systems that actually ship.",
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='%2300e5ff'/></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
