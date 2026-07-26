// dashboard_ui/src/app/components/FilterToolbar.tsx
import React from "react";

interface FilterToolbarProps {
  selectedProviderFilter: string;
  setSelectedProviderFilter: (val: string) => void;
  timeRangeFilter: string;
  setTimeRangeFilter: (val: string) => void;
  customStartDate: string;
  setCustomStartDate: (val: string) => void;
  customEndDate: string;
  setCustomEndDate: (val: string) => void;
  theme: "dark" | "light";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

export default function FilterToolbar({
  selectedProviderFilter,
  setSelectedProviderFilter,
  timeRangeFilter,
  setTimeRangeFilter,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  theme,
  t,
}: FilterToolbarProps) {
  const isDark = theme === "dark";

  return (
    <div
      className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 transition-colors ${
        isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
      }`}
    >
      {/* Provider Filter */}
      <div className="flex items-center space-x-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t.provider}:
        </label>
        <select
          value={selectedProviderFilter}
          onChange={(e) => setSelectedProviderFilter(e.target.value)}
          className={`text-xs rounded-lg px-3 py-2 border outline-none font-medium transition-colors ${
            isDark
              ? "bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-500"
              : "bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500"
          }`}
        >
          <option value="">{t.lang === "mr" ? "सर्व पुरवठादार" : "All Providers"}</option>
          <option value="MSEDCL">MSEDCL (Electricity)</option>
          <option value="MJP">MJP (Water)</option>
          <option value="Adani Gas">Adani Gas</option>
          <option value="Airtel Fiber">Airtel Fiber</option>
        </select>
      </div>

      {/* Time Range Filter */}
      <div className="flex items-center space-x-2 flex-wrap gap-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t.lang === "mr" ? "काळ:" : "Timeline:"}
        </label>
        <select
          value={timeRangeFilter}
          onChange={(e) => setTimeRangeFilter(e.target.value)}
          className={`text-xs rounded-lg px-3 py-2 border outline-none font-medium transition-colors ${
            isDark
              ? "bg-slate-900 border-slate-700 text-slate-200 focus:border-blue-500"
              : "bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500"
          }`}
        >
          <option value="lifetime">{t.lang === "mr" ? "सर्व काळ" : "Lifetime"}</option>
          <option value="this_month">{t.lang === "mr" ? "हा महिना" : "This Month"}</option>
          <option value="last_3_months">{t.lang === "mr" ? "मागील ३ महिने" : "Last 3 Months"}</option>
          <option value="custom">{t.lang === "mr" ? "सानुकूल श्रेणी" : "Custom Range"}</option>
        </select>

        {timeRangeFilter === "custom" && (
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className={`text-xs rounded-lg px-2.5 py-1.5 border outline-none ${
                isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
              }`}
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className={`text-xs rounded-lg px-2.5 py-1.5 border outline-none ${
                isDark ? "bg-slate-900 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
              }`}
            />
          </div>
        )}
      </div>
    </div>
  );
}