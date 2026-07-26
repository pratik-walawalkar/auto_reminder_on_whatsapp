// dashboard_ui/src/app/components/YoYCalendarChart.tsx
import React, { useState } from "react";
import { BillRecord } from "../types";

interface YoYCalendarChartProps {
  history: BillRecord[];
  theme: "dark" | "light";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  onSelectMonthFilter?: (month: string, year: number) => void;
  timelineFilter?: string;
  setTimelineFilter?: (val: string) => void;
}

export default function YoYCalendarChart({
  history,
  theme,
  t,
  onSelectMonthFilter,
  timelineFilter,
  setTimelineFilter,
}: YoYCalendarChartProps) {
  const isDark = theme === "dark";
  const [expandedYear, setExpandedYear] = useState<number | null>(2026);

  const monthsList = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const normalizeMonthName = (monthInput: string | number | undefined): string => {
    if (!monthInput) return "January";
    const str = String(monthInput).trim();
    if (!isNaN(Number(str))) {
      const monthIndex = parseInt(str, 10) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        return monthsList[monthIndex];
      }
    }
    const lower = str.toLowerCase();
    const found = monthsList.find(
      (m) => m.toLowerCase() === lower || m.toLowerCase().slice(0, 3) === lower.slice(0, 3)
    );
    return found || str;
  };

  const yearMap: Record<number, Record<string, BillRecord[]>> = {};
  const safeHistory = Array.isArray(history) ? history : [];

  safeHistory.forEach((item) => {
    if (!item) return;
    const yr = item.billing_year || 2026;
    const mo = normalizeMonthName(item.billing_month);

    if (!yearMap[yr]) yearMap[yr] = {};
    if (!yearMap[yr][mo]) yearMap[yr][mo] = [];
    yearMap[yr][mo].push(item);
  });

  const availableYears = Object.keys(yearMap).map(Number).sort((a, b) => b - a);
  const displayYears = availableYears.length > 0 ? availableYears : [2026, 2025];

  const handleMonthClick = (mo: string, yr: number) => {
    if (setTimelineFilter) {
      setTimelineFilter("custom");
    }
    if (onSelectMonthFilter) {
      onSelectMonthFilter(mo, yr);
    }
  };

  return (
    <div
      className={`relative p-6 rounded-3xl border overflow-visible transition-all duration-300 ${
        isDark
          ? "bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-[#0b0f19] border-slate-800/80 shadow-2xl shadow-blue-950/20"
          : "bg-white border-slate-200/80 shadow-xl shadow-slate-200/50"
      }`}
    >
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-base font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            {t.lang === "mr" ? "वर्षानुवर्षे युटिलिटी कॅलेंडर" : "Year-over-Year Calendar & Heatmap"}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {t.lang === "mr"
              ? "महिन्यानुसार खर्चाचे विश्लेषण पाहण्यासाठी वर्षावर क्लिक करा"
              : "Click any month card below to isolate that period"}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {displayYears.map((yr) => {
          const isExpanded = expandedYear === yr;
          const yearRecords = Object.values(yearMap[yr] || {}).flat();
          const yearTotal = yearRecords.reduce((acc, curr) => acc + (curr.bill_amount || 0), 0);

          return (
            <div
              key={yr}
              className={`rounded-2xl border transition-all duration-300 overflow-visible ${
                isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"
              }`}
            >
              <div
                onClick={() => setExpandedYear(isExpanded ? null : yr)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-blue-500/5 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow-md shadow-blue-500/20">
                    {yr.toString().slice(2)}
                  </div>
                  <div>
                    <span className="font-extrabold text-sm">{yr}</span>
                    <span className="text-xs text-slate-400 ml-2">
                      ({Object.keys(yearMap[yr] || {}).length} months recorded)
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="font-extrabold text-sm text-blue-400">
                    ₹ {yearTotal.toLocaleString("en-IN")}
                  </span>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {isExpanded && (
                <div className="p-4 pt-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 border-t border-inherit/40 mt-2 overflow-visible">
                  {monthsList.map((mo) => {
                    const monthItems = yearMap[yr]?.[mo] || [];
                    const amount = monthItems.reduce((acc, curr) => acc + (curr.bill_amount || 0), 0);
                    
                    let statusColorStyle = isDark
                      ? "bg-slate-900/30 border-slate-800/50 text-slate-500"
                      : "bg-slate-100 border-slate-200 text-slate-400";

                    let badgeTheme = "bg-emerald-500/10 text-emerald-400";

                    if (monthItems.length > 0) {
                      const allPaid = monthItems.every(
                        (item) => item.is_paid_status === true || item.is_paid_status === 1 || item.status?.toLowerCase() === "paid"
                      );
                      const anyPaid = monthItems.some(
                        (item) => item.is_paid_status === true || item.is_paid_status === 1 || item.status?.toLowerCase() === "paid"
                      );

                      if (allPaid) {
                        statusColorStyle = isDark
                          ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-950/20"
                          : "bg-emerald-50 border-emerald-300 text-emerald-800";
                        badgeTheme = "bg-emerald-500/10 text-emerald-400";
                      } else if (anyPaid) {
                        statusColorStyle = isDark
                          ? "bg-amber-950/30 border-amber-500/40 text-amber-300 shadow-lg shadow-amber-950/20"
                          : "bg-amber-50 border-amber-300 text-amber-800";
                        badgeTheme = "bg-amber-500/10 text-amber-400";
                      } else {
                        statusColorStyle = isDark
                          ? "bg-rose-950/30 border-rose-500/40 text-rose-300 shadow-lg shadow-rose-950/20"
                          : "bg-rose-50 border-rose-300 text-rose-800";
                        badgeTheme = "bg-rose-500/10 text-rose-400"; // Fixed badge theme to red for unpaid months
                      }
                    }

                    return (
                      <div
                        key={mo}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (monthItems.length > 0) {
                            handleMonthClick(mo, yr);
                          }
                        }}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl text-center cursor-pointer transition-all relative group ${statusColorStyle}`}
                      >
                        <div className="flex items-center justify-between w-full px-1 mb-1">
                          <span className="text-[11px] font-semibold">{mo.slice(0, 3)}</span>
                          {monthItems.length > 0 && (
                            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                          )}
                        </div>
                        
                        {amount > 0 ? (
                          <span className={`whitespace-nowrap text-[10px] font-extrabold px-1.5 py-0.5 rounded ${badgeTheme}`}>
                            ₹ {amount.toLocaleString("en-IN")}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">-</span>
                        )}

                        {/* Hover Popup Box */}
                        {monthItems.length > 0 && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block z-50 w-52 p-3 rounded-2xl bg-slate-950 border border-slate-700 text-white text-[11px] shadow-2xl pointer-events-none whitespace-normal">
                            <p className="font-bold border-b border-slate-800 pb-1 mb-1.5 text-blue-400">{mo} {yr}</p>
                            {monthItems.map((item, idx) => (
                              <div key={idx} className="flex justify-between py-0.5">
                                <span className="text-slate-300 truncate pr-2">{item.utility_type} ({item.provider_name})</span>
                                <span className="font-bold">₹{item.bill_amount?.toLocaleString("en-IN")}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}