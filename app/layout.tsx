import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intimate Adventures - A Couples Game",
  description: "An AI-powered narrative adventure game for couples",
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
