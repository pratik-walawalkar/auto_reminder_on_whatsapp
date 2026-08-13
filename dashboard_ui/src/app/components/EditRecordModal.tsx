// dashboard_ui/src/app/components/EditRecordModal.tsx
import React, { useState } from "react";
import { BillRecord } from "../types";
import { getApiBaseUrl } from "../lib/api";

interface EditRecordModalProps {
  record: BillRecord;
  theme: "dark" | "light" | "system";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditRecordModal({
  record,
  theme,
  t,
  onClose,
  onSuccess,
}: EditRecordModalProps) {
  const isDark = theme === "dark";
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    // FIXED: Use record.provider_name directly instead of hardcoding "MSEDCL"
    provider_name: record.provider_name || "",
    utility_type: record.utility_type || "Electricity",
    bill_amount: record.bill_amount?.toString() || "",
    tax_amount: record.tax_amount?.toString() || "0",
    due_date: record.due_date || "",
    billing_period_start: record.billing_period_start || "",
    billing_period_end: record.billing_period_end || "",
    billing_year: record.billing_year || new Date().getFullYear(),
    billing_month: record.billing_month || "",
    units_consumed: record.units_consumed?.toString() || "",
    is_paid_status: Boolean(record.is_paid_status),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/bills/edit/${record.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          bill_amount: parseFloat(formData.bill_amount) || 0,
          tax_amount: parseFloat(formData.tax_amount) || 0,
          units_consumed: parseFloat(formData.units_consumed) || 0,
          billing_year: Number(formData.billing_year),
        }),
      });

      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        alert("Failed to update utility bill record.");
      }
    } catch (err) {
      console.error("Edit record error:", err);
      alert("Error updating bill record.");
    } finally {
      setLoading(false);
    }
  };

  return (
    /* FIXED: Added items-center justify-center p-4 overflow-y-auto to prevent screen cutoff on mobile */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div
        className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border p-6 space-y-6 shadow-2xl transition-colors my-auto ${
          isDark ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">
            {t.lang === "mr" ? "बिल नोंद संपादित करा" : "Edit Bill Record"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1 text-slate-400">{t.provider || "Provider"}</label>
              <select
                value={formData.provider_name}
                onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
                className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                  isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              >
                <option value={formData.provider_name}>{formData.provider_name}</option>
                <option value="MSEDCL">MSEDCL</option>
                <option value="MJP">MJP</option>
                <option value="Adani Gas">Adani Gas</option>
                <option value="Airtel Fiber">Airtel Fiber</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-400">Utility Type</label>
              <input
                type="text"
                value={formData.utility_type}
                onChange={(e) => setFormData({ ...formData, utility_type: e.target.value })}
                className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                  isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1 text-slate-400">{t.amount || "Amount"} (₹)</label>
              <input
                type="number"
                step="0.01"
                value={formData.bill_amount}
                onChange={(e) => setFormData({ ...formData, bill_amount: e.target.value })}
                className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                  isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
                required
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-400">Units Consumed</label>
              <input
                type="number"
                step="0.01"
                value={formData.units_consumed}
                onChange={(e) => setFormData({ ...formData, units_consumed: e.target.value })}
                className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                  isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1 text-slate-400">Billing Month</label>
              <input
                type="text"
                value={formData.billing_month}
                onChange={(e) => setFormData({ ...formData, billing_month: e.target.value })}
                className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                  isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1 text-slate-400">Billing Year</label>
              <input
                type="number"
                value={formData.billing_year}
                onChange={(e) => setFormData({ ...formData, billing_year: Number(e.target.value) })}
                className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                  isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1 text-slate-400">Due Date</label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                  isDark ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                }`}
              />
            </div>
            <div className="flex items-center space-x-3 pt-4 sm:pt-6">
              <input
                type="checkbox"
                id="edit_is_paid_status"
                checked={formData.is_paid_status}
                onChange={(e) => setFormData({ ...formData, is_paid_status: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="edit_is_paid_status" className="font-semibold text-slate-300 cursor-pointer">
                Mark as Paid
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-inherit">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Updating..." : "Update Record"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}