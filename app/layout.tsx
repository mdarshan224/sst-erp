import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sohan Soft Tech | School & College Fees",
  description:
    "Secure school and PU college fee management, payments, student ledgers, reports and institution administration.",
  icons: {
    icon: "/brand/sohan-logo.png",
    shortcut: "/brand/sohan-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
