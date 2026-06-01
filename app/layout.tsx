import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Math Solver",
  description: "Step-by-step math help for Grades 4 to 6 pupils."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
