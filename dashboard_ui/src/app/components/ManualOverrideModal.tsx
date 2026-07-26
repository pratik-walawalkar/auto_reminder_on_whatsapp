// dashboard_ui/src/app/components/ManualOverrideModal.tsx
import React, { useState } from "react";

interface ManualOverrideModalProps {
  theme: "dark" | "light";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ManualOverrideModal({ theme, t, onClose, onSuccess }: ManualOverrideModalProps) {
  const [providerName, setProviderName] = useState("");
  const [utilityType, setUtilityType] = useState("Electricity");
  const [billAmount, setBillAmount] = useState("");
  const [billingMonth, setBillingMonth] = useState("January");
  const [billingYear, setBillingYear] = useState(new Date().getFullYear().toString());
  const [dueDate, setDueDate] = useState("");
  const [unitsConsumed, setUnitsConsumed] = useState("");
  const [billingPeriodStart, setBillingPeriodStart] = useState("");
  const [billingPeriodEnd, setBillingPeriodEnd] = useState("");
  
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const isDark = theme === "dark";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");

    try {
      const activeHostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const apiBaseUrl = activeHostname !== "localhost" && activeHostname !== "127.0.0.1"
        ? `http://${activeHostname}:9444`
        : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:9444");

      const payload = {
        provider_name: providerName,
        utility_type: utilityType,
        bill_amount: parseFloat(billAmount) || 0,
        billing_month: billingMonth,
        billing_year: parseInt(billingYear, 10),
        due_date: dueDate || null,
        units_consumed: unitsConsumed ? parseFloat(unitsConsumed) : null,
        billing_period_start: billingPeriodStart || null,
        billing_period_end: billingPeriodEnd || null,
        status: "Pending",
      };

      const res = await fetch(`${apiBaseUrl}/api/v1/bills/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to submit manual entry to backend.");

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred while saving.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className={`w-full max-w-xl rounded-3xl border p-6 shadow-2xl overflow-hidden relative ${isDark ? "bg-slate-900 border-slate-800 text-slate-200" : "bg-white border-slate-200 text-slate-800"}`}>
        
        {/* Subtle top-edge glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
              {t.lang === "mr" ? "मॅन्युअल बिल एंट्री जोडा" : "Add Manual Utility Entry"}
            </h3>
            <p className="text-xs text-slate-400">Record bills manually with consumption metrics and billing cycles.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl font-bold p-1">×</button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Provider Name</label>
              <input
                type="text"
                required
                placeholder="e.g. MSEDCL"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-all ${isDark ? "bg-slate-950/60 border-slate-800 text-white focus:border-blue-500" : "bg-slate-50 border-slate-300 focus:border-blue-500"}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Utility Type</label>
              <select
                value={utilityType}
                onChange={(e) => setUtilityType(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-all ${isDark ? "bg-slate-950/60 border-slate-800 text-white focus:border-blue-500" : "bg-slate-50 border-slate-300 focus:border-blue-500"}`}
              >
                <option value="Electricity">Electricity</option>
                <option value="Water Supply">Water Supply</option>
                <option value="Piped Gas">Piped Gas</option>
                <option value="Internet & Fiber">Internet & Fiber</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Bill Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-all ${isDark ? "bg-slate-950/60 border-slate-800 text-white focus:border-blue-500" : "bg-slate-50 border-slate-300 focus:border-blue-500"}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Units Consumed (KPI)</label>
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 150 kWh"
                value={unitsConsumed}
                onChange={(e) => setUnitsConsumed(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-all ${isDark ? "bg-slate-950/60 border-slate-800 text-white focus:border-blue-500" : "bg-slate-50 border-slate-300 focus:border-blue-500"}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Billing Month</label>
              <select
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-all ${isDark ? "bg-slate-950/60 border-slate-800 text-white focus:border-blue-500" : "bg-slate-50 border-slate-300 focus:border-blue-500"}`}
              >
                {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Billing Year</label>
              <input
                type="number"
                required
                value={billingYear}
                onChange={(e) => setBillingYear(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-all ${isDark ? "bg-slate-950/60 border-slate-800 text-white focus:border-blue-500" : "bg-slate-50 border-slate-300 focus:border-blue-500"}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Cycle Start Date</label>
              <input
                type="date"
                value={billingPeriodStart}
                onChange={(e) => setBillingPeriodStart(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-all ${isDark ? "bg-slate-950/60 border-slate-800 text-white focus:border-blue-500" : "bg-slate-50 border-slate-300 focus:border-blue-500"}`}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Cycle End Date</label>
              <input
                type="date"
                value={billingPeriodEnd}
                onChange={(e) => setBillingPeriodEnd(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-all ${isDark ? "bg-slate-950/60 border-slate-800 text-white focus:border-blue-500" : "bg-slate-50 border-slate-300 focus:border-blue-500"}`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-all ${isDark ? "bg-slate-950/60 border-slate-800 text-white focus:border-blue-500" : "bg-slate-50 border-slate-300 focus:border-blue-500"}`}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800/60">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-700 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}