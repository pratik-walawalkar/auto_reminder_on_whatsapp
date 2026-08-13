// dashboard_ui/src/app/components/HistoricalTable.tsx
"use client";
import React, { useState, useEffect } from "react";
import { BillRecord } from "../types";
import dynamic from "next/dynamic";
import { getApiBaseUrl } from "../lib/api";
import { Eye, Edit3, Trash2 } from "lucide-react";

const NotificationCenter = dynamic(() => import("./NotificationCenter"), { ssr: false });

interface HistoricalTableProps {
  history: BillRecord[];
  theme: "dark" | "light" | "system";
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
  onViewRecord?: (record: BillRecord) => void;
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
  onEditRecord,
}: HistoricalTableProps) {
  const isDark = theme === "dark";
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
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

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const handleToggleStatus = async (record: BillRecord) => {
    setUpdatingId(record.id);
    try {
      const nextStatus = !record.is_paid_status;
      const res = await fetch(`${getApiBaseUrl()}/api/v1/bills/${record.id}/status?is_paid=${nextStatus}`, {
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
        ? `http://${activeHostname}:8000` 
        : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000");

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
    if (!trend) return null;
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

      {isMobile ? (
        <div className="space-y-3 p-4">
          {filteredHistory.map((record) => (
            <div 
              key={record.id} 
              className="flex w-full rounded-2xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-lg"
            >
              <div className="flex-1 p-3.5 flex flex-col justify-between space-y-2 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-100 text-sm truncate">{record.provider_name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{record.utility_type || "Utility Bill"}</p>
                  </div>
                  
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-slate-200">
                      ₹ {Number(record.bill_amount || 0).toLocaleString("en-IN")}
                    </div>
                    <button
                      disabled={updatingId === record.id}
                      onClick={() => handleToggleStatus(record)}
                      className={`mt-1 rounded-full px-2 py-0.5 text-[9px] font-semibold transition-all cursor-pointer inline-block ${
                        record.is_paid_status
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {updatingId === record.id 
                        ? (t.updating || "Updating...") 
                        : record.is_paid_status 
                          ? (t.paid || "Paid") 
                          : (t.unpaid || "Unpaid")}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <span>{record.billing_month} {record.billing_year}</span>
                  <span>{record.units_consumed ? `${record.units_consumed} Units` : "-"}</span>
                </div>
              </div>

              <div className="flex flex-col border-l border-slate-800 w-18 text-[11px] font-medium shrink-0">
                <button
                  onClick={() => {
                    window.open(`${getApiBaseUrl()}/api/bills/${record.id}/view`, '_blank');
                  }}
                  className="flex-1 px-2 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-b border-slate-800 transition-all active:scale-95 flex items-center justify-center rounded-tr-2xl cursor-pointer"
                  title="View Bill"
                >
                  View
                </button>

                <button
                  onClick={() => onEditRecord?.(record)}
                  className="flex-1 px-2 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-b border-slate-800 transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                  title="Edit Record"
                >
                  Edit
                </button>

                <button
                  onClick={() => handleDelete(record.id)}
                  className="flex-1 px-2 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all active:scale-95 flex items-center justify-center rounded-br-2xl cursor-pointer"
                  title="Delete Record"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto w-full pb-2">
          <table className="w-full text-left text-xs table-auto">
            <thead
              className={`uppercase tracking-wider ${
                isDark ? "bg-slate-900/80 text-slate-400 border-b border-slate-800" : "bg-slate-50 text-slate-500 border-b border-slate-200"
              }`}
            >
              <tr>
                <th className="px-3 sm:px-5 py-3.5 font-semibold align-middle">{t.provider || "Provider"}</th>
                <th className="px-3 sm:px-5 py-3.5 font-semibold align-middle">Utility</th>
                <th className="px-3 sm:px-5 py-3.5 font-semibold align-middle">Billing Cycle</th>
                <th className="px-3 sm:px-5 py-3.5 font-semibold align-middle">{t.amount || "Amount"}</th>
                <th className="px-3 sm:px-5 py-3.5 font-semibold align-middle">Consumption</th>
                <th className="px-2 sm:px-3 py-3.5 font-semibold align-middle w-24">{t.status || "Status"}</th>
                <th className="px-0 py-0 font-semibold text-right align-middle w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-inherit">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 sm:px-6 py-8 text-center text-slate-500 text-xs align-middle">
                    No matching historical records found for this period.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((record, index) => {
                  const amountTrend = getTrendData(index, record, 'bill_amount');
                  const unitsTrend = getTrendData(index, record, 'units_consumed');

                  return (
                    <tr key={record.id} className={`transition-colors group ${isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}`}>
                      <td className="px-3 sm:px-5 py-3 align-middle">
                        <span className="font-bold">{record.provider_name}</span>
                        <span className="block text-[10px] text-slate-400">Due: {record.due_date || "N/A"}</span>
                      </td>
                      <td className="px-3 sm:px-5 py-3 align-middle text-slate-300 font-medium">{record.utility_type}</td>
                      
                      <td className="px-3 sm:px-5 py-3 align-middle text-slate-400 text-[11px]">
                        <span className="block font-semibold text-slate-300">{record.billing_month} {record.billing_year}</span>
                        {record.billing_period_start && record.billing_period_end ? (
                           <span>{record.billing_period_start} to {record.billing_period_end}</span>
                        ) : (
                           <span>Cycle unavailable</span>
                        )}
                      </td>
                      
                      <td className="px-3 sm:px-5 py-3 align-middle font-bold text-slate-200">
                        <div className="flex items-center">
                          <span>₹ {record.bill_amount?.toLocaleString("en-IN")}</span>
                          {renderTrendBadge(amountTrend)}
                        </div>
                      </td>
                      
                      <td className="px-3 sm:px-5 py-3 align-middle text-slate-300">
                        {record.units_consumed ? (
                          <div className="flex items-center space-x-1">
                            <span className="px-2 py-1 bg-slate-800 rounded-md text-[10px] font-bold text-slate-200">
                              {record.units_consumed} Units
                            </span>
                            {renderTrendBadge(unitsTrend)}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>

                      {/* Compact Paid status column */}
                      <td className="px-2 sm:px-3 py-3 align-middle">
                        <button
                          disabled={updatingId === record.id}
                          onClick={() => handleToggleStatus(record)}
                          className={`px-2.5 py-1 rounded-full font-semibold text-[10px] border transition-all cursor-pointer inline-block ${
                            record.is_paid_status
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20"
                          }`}
                        >
                          {updatingId === record.id ? "..." : record.is_paid_status ? (t.paid || "Paid") : (t.unpaid || "Unpaid")}
                        </button>
                      </td>

                      {/* Edge-to-edge icon action buttons */}
                      <td className="p-0 align-stretch text-right">
                        <div className="flex h-full items-stretch justify-end border-l border-inherit">
                          <button
                            onClick={() => {
                              window.open(`${getApiBaseUrl()}/api/bills/${record.id}/view`, '_blank');
                            }}
                            className="px-3 py-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-r border-inherit transition-all flex items-center justify-center cursor-pointer"
                            title="View Bill"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => onEditRecord?.(record)}
                            className="px-3 py-3 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-r border-inherit transition-all flex items-center justify-center cursor-pointer"
                            title="Edit Record"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDelete(record.id)}
                            className="px-3 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all flex items-center justify-center cursor-pointer"
                            title="Delete Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}