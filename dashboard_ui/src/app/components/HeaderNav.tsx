// dashboard_ui/src/app/components/HeaderNav.tsx
import React from "react";

interface HeaderNavProps {
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  lang: "en" | "mr";
  setLang: (lang: "en" | "mr") => void;
  isOffline: boolean;
  loading: boolean;
  onSync: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

export default function HeaderNav({
  theme,
  setTheme,
  lang,
  setLang,
  isOffline,
  loading,
  onSync,
  t,
}: HeaderNavProps) {
  const isDark = theme === "dark";

  const handleSyncClick = async () => {
    try {
      const activeHostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const apiBaseUrl = activeHostname !== "localhost" && activeHostname !== "127.0.0.1" 
        ? `http://${activeHostname}:9444` 
        : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:9444");

      // Trigger the backend email pipeline sync endpoint (fetches emails via Google API, parses schema, downloads attachments)
      const res = await fetch(`${apiBaseUrl}/api/v1/pipeline/sync`, { method: "POST" });
      if (!res.ok) {
        console.error("Pipeline sync failed");
      }
    } catch (error) {
      console.error("Error triggering sync pipeline:", error);
    } finally {
      // Refresh dashboard data afterwards
      await onSync();
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 backdrop-blur-md border-b transition-colors duration-300 ${
        isDark
          ? "bg-[#0b0f19]/80 border-slate-800"
          : "bg-white/80 border-slate-200"
      }`}
    >
      <div className="max-w-[1920px] mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand / Logo Info */}
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-bold text-sm leading-tight tracking-tight">
              {lang === "mr" ? "वालवलकर कुटुंब" : "Walawalkar Family"}
            </h2>
            <div className="flex items-center space-x-2 mt-0.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  isOffline
                    ? "bg-rose-500 animate-pulse"
                    : "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                }`}
              />
              <span className="text-xs text-slate-400 font-medium">
                {isOffline ? t.offline : t.online}
              </span>
            </div>
          </div>
        </div>

        {/* Controls: Sync, Language, Theme */}
        <div className="flex items-center space-x-3">
          {/* Sync Button */}
          <button
            onClick={handleSyncClick}
            disabled={loading}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 border transition-all cursor-pointer ${
              isDark
                ? "border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
                : "border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700"
            } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            title="Fetch emails via Google API, parse bills, and update queue"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-500" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{t.sync}</span>
          </button>

          {/* Language Switcher */}
          <div
            className={`flex rounded-lg p-0.5 border ${
              isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-100"
            }`}
          >
            <button
              onClick={() => setLang("en")}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                lang === "en"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLang("mr")}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                lang === "mr"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              मराठी
            </button>
          </div>

          {/* Theme Switcher Toggle */}
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`p-2 rounded-lg border transition-all cursor-pointer ${
              isDark
                ? "border-slate-800 bg-slate-900 text-amber-400 hover:bg-slate-800"
                : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            aria-label="Toggle Theme"
          >
            {isDark ? (
              // Sun icon
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              // Moon icon
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}