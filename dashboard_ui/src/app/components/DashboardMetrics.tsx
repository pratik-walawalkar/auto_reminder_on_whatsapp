// dashboard_ui/src/app/components/DashboardMetrics.tsx
import React from "react";
import { MetricData, BillRecord } from "../types";

interface DashboardMetricsProps {
  history: BillRecord[];
  metrics: MetricData | null;
  theme: "dark" | "light";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

export default function DashboardMetrics({
  history,
  metrics,
  theme,
  t,
}: DashboardMetricsProps) {
  const isDark = theme === "dark";

  const totalOutstanding = metrics?.total_outstanding_payable ?? 
    history
      .filter((item) => !item.is_paid_status)
      .reduce((sum, item) => sum + (item.bill_amount || 0), 0);

  const totalClearedMonth = metrics?.total_cleared_current_month ?? 
    history
      .filter((item) => item.is_paid_status)
      .reduce((sum, item) => sum + (item.bill_amount || 0), 0);

  const activeProvidersCount = metrics?.provider_historical_aggregates?.length ?? 4;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Total Outstanding Card */}
      <div
        className={`p-6 rounded-2xl border transition-colors ${
          isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t.totalOutstanding}
          </p>
          <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>
        <h3 className="text-3xl font-extrabold mt-4 tracking-tight text-rose-500">
          ₹ {totalOutstanding.toLocaleString("en-IN")}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {t.lang === "mr" ? "देय बाकी एकूण रक्कम" : "Pending bills to be paid"}
        </p>
      </div>

      {/* Total Cleared Card */}
      <div
        className={`p-6 rounded-2xl border transition-colors ${
          isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t.totalCleared}
          </p>
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>
        <h3 className="text-3xl font-extrabold mt-4 tracking-tight text-emerald-500">
          ₹ {totalClearedMonth.toLocaleString("en-IN")}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {t.lang === "mr" ? "यशस्वीरित्या भरलेली रक्कम" : "Successfully cleared utility bills"}
        </p>
      </div>

      {/* Active Providers Card */}
      <div
        className={`p-6 rounded-2xl border transition-colors ${
          isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t.activeProviders}
          </p>
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
        </div>
        <h3 className="text-3xl font-extrabold mt-4 tracking-tight">
          {activeProvidersCount}
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          {t.lang === "mr" ? "वीज, पाणी, गॅस आणि इंटरनेट" : "Electricity, Water, Gas & Internet"}
        </p>
      </div>
    </div>
  );
}