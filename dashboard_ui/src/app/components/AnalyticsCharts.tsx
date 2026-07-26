// dashboard_ui/src/app/components/AnalyticsCharts.tsx
import React from "react";
import { MetricData, BillRecord } from "../types";

interface AnalyticsChartsProps {
  metrics: MetricData | null;
  history: BillRecord[];
  rawHistory: BillRecord[];
  theme: "dark" | "light";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

export default function AnalyticsCharts({
  metrics,
  history,
  theme,
  t,
}: AnalyticsChartsProps) {
  const isDark = theme === "dark";

  const aggregates = metrics?.provider_historical_aggregates || [];

  return (
    <div className="flex flex-col space-y-6 w-full">
      {/* Provider Spending Breakdown */}
      <div
        className={`p-6 rounded-2xl border transition-colors ${
          isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}
      >
        <h3 className="text-base font-bold mb-4">
          {t.lang === "mr" ? "पुरवठादारानुसार खर्च" : "Spending by Provider"}
        </h3>
        {aggregates.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-400 text-xs">
            {t.lang === "mr" ? "कोणताही डेटा उपलब्ध नाही" : "No analytics data available"}
          </div>
        ) : (
          <div className="space-y-4">
            {aggregates.map((item, idx) => {
              const maxSpent = Math.max(...aggregates.map((a) => a.total_spent), 1);
              const percentage = Math.round((item.total_spent / maxSpent) * 100);

              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>{item.provider}</span>
                    <span className="text-blue-500">₹ {item.total_spent.toLocaleString("en-IN")}</span>
                  </div>
                  <div
                    className={`w-full h-2.5 rounded-full overflow-hidden ${
                      isDark ? "bg-slate-800" : "bg-slate-100"
                    }`}
                  >
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Bill Trend Activity */}
      <div
        className={`p-6 rounded-2xl border transition-colors ${
          isDark ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}
      >
        <h3 className="text-base font-bold mb-4">
          {t.lang === "mr" ? "अलीकडील युटिलिटी बिले" : "Recent Bill Activities"}
        </h3>
        {history.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-400 text-xs">
            {t.lang === "mr" ? "कोणत्याही नोंदी आढळल्या नाहीत" : "No billing history found"}
          </div>
        ) : (
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {history.slice(0, 5).map((record) => (
              <div
                key={record.id}
                className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                  isDark ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-100"
                }`}
              >
                <div>
                  <p className="font-bold">{record.provider_name}</p>
                  <p className="text-slate-400 text-[10px]">
                    {record.billing_month} {record.billing_year} • {record.utility_type}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-200">₹ {record.bill_amount?.toLocaleString("en-IN")}</p>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      record.is_paid_status
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-rose-500/10 text-rose-500"
                    }`}
                  >
                    {record.is_paid_status ? t.paid : t.unpaid}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}