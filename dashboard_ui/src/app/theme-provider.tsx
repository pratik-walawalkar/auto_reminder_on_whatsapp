"use client"; // Locked securely at the top line expression

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | undefined>(undefined);

export function RoyalThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initialization to immediately catch system preference or stored theme on hard reset
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    
    const savedTheme = localStorage.getItem("royal-ledger-theme") as Theme;
    if (savedTheme) return savedTheme;

    return "system";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    const applyTheme = (currentTheme: Theme) => {
      if (currentTheme === "system") {
        const systemMedia = window.matchMedia("(prefers-color-scheme: dark)");
        const systemMode = systemMedia.matches ? "dark" : "light";
        root.classList.add(systemMode);
      } else {
        root.classList.add(currentTheme);
      }
    };

    applyTheme(theme);
    localStorage.setItem("royal-ledger-theme", theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme("system");
      
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme invoked outside Context layout trees.");
  return context;
};