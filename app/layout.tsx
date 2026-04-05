import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intimate Adventures - A Couples Game",
  description: "An AI-powered narrative adventure game for couples",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Intimate Adventures",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-100">
        {children}
      </body>
    </html>
  );
}
