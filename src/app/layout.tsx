import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import { TimeZoneCookie } from "@/components/TimeZoneCookie";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Reno Logbook", template: "%s · Reno Logbook" },
  description: "Run your renovation: log what happened, know what to decide next.",
  applicationName: "Reno Logbook",
  appleWebApp: { capable: true, title: "Reno Log", statusBarStyle: "black-translucent" },
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
    { media: "(prefers-color-scheme: light)", color: "#1c2b1e" },
    { media: "(prefers-color-scheme: dark)", color: "#0b120d" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        {children}
        <ServiceWorker />
        <TimeZoneCookie />
      </body>
    </html>
  );
}
