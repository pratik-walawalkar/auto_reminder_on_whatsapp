import "./globals.css";
import React from "react";
import { RoyalThemeProvider } from "./theme-provider";
import PwaRegistration from "./components/PwaRegistration";

export const metadata = {
  title: "Walawalkar's Dashboard",
  description: "Continuous time-series utility data warehouse platform.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of light theme by applying theme class synchronously before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                let theme = localStorage.getItem("royal-ledger-theme");
                let dark = theme === "dark" || (!theme || theme === "system") && window.matchMedia("(prefers-color-scheme: dark)").matches;
                if (dark) {
                  document.documentElement.classList.add("dark");
                } else {
                  document.documentElement.classList.remove("dark");
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="antialiased selection:bg-blue-500/20" suppressHydrationWarning>
        <RoyalThemeProvider>
          {children}
          <PwaRegistration />
        </RoyalThemeProvider>
      </body>
    </html>
  );
}