import "./globals.css";
import React from "react";
import { RoyalThemeProvider } from "./theme-provider";

export const metadata = {
  title: "Sapphire Billing Ledger",
  description: "Continuous time-series utility data warehouse platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-blue-500/20">
        <RoyalThemeProvider>
          {children}
        </RoyalThemeProvider>
      </body>
    </html>
  );
}
