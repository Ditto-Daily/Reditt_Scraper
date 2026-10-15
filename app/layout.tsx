import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Reddit Market Intelligence",
  description: "Extract audience language, identify market themes, and turn Reddit conversations into marketing insights.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
