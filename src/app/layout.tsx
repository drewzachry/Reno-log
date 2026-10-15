import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"] });
const heading = Fraunces({ variable: "--font-heading", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Reno Logbook", template: "%s · Reno Logbook" },
  description: "Run your renovation: log what happened, know what to decide next.",
  applicationName: "Reno Logbook",
  appleWebApp: { capable: true, title: "Reno Log", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ee" },
    { media: "(prefers-color-scheme: dark)", color: "#161513" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${body.variable} ${heading.variable} font-sans antialiased`}>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
