import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chakshu Jain - Software Engineer & Data Scientist",
  description: "Software Engineer & Data Scientist at ASU. Building AI automation systems that actually ship.",
  openGraph: {
    title: "Chakshu Jain - Software Engineer & Data Scientist",
    description: "Building AI automation systems that eliminate operational drag.",
    url: "https://chakshu.dev",
    siteName: "Chakshu Jain",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chakshu Jain",
    description: "Software Engineer & Data Scientist. Building AI automation systems that actually ship.",
  },
  icons: {
    icon: [
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon/favicon-196x196.png", sizes: "196x196", type: "image/png" },
    ],
    apple: [
      { url: "/favicon/apple-touch-icon-60x60.png", sizes: "60x60", type: "image/png" },
      { url: "/favicon/apple-touch-icon-76x76.png", sizes: "76x76", type: "image/png" },
      { url: "/favicon/apple-touch-icon-120x120.png", sizes: "120x120", type: "image/png" },
      { url: "/favicon/apple-touch-icon-144x144.png", sizes: "144x144", type: "image/png" },
      { url: "/favicon/apple-touch-icon-152x152.png", sizes: "152x152", type: "image/png" },
      { url: "/favicon/apple-touch-icon-167x167.png", sizes: "167x167", type: "image/png" },
    ],
  },
  alternates: {
    canonical: "https://chakshu.dev",
  },
  keywords: ["Chakshu Jain", "Software Engineer", "Data Scientist", "ASU", "AI automation", "Tempe Arizona", "agentic AI"],
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <Script
          id="json-ld-person"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Person",
              "name": "Chakshu Jain",
              "url": "https://chakshu.dev",
              "jobTitle": "Software Engineer & Data Scientist",
              "email": "chakshuvinayjain@gmail.com",
              "sameAs": [
                "https://linkedin.com/in/chakshu-jain-281307243",
                "https://github.com/FornaxChemica"
              ]
            }),
          }}
        />
        <Script src="https://unpkg.com/@phosphor-icons/web@2.1.1/src/index.js" strategy="afterInteractive" />
        <Script src="/terminal.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
