import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "eVisa Operator — Arizalar markazi",
  description: "Saudi eVisa arizalarini tayyorlash va boshqarish uchun xususiy panel.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz">
      <body className="antialiased">{children}</body>
    </html>
  );
}
