import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chakshu Jain — Software Engineer & Data Scientist",
  description: "Software Engineer & Data Scientist at ASU. Building AI automation systems that actually ship.",
  openGraph: {
    title: "Chakshu Jain — Software Engineer & Data Scientist",
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
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='%2300e5ff'/></svg>",
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
