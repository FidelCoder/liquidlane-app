import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiquidLane",
  description: "Buy Fiber receive capacity from providers who operate their own nodes. CKB testnet marketplace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
