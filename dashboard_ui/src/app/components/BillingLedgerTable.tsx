import React from "react";
import { BillRecord } from "../types"; 

interface BillingLedgerTableProps {
  ledger: BillRecord[];
  isDark: boolean;
  t: any; // Translation or terminology mapping object
}

export default function BillingLedgerTable({ ledger, isDark, t }: BillingLedgerTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800/50">
      <table className="w-full text-left text-sm whitespace-nowrap">
        <thead
          className={`uppercase tracking-wider ${
            isDark 
              ? "bg-slate-900/80 text-slate-400 border-b border-slate-800" 
              : "bg-slate-50 text-slate-500 border-b border-slate-200"
          }`}
        >
          <tr>
            <th className="px-6 py-3.5 font-semibold">{t.provider}</th>
            <th className="px-6 py-3.5 font-semibold">Utility</th>
            {/* Added Billing Cycle Header */}
            <th className="px-6 py-3.5 font-semibold">Billing Cycle</th>
            <th className="px-6 py-3.5 font-semibold">{t.amount}</th>
            {/* Added Consumption Header */}
            <th className="px-6 py-3.5 font-semibold">Consumption</th>
            <th className="px-6 py-3.5 font-semibold">{t.status}</th>
            <th className="px-6 py-3.5 font-semibold text-right">{t.actions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {ledger.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                No ledger records available.
              </td>
            </tr>
          ) : (
            ledger.map((record) => (
              <tr 
                key={record.id} 
                className={`transition-colors ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}
              >
                <td className="px-6 py-4">
                  <span className="font-bold">{record.provider_name}</span>
                  <span className="block text-[10px] text-slate-400">Due: {record.due_date || "N/A"}</span>
                </td>
                <td className="px-6 py-4 text-slate-300 font-medium">
                  {record.utility_type}
                </td>
                
                {/* Updated Billing Cycle Cell */}
                <td className="px-6 py-4 text-slate-400 text-[11px]">
                  <span className="block font-semibold text-slate-300">
                    {record.billing_month} {record.billing_year}
                  </span>
                  {record.billing_period_start && record.billing_period_end ? (
                    <span>{record.billing_period_start} to {record.billing_period_end}</span>
                  ) : (
                    <span>Cycle unavailable</span>
                  )}
                </td>
                
                <td className="px-6 py-4 font-bold text-slate-200">
                  ₹ {record.bill_amount?.toLocaleString("en-IN")}
                </td>
                
                {/* Updated Consumption KPI Cell */}
                <td className="px-6 py-4 text-slate-300">
                  {record.units_consumed ? (
                    <span className="px-2 py-1 bg-slate-800 rounded-md text-[10px] font-bold">
                      {record.units_consumed} Units
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                    record.status?.toLowerCase() === 'paid' || record.status?.toLowerCase() === 'cleared'
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                  }`}>
                    {record.status || "Pending"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors">
                    View
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}