import React from "react";
import { BillRecord } from "../types";

interface UtilityTrackerProps {
  history: BillRecord[];
}

export default function UtilityTracker({ history }: UtilityTrackerProps) {
  const records = Array.isArray(history) ? history : [];
  
  // Extract unique provider names/utility types
  const providers = Array.from(new Set(records.map((r) => r.provider_name || r.utility_type).filter(Boolean))) as string[];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {providers.map((provider) => {
        const providerBills = records.filter((r) => (r.provider_name || r.utility_type) === provider);
        const hasUnpaid = providerBills.some((r) => !r.is_paid_status);
        const utilityType = providerBills[0]?.utility_type || "Utility";

        // Dynamic styling: Green if all paid, Red if any unpaid
        const statusBorder = hasUnpaid ? "border-rose-500/80 bg-rose-950/10" : "border-emerald-500/80 bg-emerald-950/10";
        const badgeColor = hasUnpaid ? "text-rose-400 bg-rose-500/10" : "text-emerald-400 bg-emerald-500/10";
        const glowShadow = hasUnpaid ? "shadow-lg shadow-rose-950/30" : "shadow-lg shadow-emerald-950/30";

        return (
          <div
            key={provider}
            className={`p-5 rounded-3xl border transition-all duration-300 flex items-center justify-between ${statusBorder} ${glowShadow}`}
          >
            <div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${badgeColor}`}>
                {utilityType} {hasUnpaid ? "• Unpaid Bills" : "• All Paid"}
              </span>
              <h4 className="text-base font-bold text-slate-100 mt-1.5">{provider}</h4>
            </div>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${hasUnpaid ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}