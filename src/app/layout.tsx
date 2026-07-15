import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiquidLane",
  description: "Vault-funded liquidity for CKB and Fiber payment channels.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
