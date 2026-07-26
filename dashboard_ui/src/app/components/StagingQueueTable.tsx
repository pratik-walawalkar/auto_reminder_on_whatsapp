// dashboard_ui/src/app/components/StagingQueueTable.tsx
import React, { useState } from "react";
import { StagingRecord } from "../types";

interface StagingQueueTableProps {
  stagingQueue: StagingRecord[];
  theme: "dark" | "light";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  onApprove: (item: StagingRecord) => Promise<void>;
  onReject: (id: number) => Promise<void>;
  onUpload: () => Promise<void>;
}

export default function StagingQueueTable({
  stagingQueue,
  theme,
  t,
  onApprove,
  onReject,
  onUpload,
}: StagingQueueTableProps) {
  const isDark = theme === "dark";
  const [uploading, setUploading] = useState(false);

  const getApiBaseUrl = () => {
    const activeHostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
    return activeHostname !== "localhost" && activeHostname !== "127.0.0.1"
      ? `http://${activeHostname}:9444`
      : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:9444");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const apiBaseUrl = getApiBaseUrl();
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${apiBaseUrl}/api/v1/pipeline/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to upload bill PDF.");
      await onUpload();
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleApproveClick = async (item: StagingRecord) => {
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/v1/pipeline/stage-approve/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error("Failed to approve staging item");
      await onApprove(item);
    } catch (err) {
      console.error("Approval error:", err);
    }
  };

  const handleRejectClick = async (id: number) => {
    try {
      const apiBaseUrl = getApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/v1/pipeline/stage-reject/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to reject staging item");
      await onReject(id);
    } catch (err) {
      console.error("Rejection error:", err);
    }
  };

  return (
    <div
      className={`relative p-6 rounded-3xl border overflow-hidden transition-all duration-300 ${
        isDark
          ? "bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-[#0b0f19] border-slate-800/80 shadow-2xl shadow-blue-950/20"
          : "bg-white border-slate-200/80 shadow-xl shadow-slate-200/50"
      }`}
    >
      {/* Top Left subtle edge highlight glow */}
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-base font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            {t.stagingQueue || "Staging Queue (Pending Review)"}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Approve or reject extracted PDF bills before pushing them to the permanent ledger.
          </p>
        </div>

        <label className="cursor-pointer px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center space-x-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span>{uploading ? "Processing PDF..." : (t.uploadPdf || "Upload Bill PDF")}</span>
          <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploading} />
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800/50">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead
            className={`uppercase tracking-wider text-[11px] ${
              isDark ? "bg-slate-900/80 text-slate-400 border-b border-slate-800" : "bg-slate-50 text-slate-500 border-b border-slate-200"
            }`}
          >
            <tr>
              <th className="px-6 py-3.5 font-bold">{t.provider || "Provider"}</th>
              <th className="px-6 py-3.5 font-bold">Utility</th>
              <th className="px-6 py-3.5 font-bold">Billing Cycle</th>
              <th className="px-6 py-3.5 font-bold">{t.amount || "Amount"}</th>
              <th className="px-6 py-3.5 font-bold">Consumption</th>
              <th className="px-6 py-3.5 font-bold text-right">{t.actions || "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {(!stagingQueue || stagingQueue.length === 0) ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500 text-xs">
                  No bills currently waiting in the staging queue.
                </td>
              </tr>
            ) : (
              stagingQueue.map((item) => (
                <tr key={item.id} className={`transition-colors ${isDark ? "hover:bg-slate-800/30" : "hover:bg-slate-50"}`}>
                  <td className="px-6 py-4">
                    <span className="font-bold text-white">{item.provider_name}</span>
                    <span className="block text-[10px] text-slate-400">Due: {item.due_date || "N/A"}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-300 font-medium">{item.utility_type}</td>
                  <td className="px-6 py-4 text-slate-400 text-[11px]">
                    <span className="block font-semibold text-slate-300">{item.billing_month} {item.billing_year}</span>
                    {item.billing_period_start && item.billing_period_end ? (
                      <span>{item.billing_period_start} to {item.billing_period_end}</span>
                    ) : (
                      <span>Cycle unavailable</span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-extrabold text-blue-400">₹ {item.bill_amount?.toLocaleString("en-IN")}</td>
                  <td className="px-6 py-4 text-slate-300">
                    {item.units_consumed ? (
                      <span className="px-2 py-1 bg-slate-800/80 rounded-md text-[10px] font-bold border border-slate-700">
                        {item.units_consumed} Units
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => handleApproveClick(item)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-bold transition-colors"
                    >
                      {t.approve || "Approve"}
                    </button>
                    <button
                      onClick={() => handleRejectClick(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold transition-colors"
                    >
                      {t.reject || "Reject"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}