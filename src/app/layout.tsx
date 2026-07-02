import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiquidLane",
  description: "On-demand stablecoin liquidity for Fiber payment channels.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
