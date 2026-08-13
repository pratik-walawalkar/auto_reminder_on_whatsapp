// dashboard_ui/src/app/components/HeaderNav.tsx
"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const NotificationCenter = dynamic(() => import("./NotificationCenter"), { ssr: false });
const WhatsAppStatusIndicator = dynamic(() => import("./WhatsAppStatusIndicator"), { ssr: false });

import Link from "next/link";
import { getApiBaseUrl } from "../lib/api";
import { Menu, X, Server, Database, Cpu, ExternalLink, Settings, Calendar, LayoutDashboard } from "lucide-react";

interface HeaderNavProps {
  theme: "dark" | "light" | "system";
  setTheme: (theme: "dark" | "light" | "system") => void;
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();

  const handleSyncClick = async () => {
    await onSync();
  };

  const controlButtonClass = `h-9 px-3.5 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 border transition-all cursor-pointer ${
    isDark
      ? "border-slate-800 bg-slate-900/90 hover:bg-slate-800 text-slate-300"
      : "border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700"
  }`;

  const iconOnlyButtonClass = `h-9 w-9 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
    isDark
      ? "border-slate-800 bg-slate-900/90 hover:bg-slate-800 text-slate-300"
      : "border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700"
  }`;

  return (
    <>
      <header
        className={`sticky top-0 z-50 backdrop-blur-md border-b transition-colors duration-300 ${
          isDark
            ? "bg-[#0b0f19]/80 border-slate-800"
            : "bg-white/80 border-slate-200"
        }`}
      >
        <div className="mx-auto flex max-w-[1920px] flex-col gap-2.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
              </div>

              <div className="min-w-0">
                <h2 className="font-bold text-xs sm:text-sm leading-tight tracking-tight truncate">
                  {lang === "mr" ? "वालवलकर कुटुंब" : "Walawalkar Family"}
                </h2>
                <div className="flex items-center space-x-1.5 mt-0.5">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      isOffline ? "bg-rose-500 animate-pulse" : "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                    }`}
                  />
                  <span className="text-[11px] text-slate-400 font-medium">
                    {isOffline ? t.offline : t.online}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:hidden">
              <button
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className={`h-8 w-8 rounded-lg border flex items-center justify-center text-amber-400 ${
                  isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-100"
                }`}
                aria-label="Toggle Theme"
              >
                {isDark ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              <NotificationCenter theme={theme} />

              <button
                onClick={() => setDrawerOpen(true)}
                className={`h-8 w-8 rounded-lg border flex items-center justify-center text-emerald-400 ${
                  isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-100"
                }`}
                title="System Inspectors & Tools"
              >
                <Menu className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto scrollbar-none">
            
            <button
              onClick={handleSyncClick}
              disabled={loading}
              className={`${controlButtonClass} shrink-0 ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
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

            <div
              className={`h-9 shrink-0 flex items-center rounded-lg p-0.5 border ${
                isDark ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-slate-100"
              }`}
            >
              <button
                onClick={() => setLang("en")}
                className={`h-7 px-2 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center ${
                  lang === "en"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLang("mr")}
                className={`h-7 px-2 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center ${
                  lang === "mr"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                मराठी
              </button>
            </div>

            <div className="shrink-0">
              <WhatsAppStatusIndicator />
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className={`${iconOnlyButtonClass} text-amber-400`}
                aria-label="Toggle Theme"
              >
                {isDark ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              <NotificationCenter theme={theme} />
            </div>

            <Link href="/reminders" className="shrink-0 hidden sm:block">
              <button className={`${iconOnlyButtonClass} text-blue-400 hover:text-blue-300`} title="Reminders Hub">
                <Calendar className="w-4 h-4" />
              </button>
            </Link>

            <Link href="/settings" className="shrink-0">
              <button className={`${iconOnlyButtonClass} text-slate-300 hover:text-white`} title="Settings">
                <Settings className="w-4 h-4" />
              </button>
            </Link>

            <button
              onClick={() => setDrawerOpen(true)}
              className={`${iconOnlyButtonClass} text-emerald-400 hidden sm:flex`}
              title="System Inspectors & Tools"
            >
              <Menu className="w-4 h-4" />
            </button>

          </div>
        </div>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
          <div className={`w-80 h-full p-6 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200 ${
            isDark ? "bg-slate-900 border-l border-slate-800 text-slate-100" : "bg-white border-l border-slate-200 text-slate-900"
          }`}>
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-700/50">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold">System Control Center</h3>
                </div>
                <button 
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-6 space-y-4">
                
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">App Modules</p>
                
                {/* Utility Bills Dashboard Button Added to Drawer */}
                <button 
                  onClick={() => {
                    setDrawerOpen(false);
                    router.push('/');
                  }}
                  className={`w-full text-left flex items-center justify-between p-3 rounded-xl border transition-all group mb-2 ${
                    isDark ? "bg-slate-800/60 border-slate-700/70 hover:bg-slate-800" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <LayoutDashboard className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Utility Dashboard</div>
                      <div className="text-xs text-slate-400">Bills, ledgers & analytics</div>
                    </div>
                  </div>
                </button>

                <button 
                  onClick={() => {
                    setDrawerOpen(false);
                    router.push('/reminders');
                  }}
                  className={`w-full text-left flex items-center justify-between p-3 rounded-xl border transition-all group mb-4 ${
                    isDark ? "bg-slate-800/60 border-slate-700/70 hover:bg-slate-800" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Reminders Hub</div>
                      <div className="text-xs text-slate-400">Manage WhatsApp triggers</div>
                    </div>
                  </div>
                </button>

                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 pt-2 border-t border-slate-800">Inspectors & Endpoints</p>
                
                <a 
                  href={`${getApiBaseUrl()}/docs`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all group ${
                    isDark ? "bg-slate-800/60 border-slate-700/70 hover:bg-slate-800" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">API Swagger Docs</div>
                      <div className="text-xs text-slate-400">FastAPI backend schema</div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-slate-200" />
                </a>

                <a 
                  href="http://localhost:8080/manager" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all group ${
                    isDark ? "bg-slate-800/60 border-slate-700/70 hover:bg-slate-800" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Database Manager</div>
                      <div className="text-xs text-slate-400">Direct SQL & session tables</div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-slate-200" />
                </a>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700/50 text-xs text-slate-500 text-center">
              Royal Ledger Manager v2.6
            </div>
          </div>
        </div>
      )}
    </>
  );
}