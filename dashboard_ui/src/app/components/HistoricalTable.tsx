import React, { useState } from "react";
import { BillRecord } from "../types";

interface HistoricalTableProps {
  history: BillRecord[];
  theme: "dark" | "light";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  selectedProvider: string;
  setSelectedProvider: (val: string) => void;
  selectedYear: string;
  setSelectedYear: (val: string) => void;
  selectedMonth?: string;
  onRefresh: () => void;
  onEditRecord?: (record: BillRecord) => void;
}

export default function HistoricalTable({
  history,
  theme,
  t,
  searchTerm,
  setSearchTerm,
  selectedProvider,
  setSelectedProvider,
  selectedYear,
  setSelectedYear,
  selectedMonth = "All",
  onRefresh,
}: HistoricalTableProps) {
  const isDark = theme === "dark";
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  
  const [editingRecord, setEditingRecord] = useState<BillRecord | null>(null);
  const [formData, setFormData] = useState({
    provider_name: "",
    utility_type: "",
    bill_amount: 0,
    billing_month: "",
    billing_year: new Date().getFullYear(),
    due_date: "",
    units_consumed: 0,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleOpenEdit = (record: BillRecord) => {
    setEditingRecord(record);
    setFormData({
      provider_name: record.provider_name || "",
      utility_type: record.utility_type || "",
      bill_amount: record.bill_amount || 0,
      billing_month: record.billing_month || "",
      billing_year: record.billing_year || new Date().getFullYear(),
      due_date: record.due_date || "",
      units_consumed: record.units_consumed || 0,
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setIsSaving(true);

    try {
      const activeHostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const apiBaseUrl = activeHostname !== "localhost" && activeHostname !== "127.0.0.1" 
        ? `http://${activeHostname}:9444` 
        : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:9444");

      const res = await fetch(`${apiBaseUrl}/api/v1/bills/${editingRecord.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setEditingRecord(null);
        onRefresh();
      } else {
        alert("Failed to update bill record.");
      }
    } catch (err) {
      console.error("Update error:", err);
      alert("Error updating bill record.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (record: BillRecord) => {
    setUpdatingId(record.id);
    try {
      const activeHostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const apiBaseUrl = activeHostname !== "localhost" && activeHostname !== "127.0.0.1" 
        ? `http://${activeHostname}:9444` 
        : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:9444");

      const nextStatus = !record.is_paid_status;
      const res = await fetch(`${apiBaseUrl}/api/v1/bills/${record.id}/status?is_paid=${nextStatus}`, {
        method: "PATCH",
      });

      if (res.ok) {
        onRefresh();
      } else {
        alert("Failed to update bill payment status.");
      }
    } catch (err) {
      console.error("Status update error:", err);
      alert("Error updating payment status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this bill record?")) return;
    try {
      const activeHostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const apiBaseUrl = activeHostname !== "localhost" && activeHostname !== "127.0.0.1" 
        ? `http://${activeHostname}:9444` 
        : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:9444");

      const res = await fetch(`${apiBaseUrl}/api/v1/bills/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        onRefresh();
      } else {
        alert("Failed to delete bill record.");
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Error deleting bill record.");
    }
  };

  const filteredHistory = (Array.isArray(history) ? history : []).filter((record) => {
    const matchesSearch = record.provider_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          record.utility_type?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProvider = selectedProvider === "All" || record.provider_name === selectedProvider;
    const matchesYear = selectedYear === "All" || String(record.billing_year) === selectedYear;
    
    let matchesMonth = true;
    if (selectedMonth !== "All") {
      const recordMonthRaw = String(record.billing_month || "").trim().toLowerCase();
      const selectedMonthLower = selectedMonth.toLowerCase();
      
      const monthsList = [
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december"
      ];
      
      let recordMonthNum = recordMonthRaw;
      const monthIdx = monthsList.indexOf(recordMonthRaw);
      if (monthIdx !== -1) {
        recordMonthNum = String(monthIdx + 1);
      }

      let selectedMonthNum = selectedMonthLower;
      const selectedIdx = monthsList.indexOf(selectedMonthLower);
      if (selectedIdx !== -1) {
        selectedMonthNum = String(selectedIdx + 1);
      }

      matchesMonth = recordMonthRaw === selectedMonthLower || 
                     recordMonthNum === selectedMonthNum ||
                     recordMonthRaw.includes(selectedMonthLower);
    }

    return matchesSearch && matchesProvider && matchesYear && matchesMonth;
  });

  const getTrendData = (currentIndex: number, currentRecord: BillRecord, field: 'bill_amount' | 'units_consumed') => {
    const fullList = Array.isArray(history) ? history : [];
    const sameUtilityRecords = fullList.filter(
      (r) => r.utility_type?.toLowerCase() === currentRecord.utility_type?.toLowerCase() && r.id !== currentRecord.id
    );

    if (sameUtilityRecords.length === 0) return null;

    const sorted = sameUtilityRecords.sort((a, b) => (b.billing_year || 0) - (a.billing_year || 0) || b.id - a.id);
    const prevRecord = sorted.find(r => (r.billing_year || 0) <= (currentRecord.billing_year || 0));

    if (!prevRecord) return null;

    const currVal = Number(currentRecord[field]) || 0;
    const prevVal = Number(prevRecord[field]) || 0;

    if (prevVal === 0) return null;

    const diff = currVal - prevVal;
    const percentage = Math.abs((diff / prevVal) * 100).toFixed(1);

    return {
      isUp: diff > 0,
      isEqual: diff === 0,
      percentage: Number(percentage),
    };
  };

  const renderTrendBadge = (trend: { isUp: boolean; isEqual: boolean; percentage: number } | null) => {
    if (!trend) return null; // Hide if no prior history available
    if (trend.isEqual) {
      return (
        <span className="text-[10px] text-slate-500 font-medium ml-2 px-1.5 py-0.5 rounded bg-slate-800/40">
          Flat
        </span>
      );
    }

    const colorClass = trend.isUp ? "text-rose-400 bg-rose-500/10 border border-rose-500/20" : "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20";
    const arrow = trend.isUp ? "▲" : "▼";

    return (
      <span className={`inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ml-2 ${colorClass}`}>
        <span>{arrow}</span>
        <span>{trend.percentage}%</span>
      </span>
    );
  };

  const exportToCSV = () => {
    if (!filteredHistory.length) return;
    const headers = ["ID", "Provider Name", "Utility Type", "Billing Month", "Billing Year", "Due Date", "Amount (₹)", "Units Consumed", "Status"];
    const rows = filteredHistory.map((item) => [
      item.id,
      `"${item.provider_name || ""}"`,
      `"${item.utility_type || ""}"`,
      `"${item.billing_month || ""}"`,
      item.billing_year || "",
      `"${item.due_date || ""}"`,
      item.bill_amount || 0,
      item.units_consumed || 0,
      item.is_paid_status ? "Paid" : "Pending",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "historical_bills_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcelXLSX = () => {
    if (!filteredHistory.length) return;
    let html = `<table><tr><th>ID</th><th>Provider Name</th><th>Utility Type</th><th>Billing Month</th><th>Billing Year</th><th>Due Date</th><th>Amount (₹)</th><th>Units Consumed</th><th>Status</th></tr>`;
    filteredHistory.forEach((item) => {
      html += `<tr><td>${item.id}</td><td>${item.provider_name || ""}</td><td>${item.utility_type || ""}</td><td>${item.billing_month || ""}</td><td>${item.billing_year || ""}</td><td>${item.due_date || ""}</td><td>${item.bill_amount || 0}</td><td>${item.units_consumed || 0}</td><td>${item.is_paid_status ? "Paid" : "Pending"}</td></tr>`;
    });
    html += `</table>`;

    const blob = new Blob([html], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "historical_bills_export.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className={`relative rounded-3xl border overflow-hidden transition-all duration-300 ${
        isDark
          ? "bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-[#0b0f19] border-slate-800/80 shadow-2xl shadow-blue-950/20"
          : "bg-white border-slate-200/80 shadow-xl shadow-slate-200/50"
      }`}
    >
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header & Filters */}
      <div className="p-6 border-b border-inherit flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
              {t.billHistory || "Billing Ledger & History"}
            </h3>
            {selectedMonth !== "All" && (
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold">
                Filtered: {selectedMonth} {selectedYear}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {t.lang === "mr" ? "सर्व युटिलिटी बिल नोंदी आणि तपशील" : "Complete registry of all utility bills and records"}
          </p>
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <div className="relative">
            <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t.searchBills || "Search bills..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pl-9 pr-4 py-2 rounded-xl text-xs border outline-none font-medium ${
                isDark ? "bg-slate-900/80 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
              }`}
            />
          </div>

          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className={`px-3 py-2 rounded-xl text-xs border outline-none font-medium ${
              isDark ? "bg-slate-900/80 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
            }`}
          >
            <option value="All">{t.allProviders || "All Providers"}</option>
            <option value="MSEDCL">MSEDCL</option>
            <option value="MJP">MJP</option>
            <option value="Adani Gas">Adani Gas</option>
            <option value="Airtel Fiber">Airtel Fiber</option>
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className={`px-3 py-2 rounded-xl text-xs border outline-none font-medium ${
              isDark ? "bg-slate-900/80 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
            }`}
          >
            <option value="All">{t.allYears || "All Years"}</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>

          <button
            onClick={exportToCSV}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg transition-all cursor-pointer"
          >
            <span>CSV</span>
          </button>

          <button
            onClick={exportToExcelXLSX}
            className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg transition-all cursor-pointer"
          >
            <span>Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Table with custom aesthetic scrollbars matching theme */}
      <div className={`overflow-x-auto ${isDark ? "custom-scrollbar-dark" : "custom-scrollbar-light"}`}>
        <style jsx>{`
          .custom-scrollbar-dark::-webkit-scrollbar {
            height: 6px;
            width: 6px;
          }
          .custom-scrollbar-dark::-webkit-scrollbar-track {
            background: rgba(15, 23, 42, 0.6);
          }
          .custom-scrollbar-dark::-webkit-scrollbar-thumb {
            background: rgba(51, 65, 85, 0.8);
            border-radius: 9999px;
          }
          .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover {
            background: rgba(71, 85, 105, 1);
          }

          .custom-scrollbar-light::-webkit-scrollbar {
            height: 6px;
            width: 6px;
          }
          .custom-scrollbar-light::-webkit-scrollbar-track {
            background: rgba(241, 245, 249, 0.8);
          }
          .custom-scrollbar-light::-webkit-scrollbar-thumb {
            background: rgba(203, 213, 225, 1);
            border-radius: 9999px;
          }
          .custom-scrollbar-light::-webkit-scrollbar-thumb:hover {
            background: rgba(148, 163, 184, 1);
          }
        `}</style>
        <table className="w-full text-left text-xs whitespace-nowrap">
          <thead
            className={`uppercase tracking-wider ${
              isDark ? "bg-slate-900/80 text-slate-400 border-b border-slate-800" : "bg-slate-50 text-slate-500 border-b border-slate-200"
            }`}
          >
            <tr>
              <th className="px-6 py-3.5 font-semibold">{t.provider || "Provider"}</th>
              <th className="px-6 py-3.5 font-semibold">Utility</th>
              <th className="px-6 py-3.5 font-semibold">Billing Cycle</th>
              <th className="px-6 py-3.5 font-semibold">{t.amount || "Amount"}</th>
              <th className="px-6 py-3.5 font-semibold">Consumption</th>
              <th className="px-6 py-3.5 font-semibold">{t.status || "Status"}</th>
              <th className="px-6 py-3.5 font-semibold text-right">{t.actions || "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-inherit">
            {filteredHistory.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-slate-500 text-xs">
                  No matching historical records found for this period.
                </td>
              </tr>
            ) : (
              filteredHistory.map((record, index) => {
                const amountTrend = getTrendData(index, record, 'bill_amount');
                const unitsTrend = getTrendData(index, record, 'units_consumed');

                return (
                  <tr key={record.id} className={`transition-colors ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                    <td className="px-6 py-4">
                      <span className="font-bold">{record.provider_name}</span>
                      <span className="block text-[10px] text-slate-400">Due: {record.due_date || "N/A"}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-medium">{record.utility_type}</td>
                    
                    <td className="px-6 py-4 text-slate-400 text-[11px]">
                      <span className="block font-semibold text-slate-300">{record.billing_month} {record.billing_year}</span>
                      {record.billing_period_start && record.billing_period_end ? (
                         <span>{record.billing_period_start} to {record.billing_period_end}</span>
                      ) : (
                         <span>Cycle unavailable</span>
                      )}
                    </td>
                    
                    <td className="px-6 py-4 font-bold text-slate-200 flex items-center">
                      <span>₹ {record.bill_amount?.toLocaleString("en-IN")}</span>
                      {renderTrendBadge(amountTrend)}
                    </td>
                    
                    <td className="px-6 py-4 text-slate-300">
                      {record.units_consumed ? (
                        <div className="inline-flex items-center space-x-1">
                          <span className="px-2 py-1 bg-slate-800 rounded-md text-[10px] font-bold text-slate-200">
                            {record.units_consumed} Units
                          </span>
                          {renderTrendBadge(unitsTrend)}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <button
                        disabled={updatingId === record.id}
                        onClick={() => handleToggleStatus(record)}
                        className={`px-3 py-1 rounded-full font-semibold text-[10px] border transition-all cursor-pointer ${
                          record.is_paid_status
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
                            : "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20"
                        }`}
                      >
                        {updatingId === record.id ? "Updating..." : record.is_paid_status ? (t.paid || "Paid") : (t.unpaid || "Unpaid")}
                      </button>
                    </td>

                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenEdit(record)}
                        className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors font-bold text-[11px] border border-blue-500/35 inline-flex items-center justify-center cursor-pointer"
                        title="Edit Record"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors inline-flex items-center justify-center cursor-pointer"
                        title="Delete Record"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Built-in Edit Input Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div
            className={`w-full max-w-lg p-6 rounded-3xl border shadow-2xl transition-all ${
              isDark ? "bg-slate-900 border-slate-800 text-slate-200" : "bg-white border-slate-200 text-slate-800"
            }`}
          >
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-inherit">
              <h3 className="text-lg font-extrabold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
                Edit Bill Record (ID: {editingRecord.id})
              </h3>
              <button
                onClick={() => setEditingRecord(null)}
                className="p-1.5 rounded-xl bg-slate-800/50 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1 text-slate-400">Provider Name</label>
                  <input
                    type="text"
                    value={formData.provider_name}
                    onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
                    className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                      isDark ? "bg-slate-950 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-400">Utility Type</label>
                  <input
                    type="text"
                    value={formData.utility_type}
                    onChange={(e) => setFormData({ ...formData, utility_type: e.target.value })}
                    className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                      isDark ? "bg-slate-950 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
                    }`}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1 text-slate-400">Amount (₹)</label>
                  <input
                    type="number"
                    value={formData.bill_amount}
                    onChange={(e) => setFormData({ ...formData, bill_amount: Number(e.target.value) })}
                    className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                      isDark ? "bg-slate-950 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-400">Units Consumed</label>
                  <input
                    type="number"
                    value={formData.units_consumed}
                    onChange={(e) => setFormData({ ...formData, units_consumed: Number(e.target.value) })}
                    className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                      isDark ? "bg-slate-950 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1 text-slate-400">Billing Month</label>
                  <input
                    type="text"
                    value={formData.billing_month}
                    onChange={(e) => setFormData({ ...formData, billing_month: e.target.value })}
                    className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                      isDark ? "bg-slate-950 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
                    }`}
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-400">Billing Year</label>
                  <input
                    type="number"
                    value={formData.billing_year}
                    onChange={(e) => setFormData({ ...formData, billing_year: Number(e.target.value) })}
                    className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                      isDark ? "bg-slate-950 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
                    }`}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-400">Due Date</label>
                <input
                  type="text"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className={`w-full p-2.5 rounded-xl border outline-none font-medium ${
                    isDark ? "bg-slate-950 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-800"
                  }`}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-inherit">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg transition-all cursor-pointer"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}